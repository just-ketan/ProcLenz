package com.proclenz.event;

import java.util.UUID;

/** Result of a single-event submission. For a duplicate, {@code eventId} is the ID of the event stored originally. */
public record EventIngestionResult(UUID eventId, IngestionOutcome status, String eventIdentity) {
}
