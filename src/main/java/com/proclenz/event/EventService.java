package com.proclenz.event;

import com.proclenz.common.ErrorCode;
import com.proclenz.common.ProclenzException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Single-event operations and the transactional boundary for chunk writes used by every bulk channel. */
@Service
public class EventService {
    private final EventNormalizer normalizer;
    private final EventWriter writer;
    private final ProcessEventRepository repository;

    public EventService(EventNormalizer normalizer, EventWriter writer, ProcessEventRepository repository) {
        this.normalizer = normalizer;
        this.writer = writer;
        this.repository = repository;
    }

    /** For a single event, invalid input and producer-ID conflicts are errors the caller must see. */
    @Transactional
    public EventIngestionResult ingest(EventRequest request) {
        NormalizedEvent event = switch (normalizer.normalize(request)) {
            case EventValidation.Valid valid -> valid.event();
            case EventValidation.Invalid invalid ->
                    throw new ProclenzException(ErrorCode.VALIDATION_FAILED, "Event validation failed", invalid.violations(), Map.of());
        };
        IngestionOutcome outcome = writer.write(List.of(event)).getFirst();
        return switch (outcome) {
            case ACCEPTED -> new EventIngestionResult(event.id(), outcome, event.identity());
            case DUPLICATE -> new EventIngestionResult(repository.findIdByEventIdentity(event.identity()).orElse(null), outcome, event.identity());
            case CONFLICT -> throw new ProclenzException(ErrorCode.EVENT_ID_CONFLICT,
                    "Event ID '%s' was already used for a different event in process '%s'".formatted(event.sourceEventId(), event.processKey()),
                    List.of(), Map.of("eventId", event.sourceEventId(), "processKey", event.processKey()));
        };
    }

    /** One chunk, one transaction: a failure rolls back this chunk only, and committed chunks replay as duplicates. */
    @Transactional
    public List<IngestionOutcome> writeChunk(List<NormalizedEvent> events) {
        return writer.write(events);
    }

    @Transactional(readOnly = true)
    public EventResponse find(UUID eventId) {
        return repository.findById(eventId)
                .map(EventResponse::from)
                .orElseThrow(() -> new ProclenzException(ErrorCode.EVENT_NOT_FOUND, "Event '%s' was not found".formatted(eventId)));
    }
}
