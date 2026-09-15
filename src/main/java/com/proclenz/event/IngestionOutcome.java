package com.proclenz.event;

/** What happened when a valid event was written. */
public enum IngestionOutcome {
    /** Newly persisted. */
    ACCEPTED,
    /** Identical to an event already stored: an idempotent replay, safe to ignore. */
    DUPLICATE,
    /** The producer event ID is already stored with different content: the producer reused an ID. */
    CONFLICT
}
