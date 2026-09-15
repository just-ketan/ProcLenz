package com.proclenz.event;

import com.proclenz.common.ApiError;
import com.proclenz.common.ErrorCode;
import com.proclenz.common.JsonErrorMessages;
import com.proclenz.common.ProclenzException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.NestedRuntimeException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.CannotCreateTransactionException;
import tools.jackson.core.exc.StreamReadException;
import tools.jackson.databind.DatabindException;
import tools.jackson.databind.MappingIterator;
import tools.jackson.databind.ObjectMapper;

/**
 * Streams a JSON array or NDJSON body item by item, so memory is bounded by one chunk regardless of
 * request size. Invalid items are rejected individually without failing the batch. Each chunk
 * commits in its own transaction; if the request is interrupted, the committed prefix remains and
 * resubmitting the entire batch is safe because writes are idempotent.
 */
@Service
public class BatchIngestionService {
    private static final Logger log = LoggerFactory.getLogger(BatchIngestionService.class);

    private final ObjectMapper objectMapper;
    private final EventNormalizer normalizer;
    private final EventService events;
    private final IngestionProperties properties;

    public BatchIngestionService(ObjectMapper objectMapper, EventNormalizer normalizer, EventService events, IngestionProperties properties) {
        this.objectMapper = objectMapper;
        this.normalizer = normalizer;
        this.events = events;
        this.properties = properties;
    }

    public BatchIngestionResult ingest(InputStream body) {
        UUID batchId = UUID.randomUUID();
        long startedAt = System.nanoTime();
        Tally tally = new Tally(properties.maxReportedRejections());
        PendingChunk chunk = new PendingChunk(properties.chunkSize());
        MappingIterator<EventRequest> items = objectMapper.readerFor(EventRequest.class).readValues(body);
        try {
            for (long index = 0; hasNextItem(items, batchId, tally, chunk); index++) {
                tally.received++;
                EventRequest request;
                try {
                    request = items.nextValue();
                } catch (StreamReadException syntaxError) {
                    throw abortOnMalformedJson(batchId, tally, chunk);
                } catch (DatabindException invalidItem) {
                    tally.reject(index, ErrorCode.MALFORMED_REQUEST, JsonErrorMessages.describe(invalidItem));
                    continue;
                }
                stage(request, index, tally, chunk);
                if (chunk.isFull()) flush(batchId, chunk, tally);
            }
            flush(batchId, chunk, tally);
        } finally {
            items.close();
        }
        BatchIngestionResult result = tally.toResult(batchId, (System.nanoTime() - startedAt) / 1_000_000);
        log.info("Batch {} ingested: received={} accepted={} duplicates={} conflicts={} rejected={} durationMs={}",
                batchId, result.received(), result.accepted(), result.duplicates(), result.conflicts(), result.rejected(), result.durationMs());
        return result;
    }

    private boolean hasNextItem(MappingIterator<EventRequest> items, UUID batchId, Tally tally, PendingChunk chunk) {
        try {
            return items.hasNextValue();
        } catch (StreamReadException syntaxError) {
            throw abortOnMalformedJson(batchId, tally, chunk);
        }
    }

    private void stage(EventRequest request, long index, Tally tally, PendingChunk chunk) {
        if (request == null) {
            tally.reject(index, ErrorCode.VALIDATION_FAILED, "Item must be a JSON object");
            return;
        }
        switch (normalizer.normalize(request)) {
            case EventValidation.Valid valid -> chunk.add(index, valid.event());
            case EventValidation.Invalid invalid -> tally.reject(index, ErrorCode.VALIDATION_FAILED, describe(invalid.violations()));
        }
    }

    private void flush(UUID batchId, PendingChunk chunk, Tally tally) {
        if (chunk.isEmpty()) return;
        List<IngestionOutcome> outcomes;
        try {
            outcomes = events.writeChunk(chunk.events());
        } catch (DataAccessResourceFailureException | TransientDataAccessException | CannotCreateTransactionException outage) {
            log.warn("Batch {} interrupted by a database outage after {} items: {}", batchId, tally.received,
                    ((NestedRuntimeException) outage).getMostSpecificCause().toString());
            throw new ProclenzException(ErrorCode.SERVICE_UNAVAILABLE,
                    "The database became unavailable and the batch was interrupted; resubmitting the whole batch is safe",
                    List.of(), tally.summary(batchId));
        }
        for (int i = 0; i < outcomes.size(); i++) {
            tally.record(chunk.indexes.get(i), outcomes.get(i), chunk.events.get(i));
        }
        chunk.clear();
    }

    /** Items parsed before the syntax error are still written, and the response says how far the batch got. */
    private ProclenzException abortOnMalformedJson(UUID batchId, Tally tally, PendingChunk chunk) {
        flush(batchId, chunk, tally);
        return new ProclenzException(ErrorCode.MALFORMED_REQUEST,
                "Request body is not valid JSON after item %d; items before it were processed".formatted(tally.received),
                List.of(), tally.summary(batchId));
    }

    private static String describe(List<ApiError.FieldError> violations) {
        return violations.stream().map(violation -> violation.field() + " " + violation.message()).collect(Collectors.joining("; "));
    }

    private static final class PendingChunk {
        private final int capacity;
        private final List<NormalizedEvent> events;
        private final List<Long> indexes;

        private PendingChunk(int capacity) {
            this.capacity = capacity;
            this.events = new ArrayList<>(capacity);
            this.indexes = new ArrayList<>(capacity);
        }

        private void add(long index, NormalizedEvent event) {
            indexes.add(index);
            events.add(event);
        }

        private boolean isFull() {
            return events.size() >= capacity;
        }

        private boolean isEmpty() {
            return events.isEmpty();
        }

        private List<NormalizedEvent> events() {
            return List.copyOf(events);
        }

        private void clear() {
            events.clear();
            indexes.clear();
        }
    }

    private static final class Tally {
        private final int maxReportedRejections;
        private final List<BatchIngestionResult.Rejection> rejections = new ArrayList<>();
        private long received;
        private long accepted;
        private long duplicates;
        private long conflicts;
        private long rejected;
        private boolean rejectionsTruncated;

        private Tally(int maxReportedRejections) {
            this.maxReportedRejections = maxReportedRejections;
        }

        private void reject(long index, ErrorCode code, String message) {
            rejected++;
            report(index, code, message);
        }

        private void record(long index, IngestionOutcome outcome, NormalizedEvent event) {
            switch (outcome) {
                case ACCEPTED -> accepted++;
                case DUPLICATE -> duplicates++;
                case CONFLICT -> {
                    conflicts++;
                    report(index, ErrorCode.EVENT_ID_CONFLICT, "Event ID '%s' was already used for a different event".formatted(event.sourceEventId()));
                }
            }
        }

        private void report(long index, ErrorCode code, String message) {
            if (rejections.size() < maxReportedRejections) rejections.add(new BatchIngestionResult.Rejection(index, code.name(), message));
            else rejectionsTruncated = true;
        }

        private Map<String, Object> summary(UUID batchId) {
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("batchId", batchId.toString());
            summary.put("received", received);
            summary.put("accepted", accepted);
            summary.put("duplicates", duplicates);
            summary.put("conflicts", conflicts);
            summary.put("rejected", rejected);
            return summary;
        }

        private BatchIngestionResult toResult(UUID batchId, long durationMs) {
            double eventsPerSecond = durationMs == 0 ? received : Math.round(received * 10_000.0 / durationMs) / 10.0;
            List<BatchIngestionResult.Rejection> ordered = rejections.stream()
                    .sorted(Comparator.comparingLong(BatchIngestionResult.Rejection::index))
                    .toList();
            return new BatchIngestionResult(batchId, received, accepted, duplicates, conflicts, rejected, durationMs,
                    eventsPerSecond, ordered, rejectionsTruncated);
        }
    }
}
