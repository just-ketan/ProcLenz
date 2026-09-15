package com.proclenz.analytics;

import com.proclenz.analytics.engine.CaseTrace;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Turns rows arriving ordered by case into complete {@link CaseTrace}s, holding only the current
 * case in memory. Rows of one case must be contiguous, which the {@code ORDER BY case_id} guarantees.
 */
final class CaseTraceAssembler {
    private final Consumer<CaseTrace> consumer;
    private final List<String> activities = new ArrayList<>();
    private final List<Instant> timestamps = new ArrayList<>();
    private String currentCaseId;
    private long emittedCases;

    CaseTraceAssembler(Consumer<CaseTrace> consumer) {
        this.consumer = consumer;
    }

    void add(String caseId, String activity, Instant timestamp) {
        if (!caseId.equals(currentCaseId)) {
            emitCurrentCase();
            currentCaseId = caseId;
        }
        activities.add(activity);
        timestamps.add(timestamp);
    }

    /** Emits the final case and returns how many cases were emitted in total. */
    long finish() {
        emitCurrentCase();
        return emittedCases;
    }

    private void emitCurrentCase() {
        if (currentCaseId == null) return;
        consumer.accept(new CaseTrace(currentCaseId, activities, timestamps));
        emittedCases++;
        activities.clear();
        timestamps.clear();
        currentCaseId = null;
    }
}
