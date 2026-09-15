package com.proclenz.event;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "process_events", uniqueConstraints = @UniqueConstraint(name = "uk_event_identity", columnNames = "event_identity"), indexes = {
        @Index(name = "idx_event_case_time", columnList = "process_key,case_id,occurred_at"),
        @Index(name = "idx_event_process_time", columnList = "process_key,occurred_at"),
        @Index(name = "idx_event_activity", columnList = "process_key,activity")
})
public class ProcessEvent {
    @Id private UUID id;
    @Column(name = "process_key", nullable = false, length = 100) private String processKey;
    @Column(name = "case_id", nullable = false, length = 200) private String caseId;
    @Column(nullable = false, length = 200) private String activity;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(length = 200) private String resource;
    @Column(name = "event_identity", nullable = false, updatable = false, length = 64) private String eventIdentity;

    protected ProcessEvent() { }
    public ProcessEvent(UUID id, String processKey, String caseId, String activity, Instant occurredAt, String resource, String eventIdentity) {
        this.id = id; this.processKey = processKey; this.caseId = caseId; this.activity = activity;
        this.occurredAt = occurredAt; this.resource = resource; this.eventIdentity = eventIdentity;
    }
    public UUID getId() { return id; }
    public String getProcessKey() { return processKey; }
    public String getCaseId() { return caseId; }
    public String getActivity() { return activity; }
    public Instant getOccurredAt() { return occurredAt; }
    public String getResource() { return resource; }
    public String getEventIdentity() { return eventIdentity; }
}
