package com.proclenz.event;

import jakarta.validation.Valid;
import java.io.InputStream;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/events")
public class EventController {
    private final EventService events;
    private final BatchIngestionService batchIngestion;

    public EventController(EventService events, BatchIngestionService batchIngestion) {
        this.events = events;
        this.batchIngestion = batchIngestion;
    }

    /** 201 Created for a new event; 200 OK for an idempotent replay, because the client's intent is already satisfied. */
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<EventIngestionResult> ingest(@Valid @RequestBody EventRequest request) {
        EventIngestionResult result = events.ingest(request);
        if (result.status() == IngestionOutcome.ACCEPTED) {
            return ResponseEntity.created(URI.create("/api/v1/events/" + result.eventId())).body(result);
        }
        return ResponseEntity.ok(result);
    }

    /** Accepts a JSON array or NDJSON stream of any size; the body is read incrementally, never buffered whole. */
    @PostMapping(path = "/batch", consumes = {MediaType.APPLICATION_JSON_VALUE, MediaType.APPLICATION_NDJSON_VALUE})
    public BatchIngestionResult ingestBatch(InputStream body) {
        return batchIngestion.ingest(body);
    }

    @GetMapping("/{eventId}")
    public EventResponse event(@PathVariable UUID eventId) {
        return events.find(eventId);
    }
}
