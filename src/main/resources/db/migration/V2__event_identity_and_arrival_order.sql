-- Arrival order: deterministic tie-break for events of one case that share a timestamp.
ALTER TABLE process_events ADD COLUMN ingest_seq BIGINT GENERATED ALWAYS AS IDENTITY;

-- When ProcLenz accepted the event, as opposed to occurred_at (when it happened in the source system).
ALTER TABLE process_events ADD COLUMN ingested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- Producer-supplied event ID, when the source system has one. It becomes the idempotency key.
ALTER TABLE process_events ADD COLUMN source_event_id VARCHAR(200);

-- SHA-256 of the canonical event content. Rows written before this migration were identified by content
-- alone, so their identity is their content hash. Lets a replayed producer event ID be compared with the
-- payload it was first stored with.
ALTER TABLE process_events ADD COLUMN content_hash VARCHAR(64);
UPDATE process_events SET content_hash = event_identity;
ALTER TABLE process_events ALTER COLUMN content_hash SET NOT NULL;
