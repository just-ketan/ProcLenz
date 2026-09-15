package com.proclenz.analytics.engine;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Single-pass process discovery. Cases are fed one at a time (streamed from the database ordered by
 * case and time), so memory is bounded by the number of distinct activities, transitions, variants
 * and one summary per case, never by the number of events.
 */
public final class ProcessMiner {
    /** Loops longer than this are grouped as [activity, ..., activity] to keep loop groups meaningful. */
    static final int MAX_LOOP_PATH_LENGTH = 8;

    private final Map<String, ActivityAccumulator> activities = new HashMap<>();
    private final Map<Transition, TransitionAccumulator> transitions = new HashMap<>();
    private final Map<String, VariantAccumulator> variants = new HashMap<>();
    private final Map<List<String>, LongSamples> loops = new HashMap<>();
    private final List<ProcessModel.CaseSummary> cases = new ArrayList<>();
    private final LongSamples caseDurations = new LongSamples();
    private long eventCount;
    private long casesWithRework;
    private Instant firstEventAt;
    private Instant lastEventAt;

    public void accept(CaseTrace trace) {
        eventCount += trace.size();
        if (firstEventAt == null || trace.startedAt().isBefore(firstEventAt)) firstEventAt = trace.startedAt();
        if (lastEventAt == null || trace.endedAt().isAfter(lastEventAt)) lastEventAt = trace.endedAt();

        Set<String> activitiesInCase = new HashSet<>();
        Set<Transition> transitionsInCase = new HashSet<>();
        Set<String> reworkedInCase = new HashSet<>();
        for (int i = 0; i < trace.size(); i++) {
            ActivityAccumulator activity = activities.computeIfAbsent(trace.activity(i), ActivityAccumulator::new);
            activity.occurrences++;
            if (activitiesInCase.add(activity.name)) activity.cases++;
            if (i == 0) activity.starts++;
            if (i == trace.size() - 1) activity.ends++;
            if (i > 0) recordTransition(trace, i, activity, transitionsInCase);
            if (trace.isRepeat(i)) recordRework(trace, i, activity, reworkedInCase);
        }
        if (!reworkedInCase.isEmpty()) casesWithRework++;

        variants.computeIfAbsent(trace.variantId(), id -> new VariantAccumulator(id, trace.activities()))
                .durations.add(trace.durationMs());
        caseDurations.add(trace.durationMs());
        cases.add(new ProcessModel.CaseSummary(trace.caseId(), trace.variantId(), trace.size(), trace.durationMs(), trace.repeatCount()));
    }

    public ProcessModel build() {
        List<ProcessModel.ActivityStats> activityStats = activities.values().stream()
                .map(ActivityAccumulator::freeze)
                .sorted(Comparator.comparingLong(ProcessModel.ActivityStats::occurrences).reversed()
                        .thenComparing(ProcessModel.ActivityStats::activity))
                .toList();
        List<ProcessModel.TransitionStats> transitionStats = transitions.values().stream()
                .map(TransitionAccumulator::freeze)
                .sorted(Comparator.comparingLong(ProcessModel.TransitionStats::count).reversed()
                        .thenComparing(ProcessModel.TransitionStats::from)
                        .thenComparing(ProcessModel.TransitionStats::to))
                .toList();
        List<ProcessModel.VariantStats> variantStats = variants.values().stream()
                .map(variant -> new ProcessModel.VariantStats(variant.id, variant.activities, variant.durations.freeze()))
                .sorted(Comparator.comparingLong(ProcessModel.VariantStats::caseCount).reversed()
                        .thenComparing(ProcessModel.VariantStats::variantId))
                .toList();
        List<ProcessModel.LoopStats> loopStats = loops.entrySet().stream()
                .map(entry -> new ProcessModel.LoopStats(entry.getKey(), entry.getValue().freeze()))
                .sorted(Comparator.comparingLong((ProcessModel.LoopStats loop) -> loop.durations().size()).reversed()
                        .thenComparing(loop -> String.join("|", loop.path())))
                .toList();
        return new ProcessModel(cases.size(), eventCount, casesWithRework, firstEventAt, lastEventAt,
                caseDurations.freeze(), activityStats, transitionStats, variantStats, loopStats, List.copyOf(cases));
    }

    private void recordTransition(CaseTrace trace, int index, ActivityAccumulator target, Set<Transition> transitionsInCase) {
        long wait = trace.waitMs(index);
        target.incomingWaits.add(wait);
        Transition key = new Transition(trace.activity(index - 1), trace.activity(index));
        TransitionAccumulator transition = transitions.computeIfAbsent(key, TransitionAccumulator::new);
        transition.waits.add(wait);
        if (transitionsInCase.add(key)) transition.cases++;
        if (trace.isRepeat(index)) transition.reworkCount++;
    }

    private void recordRework(CaseTrace trace, int index, ActivityAccumulator activity, Set<String> reworkedInCase) {
        int previous = trace.previousOccurrence(index);
        long loopMs = trace.millisBetween(previous, index);
        activity.repeats++;
        activity.reworkTimeMs += loopMs;
        if (reworkedInCase.add(activity.name)) activity.reworkCases++;
        loops.computeIfAbsent(loopPath(trace, previous, index), path -> new LongSamples()).add(loopMs);
    }

    private static List<String> loopPath(CaseTrace trace, int fromIndex, int toIndex) {
        List<String> path = trace.activities().subList(fromIndex, toIndex + 1);
        if (path.size() <= MAX_LOOP_PATH_LENGTH) return List.copyOf(path);
        return List.of(path.getFirst(), "...", path.getLast());
    }

    private record Transition(String from, String to) {
    }

    private static final class ActivityAccumulator {
        private final String name;
        private final LongSamples incomingWaits = new LongSamples();
        private long occurrences;
        private long cases;
        private long starts;
        private long ends;
        private long repeats;
        private long reworkCases;
        private long reworkTimeMs;

        private ActivityAccumulator(String name) {
            this.name = name;
        }

        private ProcessModel.ActivityStats freeze() {
            return new ProcessModel.ActivityStats(name, occurrences, cases, starts, ends, incomingWaits.freeze(), repeats, reworkCases, reworkTimeMs);
        }
    }

    private static final class TransitionAccumulator {
        private final Transition key;
        private final LongSamples waits = new LongSamples();
        private long cases;
        private long reworkCount;

        private TransitionAccumulator(Transition key) {
            this.key = key;
        }

        private ProcessModel.TransitionStats freeze() {
            return new ProcessModel.TransitionStats(key.from(), key.to(), cases, waits.freeze(), reworkCount);
        }
    }

    private static final class VariantAccumulator {
        private final String id;
        private final List<String> activities;
        private final LongSamples durations = new LongSamples();

        private VariantAccumulator(String id, List<String> activities) {
            this.id = id;
            this.activities = activities;
        }
    }
}
