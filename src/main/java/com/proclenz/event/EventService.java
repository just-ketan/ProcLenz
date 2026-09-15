package com.proclenz.event;

import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EventService {
    private static final String DEFAULT_PROCESS = "default";
    private final ProcessEventRepository repository;
    public EventService(ProcessEventRepository repository) { this.repository = repository; }

    /** Each event has its own transaction so one malformed batch item cannot roll back valid siblings. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public EventIngestionResult ingest(@Valid EventRequest request) {
        String processKey = normaliseProcessKey(request.processKey());
        String identity = EventIdentity.of(processKey, request);
        if (repository.existsByEventIdentity(identity)) return new EventIngestionResult(null, "DUPLICATE", identity);
        try {
            ProcessEvent event = repository.saveAndFlush(new ProcessEvent(UUID.randomUUID(), processKey, request.caseId().trim(),
                    request.activity().trim(), request.timestamp(), normaliseNullable(request.resource()), identity));
            return new EventIngestionResult(event.getId(), "ACCEPTED", identity);
        } catch (DataIntegrityViolationException exception) {
            // The unique index is the final authority when concurrent requests race after existsBy... .
            return new EventIngestionResult(null, "DUPLICATE", identity);
        }
    }
    public String normaliseProcessKey(String key) { return key == null || key.isBlank() ? DEFAULT_PROCESS : key.trim(); }
    private String normaliseNullable(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
