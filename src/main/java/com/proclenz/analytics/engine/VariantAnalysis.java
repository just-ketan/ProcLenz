package com.proclenz.analytics.engine;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

/**
 * Process variants: cases grouped by their exact activity sequence, most frequent first. The
 * cumulative case percentage exposes the Pareto shape ("the top 3 variants cover 80% of cases").
 */
public record VariantAnalysis(
        String processKey,
        long totalCases,
        int totalVariants,
        long slaThresholdMs,
        int page,
        int size,
        int totalPages,
        List<Variant> variants) {

    public record Variant(
            int rank,
            String variantId,
            List<String> activities,
            String sequence,
            int activityCount,
            boolean containsRework,
            long caseCount,
            double casePercent,
            double cumulativeCasePercent,
            long avgDurationMs,
            long medianDurationMs,
            long p95DurationMs,
            long slaViolations,
            double slaViolationRatePercent) {
    }

    public static VariantAnalysis of(String processKey, ProcessModel model, SlaThreshold sla, int page, int size) {
        if (page < 0 || size < 1) throw new IllegalArgumentException("page must be >= 0 and size >= 1");
        List<ProcessModel.VariantStats> ordered = model.variants();
        int from = (int) Math.min((long) page * size, ordered.size());
        int to = Math.min(from + size, ordered.size());

        long cumulativeCases = 0;
        for (int i = 0; i < from; i++) cumulativeCases += ordered.get(i).caseCount();

        List<Variant> variants = new ArrayList<>(to - from);
        for (int i = from; i < to; i++) {
            ProcessModel.VariantStats variant = ordered.get(i);
            LongSamples durations = variant.durations();
            cumulativeCases += variant.caseCount();
            long violations = durations.countGreaterThan(sla.millis());
            variants.add(new Variant(i + 1, variant.variantId(), variant.activities(), String.join(" → ", variant.activities()),
                    variant.activities().size(), hasRepeatedActivity(variant.activities()),
                    variant.caseCount(), Metrics.percent(variant.caseCount(), model.caseCount()), Metrics.percent(cumulativeCases, model.caseCount()),
                    durations.average(), durations.median(), durations.percentile(95),
                    violations, Metrics.percent(violations, variant.caseCount())));
        }
        int totalPages = (int) Math.ceil((double) ordered.size() / size);
        return new VariantAnalysis(processKey, model.caseCount(), ordered.size(), sla.millis(), page, size, totalPages, variants);
    }

    private static boolean hasRepeatedActivity(List<String> activities) {
        return new HashSet<>(activities).size() < activities.size();
    }
}
