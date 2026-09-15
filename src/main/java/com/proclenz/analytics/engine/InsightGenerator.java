package com.proclenz.analytics.engine;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Deterministic rule-based insights: the final pipeline step, turning metrics into statements a
 * process owner can act on. Thresholds are explicit constants so every finding is explainable and
 * reproducible; nothing here is statistical guesswork.
 */
public final class InsightGenerator {
    static final double BOTTLENECK_MIN_WAIT_SHARE_PERCENT = 10;
    static final double SLA_MIN_VIOLATION_PERCENT = 5;
    static final double REWORK_MIN_AFFECTED_PERCENT = 5;
    static final double SKIP_MIN_COVERAGE_PERCENT = 70;
    static final double SKIP_MIN_SKIPPED_PERCENT = 2;
    static final int SKIP_MAX_INSIGHTS = 3;
    static final int FRAGMENTATION_MIN_VARIANTS = 5;
    static final double FRAGMENTATION_MAX_TOP_VARIANT_PERCENT = 40;

    private InsightGenerator() {
    }

    public static InsightReport generate(String processKey, ProcessModel model, SlaThreshold sla) {
        List<ProcessInsight> insights = new ArrayList<>();
        if (!model.isEmpty()) {
            bottleneck(processKey, model).ifPresent(insights::add);
            slaRisk(processKey, model, sla).ifPresent(insights::add);
            reworkHotspot(processKey, model).ifPresent(insights::add);
            insights.addAll(skippedActivities(model));
            fragmentation(model).ifPresent(insights::add);
        }
        insights.sort(Comparator.comparing(ProcessInsight::severity).thenComparing(ProcessInsight::type));
        return new InsightReport(processKey, model.caseCount(), sla.millis(), List.copyOf(insights));
    }

    /**
     * Something always ranks first, so the top transition is only reported when its share of waiting
     * time is disproportionate: at least 10% and at least twice what an even split would give it.
     */
    private static Optional<ProcessInsight> bottleneck(String processKey, ProcessModel model) {
        BottleneckAnalysis analysis = BottleneckAnalysis.of(processKey, model, 1);
        if (analysis.bottlenecks().isEmpty()) return Optional.empty();
        BottleneckAnalysis.Bottleneck top = analysis.bottlenecks().getFirst();
        double evenSplitPercent = 100.0 / analysis.transitionsAnalyzed();
        if (top.waitSharePercent() < Math.max(BOTTLENECK_MIN_WAIT_SHARE_PERCENT, 2 * evenSplitPercent)) return Optional.empty();
        return Optional.of(new ProcessInsight(ProcessInsight.Type.BOTTLENECK, top.severity(),
                "Bottleneck between '%s' and '%s'".formatted(top.fromActivity(), top.toActivity()),
                "%s%% of all waiting time is spent between '%s' and '%s' (average %s, p95 %s), affecting %s%% of cases."
                        .formatted(top.waitSharePercent(), top.fromActivity(), top.toActivity(),
                                Metrics.humanize(top.avgWaitMs()), Metrics.humanize(top.p95WaitMs()), top.caseCoveragePercent()),
                evidence("fromActivity", top.fromActivity(), "toActivity", top.toActivity(),
                        "waitSharePercent", top.waitSharePercent(), "avgWaitMs", top.avgWaitMs(),
                        "p95WaitMs", top.p95WaitMs(), "caseCoveragePercent", top.caseCoveragePercent())));
    }

    private static Optional<ProcessInsight> slaRisk(String processKey, ProcessModel model, SlaThreshold sla) {
        SlaAnalysis analysis = SlaAnalysis.of(processKey, model, sla, 1);
        double rate = analysis.violationRatePercent();
        if (rate < SLA_MIN_VIOLATION_PERCENT) return Optional.empty();
        String worstVariant = analysis.variantsByViolations().isEmpty() ? null : analysis.variantsByViolations().getFirst().variantId();
        return Optional.of(new ProcessInsight(ProcessInsight.Type.SLA_RISK, severity(rate, 25, 10),
                "%s%% of cases breach the %s SLA".formatted(rate, Metrics.humanize(sla.millis())),
                "%d of %d cases took longer than %s (p95 case duration %s). Variant %s accounts for the most breaches."
                        .formatted(analysis.violatingCases(), analysis.totalCases(), Metrics.humanize(sla.millis()),
                                Metrics.humanize(analysis.p95DurationMs()), worstVariant),
                evidence("thresholdMs", sla.millis(), "violatingCases", analysis.violatingCases(),
                        "violationRatePercent", rate, "p95DurationMs", analysis.p95DurationMs(), "worstVariantId", worstVariant)));
    }

    private static Optional<ProcessInsight> reworkHotspot(String processKey, ProcessModel model) {
        List<ReworkAnalysis.ActivityRework> activities = ReworkAnalysis.of(processKey, model, 0).activities();
        if (activities.isEmpty()) return Optional.empty();
        ReworkAnalysis.ActivityRework top = activities.getFirst();
        if (top.affectedCasePercent() < REWORK_MIN_AFFECTED_PERCENT) return Optional.empty();
        return Optional.of(new ProcessInsight(ProcessInsight.Type.REWORK_HOTSPOT, severity(top.affectedCasePercent(), 20, 10),
                "'%s' is reworked in %s%% of cases".formatted(top.activity(), top.affectedCasePercent()),
                "%d cases repeat '%s' (%d extra executions), losing %s per affected case on average."
                        .formatted(top.affectedCases(), top.activity(), top.repeatOccurrences(),
                                Metrics.humanize(top.avgReworkTimePerAffectedCaseMs())),
                evidence("activity", top.activity(), "affectedCases", top.affectedCases(),
                        "affectedCasePercent", top.affectedCasePercent(), "repeatOccurrences", top.repeatOccurrences(),
                        "avgReworkTimePerAffectedCaseMs", top.avgReworkTimePerAffectedCaseMs())));
    }

    /** Activities present in most cases but missing from some: a common sign of bypassed controls. */
    private static List<ProcessInsight> skippedActivities(ProcessModel model) {
        long cases = model.caseCount();
        return model.activities().stream()
                .filter(activity -> Metrics.percent(activity.caseCount(), cases) >= SKIP_MIN_COVERAGE_PERCENT
                        && Metrics.percent(cases - activity.caseCount(), cases) >= SKIP_MIN_SKIPPED_PERCENT)
                .sorted(Comparator.comparingLong(ProcessModel.ActivityStats::caseCount)
                        .thenComparing(ProcessModel.ActivityStats::activity))
                .limit(SKIP_MAX_INSIGHTS)
                .map(activity -> {
                    long skipped = cases - activity.caseCount();
                    double skippedPercent = Metrics.percent(skipped, cases);
                    return new ProcessInsight(ProcessInsight.Type.SKIPPED_ACTIVITY, skippedPercent >= 10 ? Severity.MEDIUM : Severity.LOW,
                            "'%s' is skipped in %s%% of cases".formatted(activity.activity(), skippedPercent),
                            "'%s' occurs in most cases but is missing from %d of %d. Check whether these cases bypassed a required step."
                                    .formatted(activity.activity(), skipped, cases),
                            evidence("activity", activity.activity(), "casesWithActivity", activity.caseCount(),
                                    "casesWithoutActivity", skipped, "skippedPercent", skippedPercent));
                })
                .toList();
    }

    private static Optional<ProcessInsight> fragmentation(ProcessModel model) {
        if (model.variants().size() < FRAGMENTATION_MIN_VARIANTS) return Optional.empty();
        double topVariantPercent = Metrics.percent(model.variants().getFirst().caseCount(), model.caseCount());
        if (topVariantPercent >= FRAGMENTATION_MAX_TOP_VARIANT_PERCENT) return Optional.empty();
        return Optional.of(new ProcessInsight(ProcessInsight.Type.VARIANT_FRAGMENTATION, topVariantPercent < 20 ? Severity.MEDIUM : Severity.LOW,
                "Process execution is fragmented across %d variants".formatted(model.variants().size()),
                "The most common variant covers only %s%% of cases, so there is no dominant way of working to optimise against."
                        .formatted(topVariantPercent),
                evidence("variantCount", model.variants().size(), "topVariantCasePercent", topVariantPercent)));
    }

    private static Severity severity(double value, double highThreshold, double mediumThreshold) {
        if (value >= highThreshold) return Severity.HIGH;
        return value >= mediumThreshold ? Severity.MEDIUM : Severity.LOW;
    }

    private static Map<String, Object> evidence(Object... keyValues) {
        Map<String, Object> evidence = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) evidence.put((String) keyValues[i], keyValues[i + 1]);
        return Collections.unmodifiableMap(evidence);
    }
}
