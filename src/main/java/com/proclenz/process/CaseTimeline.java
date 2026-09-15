package com.proclenz.process;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A single case reconstructed from its events, as shown in an investigation or demo. */
public record CaseTimeline(
        String processKey,
        String caseId,
        String variantId,
        int eventCount,
        Instant startedAt,
        Instant endedAt,
        long durationMs,
        List<String> reworkActivities,
        List<Event> events) {

    /**
     * @param deltaFromPreviousMs waiting time since the previous event of the case
     * @param elapsedMs           time since the first event of the case
     * @param rework              the activity already occurred earlier in this case
     */
    public record Event(int sequence, UUID eventId, String activity, Instant timestamp, String resource,
                        long deltaFromPreviousMs, long elapsedMs, boolean rework) {
    }
}
