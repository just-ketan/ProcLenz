package com.proclenz.analytics.engine;

import java.time.Instant;

/** Headline process metrics for dashboards and first-look triage. */
public record ProcessSummary(
        String processKey,
        long caseCount,
        long eventCount,
        int activityCount,
        int variantCount,
        Instant firstEventAt,
        Instant lastEventAt,
        double avgEventsPerCase,
        long avgCaseDurationMs,
        long medianCaseDurationMs,
        long p95CaseDurationMs,
        long maxCaseDurationMs,
        double topVariantCasePercent,
        long casesWithRework,
        double reworkRatePercent,
        SlaStatus sla) {

    public record SlaStatus(long thresholdMs, String threshold, SlaThreshold.Source source, long violatingCases, double violationRatePercent) {
        static SlaStatus of(ProcessModel model, SlaThreshold sla) {
            long violating = model.caseDurations().countGreaterThan(sla.millis());
            return new SlaStatus(sla.millis(), sla.threshold().toString(), sla.source(), violating, Metrics.percent(violating, model.caseCount()));
        }
    }

    public static ProcessSummary of(String processKey, ProcessModel model, SlaThreshold sla) {
        LongSamples durations = model.caseDurations();
        long topVariantCases = model.variants().isEmpty() ? 0 : model.variants().getFirst().caseCount();
        double eventsPerCase = model.caseCount() == 0 ? 0 : Metrics.round2((double) model.eventCount() / model.caseCount());
        return new ProcessSummary(processKey, model.caseCount(), model.eventCount(), model.activities().size(), model.variants().size(),
                model.firstEventAt(), model.lastEventAt(), eventsPerCase,
                durations.average(), durations.median(), durations.percentile(95), durations.max(),
                Metrics.percent(topVariantCases, model.caseCount()), model.casesWithRework(),
                Metrics.percent(model.casesWithRework(), model.caseCount()), SlaStatus.of(model, sla));
    }
}
