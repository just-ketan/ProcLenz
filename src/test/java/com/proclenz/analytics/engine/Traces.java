package com.proclenz.analytics.engine;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** Compact builders for engine tests. */
final class Traces {
    static final Instant BASE = Instant.parse("2026-09-15T09:00:00Z");
    static final SlaThreshold SLA_4H = new SlaThreshold(Duration.ofHours(4), SlaThreshold.Source.REQUEST);

    private Traces() {
    }

    /** {@code trace("ORD-1", "Created", 0, "Approved", 14)}: activities paired with minute offsets from {@link #BASE}. */
    static CaseTrace trace(String caseId, Object... activityMinutePairs) {
        List<String> activities = new ArrayList<>();
        List<Instant> timestamps = new ArrayList<>();
        for (int i = 0; i < activityMinutePairs.length; i += 2) {
            activities.add((String) activityMinutePairs[i]);
            timestamps.add(BASE.plus(Duration.ofMinutes(((Number) activityMinutePairs[i + 1]).longValue())));
        }
        return new CaseTrace(caseId, activities, timestamps);
    }

    static ProcessModel mine(CaseTrace... traces) {
        return mine(List.of(traces));
    }

    static ProcessModel mine(List<CaseTrace> traces) {
        ProcessMiner miner = new ProcessMiner();
        traces.forEach(miner::accept);
        return miner.build();
    }

    static long minutes(long minutes) {
        return Duration.ofMinutes(minutes).toMillis();
    }

    /** The order from the product brief: 09:00 → 11:20 with one inventory rework loop. */
    static CaseTrace ord1001() {
        return trace("ORD-1001",
                "Order Created", 0,
                "Order Approved", 14,
                "Inventory Checked", 90,
                "Rework Required", 102,
                "Inventory Checked", 125,
                "Order Shipped", 140);
    }
}
