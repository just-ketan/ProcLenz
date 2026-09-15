package com.proclenz.analytics.engine;

import java.util.Comparator;
import java.util.List;

/**
 * Rework: an activity executed again within the same case. Detection is structural (a repeated
 * activity name), not keyword-based, so it works for any process vocabulary. Time lost is measured
 * from the previous occurrence of the activity to its repeat.
 */
public record ReworkAnalysis(
        String processKey,
        long totalCases,
        long casesWithRework,
        double reworkRatePercent,
        long totalRepeatOccurrences,
        long totalReworkTimeMs,
        List<ActivityRework> activities,
        List<Loop> loops) {

    public record ActivityRework(
            String activity,
            long affectedCases,
            double affectedCasePercent,
            long repeatOccurrences,
            double avgRepeatsPerAffectedCase,
            long totalReworkTimeMs,
            long avgReworkTimePerAffectedCaseMs) {
    }

    /** A concrete loop such as [Inventory Check, Rework Required, Inventory Check]. */
    public record Loop(String activity, List<String> path, long occurrences, long avgLoopDurationMs, long p95LoopDurationMs) {
    }

    public static ReworkAnalysis of(String processKey, ProcessModel model, int loopLimit) {
        List<ActivityRework> activities = model.activities().stream()
                .filter(activity -> activity.repeatOccurrences() > 0)
                .sorted(Comparator.comparingLong(ProcessModel.ActivityStats::reworkCases).reversed()
                        .thenComparing(Comparator.comparingLong(ProcessModel.ActivityStats::repeatOccurrences).reversed())
                        .thenComparing(ProcessModel.ActivityStats::activity))
                .map(activity -> new ActivityRework(activity.activity(), activity.reworkCases(),
                        Metrics.percent(activity.reworkCases(), model.caseCount()), activity.repeatOccurrences(),
                        Metrics.round2((double) activity.repeatOccurrences() / activity.reworkCases()),
                        activity.reworkTimeMs(), activity.reworkTimeMs() / activity.reworkCases()))
                .toList();
        List<Loop> loops = model.loops().stream()
                .limit(loopLimit)
                .map(loop -> new Loop(loop.activity(), loop.path(), loop.durations().size(),
                        loop.durations().average(), loop.durations().percentile(95)))
                .toList();
        long totalRepeats = activities.stream().mapToLong(ActivityRework::repeatOccurrences).sum();
        long totalReworkTime = activities.stream().mapToLong(ActivityRework::totalReworkTimeMs).sum();
        return new ReworkAnalysis(processKey, model.caseCount(), model.casesWithRework(),
                Metrics.percent(model.casesWithRework(), model.caseCount()), totalRepeats, totalReworkTime, activities, loops);
    }
}
