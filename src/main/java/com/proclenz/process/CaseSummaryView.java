package com.proclenz.process;

import java.time.Instant;

/** One row of the case list, aggregated in PostgreSQL. {@code variantId} matches the engine's variant IDs. */
public record CaseSummaryView(String caseId, long eventCount, Instant startedAt, Instant endedAt, long durationMs, String variantId) {
}
