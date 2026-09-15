package com.proclenz.analytics.engine;

import java.util.Comparator;
import java.util.List;

/** Case-duration SLA compliance with the worst offenders and the variants that breach most often. */
public record SlaAnalysis(
        String processKey,
        long thresholdMs,
        String threshold,
        SlaThreshold.Source thresholdSource,
        long totalCases,
        long compliantCases,
        long violatingCases,
        double violationRatePercent,
        long avgDurationMs,
        long p95DurationMs,
        List<Violation> worstViolations,
        List<VariantCompliance> variantsByViolations) {

    static final int VARIANT_LIMIT = 5;

    public record Violation(String caseId, String variantId, long durationMs, long overByMs, double overByPercent) {
    }

    public record VariantCompliance(String variantId, List<String> activities, long cases, long violations, double violationRatePercent) {
    }

    public static SlaAnalysis of(String processKey, ProcessModel model, SlaThreshold sla, int worstLimit) {
        long threshold = sla.millis();
        long violating = model.caseDurations().countGreaterThan(threshold);
        List<Violation> worst = model.cases().stream()
                .filter(summary -> sla.isViolatedBy(summary.durationMs()))
                .sorted(Comparator.comparingLong(ProcessModel.CaseSummary::durationMs).reversed()
                        .thenComparing(ProcessModel.CaseSummary::caseId))
                .limit(worstLimit)
                .map(summary -> new Violation(summary.caseId(), summary.variantId(), summary.durationMs(),
                        summary.durationMs() - threshold, Metrics.percent(summary.durationMs() - threshold, threshold)))
                .toList();
        List<VariantCompliance> byVariant = model.variants().stream()
                .map(variant -> {
                    long violations = variant.durations().countGreaterThan(threshold);
                    return new VariantCompliance(variant.variantId(), variant.activities(), variant.caseCount(), violations,
                            Metrics.percent(violations, variant.caseCount()));
                })
                .filter(compliance -> compliance.violations() > 0)
                .sorted(Comparator.comparingLong(VariantCompliance::violations).reversed()
                        .thenComparing(VariantCompliance::variantId))
                .limit(VARIANT_LIMIT)
                .toList();
        return new SlaAnalysis(processKey, threshold, sla.threshold().toString(), sla.source(),
                model.caseCount(), model.caseCount() - violating, violating, Metrics.percent(violating, model.caseCount()),
                model.caseDurations().average(), model.caseDurations().percentile(95), worst, byVariant);
    }
}
