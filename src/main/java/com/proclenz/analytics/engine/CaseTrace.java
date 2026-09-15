package com.proclenz.analytics.engine;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * The chronologically ordered events of one case: the unit of process mining.
 *
 * <p>Events carry a single completion timestamp (no start/complete lifecycle). The time attributed
 * to reaching an activity is therefore the gap since the preceding event of the same case; this is
 * the "waiting time" used throughout the engine.
 */
public final class CaseTrace {
    private final String caseId;
    private final List<String> activities;
    private final List<Instant> timestamps;
    private final int[] previousOccurrence;
    private String variantId;

    public CaseTrace(String caseId, List<String> activities, List<Instant> timestamps) {
        if (activities.isEmpty() || activities.size() != timestamps.size()) {
            throw new IllegalArgumentException("Case " + caseId + " needs at least one event and one timestamp per activity");
        }
        for (int i = 1; i < timestamps.size(); i++) {
            if (timestamps.get(i).isBefore(timestamps.get(i - 1))) {
                throw new IllegalArgumentException("Events of case " + caseId + " are not in chronological order");
            }
        }
        this.caseId = caseId;
        this.activities = List.copyOf(activities);
        this.timestamps = List.copyOf(timestamps);
        this.previousOccurrence = indexPreviousOccurrences(this.activities);
    }

    public String caseId() {
        return caseId;
    }

    public int size() {
        return activities.size();
    }

    public String activity(int index) {
        return activities.get(index);
    }

    public Instant timestamp(int index) {
        return timestamps.get(index);
    }

    public List<String> activities() {
        return activities;
    }

    public Instant startedAt() {
        return timestamps.getFirst();
    }

    public Instant endedAt() {
        return timestamps.getLast();
    }

    /** Case duration: last timestamp minus first timestamp. A single-event case lasts 0 ms. */
    public long durationMs() {
        return millisBetween(0, size() - 1);
    }

    /** Waiting time before the event at {@code index}; 0 for the first event. */
    public long waitMs(int index) {
        return index == 0 ? 0 : millisBetween(index - 1, index);
    }

    public long millisBetween(int fromIndex, int toIndex) {
        return Duration.between(timestamps.get(fromIndex), timestamps.get(toIndex)).toMillis();
    }

    /** True when the activity at {@code index} already occurred earlier in this case (rework). */
    public boolean isRepeat(int index) {
        return previousOccurrence[index] >= 0;
    }

    /** Index of the previous occurrence of the same activity, or -1 on first occurrence. */
    public int previousOccurrence(int index) {
        return previousOccurrence[index];
    }

    public int repeatCount() {
        int repeats = 0;
        for (int previous : previousOccurrence) {
            if (previous >= 0) repeats++;
        }
        return repeats;
    }

    /** Distinct activities that were repeated, in the order their first repeat happened. */
    public List<String> reworkActivities() {
        LinkedHashSet<String> reworked = new LinkedHashSet<>();
        for (int i = 0; i < size(); i++) {
            if (isRepeat(i)) reworked.add(activities.get(i));
        }
        return List.copyOf(reworked);
    }

    public String variantId() {
        if (variantId == null) variantId = VariantId.of(activities);
        return variantId;
    }

    private static int[] indexPreviousOccurrences(List<String> activities) {
        int[] previous = new int[activities.size()];
        Map<String, Integer> lastSeen = new HashMap<>();
        for (int i = 0; i < activities.size(); i++) {
            Integer last = lastSeen.put(activities.get(i), i);
            previous[i] = last == null ? -1 : last;
        }
        return previous;
    }
}
