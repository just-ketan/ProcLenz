package com.proclenz.analytics.engine;

import java.time.Duration;

/**
 * Maximum acceptable case duration and where the value came from. A case violates the SLA when its
 * duration is strictly greater than the threshold; a case finishing exactly on the threshold complies.
 */
public record SlaThreshold(Duration threshold, Source source) {

    public enum Source {
        /** Supplied on the API request, e.g. {@code ?sla=P2D}. */
        REQUEST,
        /** Configured on the process definition. */
        PROCESS,
        /** Platform default from {@code proclenz.analytics.default-sla}. */
        DEFAULT
    }

    public SlaThreshold {
        if (threshold == null || threshold.isNegative() || threshold.isZero()) {
            throw new IllegalArgumentException("SLA threshold must be a positive duration");
        }
        if (source == null) throw new IllegalArgumentException("SLA threshold source is required");
    }

    public long millis() {
        return threshold.toMillis();
    }

    public boolean isViolatedBy(long durationMs) {
        return durationMs > millis();
    }
}
