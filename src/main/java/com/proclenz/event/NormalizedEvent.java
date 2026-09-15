package com.proclenz.event;

import java.time.Instant;
import java.util.UUID;

/** A validated event in canonical form, ready to be written. Only {@link EventNormalizer} creates these. */
public record NormalizedEvent(
        UUID id,
        String processKey,
        String caseId,
        String activity,
        Instant occurredAt,
        String resource,
        String sourceEventId,
        String contentHash,
        String identity) {
}
