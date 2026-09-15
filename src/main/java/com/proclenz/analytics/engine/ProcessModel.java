package com.proclenz.analytics.engine;

import java.time.Instant;
import java.util.List;

/**
 * Immutable aggregate produced by {@link ProcessMiner} in a single pass over a process's cases.
 * Every analysis (variants, rework, bottlenecks, SLA, graph, insights) is a projection of this model.
 * All {@link LongSamples} are frozen, so a model is safe to share between threads.
 */
public record ProcessModel(
        long caseCount,
        long eventCount,
        long casesWithRework,
        Instant firstEventAt,
        Instant lastEventAt,
        LongSamples caseDurations,
        List<ActivityStats> activities,
        List<TransitionStats> transitions,
        List<VariantStats> variants,
        List<LoopStats> loops,
        List<CaseSummary> cases) {

    /**
     * @param incomingWaits waiting time before each occurrence of the activity (excludes case starts)
     * @param reworkTimeMs  total time from a previous occurrence to each repeat of the activity
     */
    public record ActivityStats(String activity, long occurrences, long caseCount, long startCount, long endCount,
                                LongSamples incomingWaits, long repeatOccurrences, long reworkCases, long reworkTimeMs) {
    }

    /** Directly-follows relation {@code from → to}. {@code reworkCount} counts moves back to an already visited activity. */
    public record TransitionStats(String from, String to, long caseCount, LongSamples waits, long reworkCount) {
        public long count() {
            return waits.size();
        }
    }

    public record VariantStats(String variantId, List<String> activities, LongSamples durations) {
        public long caseCount() {
            return durations.size();
        }
    }

    /** A rework loop: the path from an activity back to its next occurrence, e.g. [Check, Rework, Check]. */
    public record LoopStats(List<String> path, LongSamples durations) {
        public String activity() {
            return path.getFirst();
        }
    }

    public record CaseSummary(String caseId, String variantId, int eventCount, long durationMs, int repeatCount) {
    }

    public boolean isEmpty() {
        return caseCount == 0;
    }

    public long totalWaitMs() {
        return transitions.stream().mapToLong(transition -> transition.waits().sum()).sum();
    }
}
