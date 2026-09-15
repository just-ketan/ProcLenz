package com.proclenz.event;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.Immutable;

/**
 * Read model of one stored event. Events are append-only: they are written through
 * {@link EventWriter} and never updated, so the entity is {@link Immutable} (Hibernate skips dirty
 * checking). The schema, including indexes and constraints, is owned by Flyway.
 */
@Entity
@Immutable
@Table(name = "process_events")
public class ProcessEvent {
    @Id
    private UUID id;

    @Column(name = "process_key", nullable = false, length = 100)
    private String processKey;

    @Column(name = "case_id", nullable = false, length = 200)
    private String caseId;

    @Column(nullable = false, length = 200)
    private String activity;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(length = 200)
    private String resource;

    @Column(name = "source_event_id", length = 200)
    private String sourceEventId;

    @Column(name = "content_hash", nullable = false, length = 64)
    private String contentHash;

    @Column(name = "event_identity", nullable = false, length = 64)
    private String eventIdentity;

    @Column(name = "ingest_seq", nullable = false, insertable = false, updatable = false)
    private long ingestSeq;

    @Column(name = "ingested_at", nullable = false, insertable = false, updatable = false)
    private Instant ingestedAt;

    protected ProcessEvent() {
    }

    public ProcessEvent(UUID id, String processKey, String caseId, String activity, Instant occurredAt, String resource, String eventIdentity) {
        this.id = id;
        this.processKey = processKey;
        this.caseId = caseId;
        this.activity = activity;
        this.occurredAt = occurredAt;
        this.resource = resource;
        this.eventIdentity = eventIdentity;
        this.contentHash = eventIdentity;
    }

    public UUID getId() {
        return id;
    }

    public String getProcessKey() {
        return processKey;
    }

    public String getCaseId() {
        return caseId;
    }

    public String getActivity() {
        return activity;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public String getResource() {
        return resource;
    }

    public String getSourceEventId() {
        return sourceEventId;
    }

    public String getContentHash() {
        return contentHash;
    }

    public String getEventIdentity() {
        return eventIdentity;
    }

    public long getIngestSeq() {
        return ingestSeq;
    }

    public Instant getIngestedAt() {
        return ingestedAt;
    }
}
