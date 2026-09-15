package com.proclenz.analytics.engine;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Ranks transitions by how much of the process's waiting time they cause, not by raw slowness.
 *
 * <ul>
 *   <li><b>waitShare</b> = waiting time on the transition / waiting time on all transitions. It
 *       combines frequency and average wait: a moderate delay hit by every case outranks a rare
 *       extreme one, because removing it saves more total time.</li>
 *   <li><b>tailVolatility</b> = 1 − median/p95. 0 means every case waits about the same; values
 *       near 1 mean a long tail of occasional extreme delays, which drives SLA breaches.</li>
 *   <li><b>impact</b> = waitShare × (1 + tailVolatility); <b>score</b> normalises impact so the
 *       worst transition scores 100.</li>
 *   <li><b>severity</b> uses absolute waitShare (HIGH ≥ 20%, MEDIUM ≥ 10%), so a flat process
 *       does not get HIGH findings just because something must rank first.</li>
 * </ul>
 */
public record BottleneckAnalysis(
        String processKey,
        String scoringModel,
        long totalWaitingTimeMs,
        int transitionsAnalyzed,
        List<Bottleneck> bottlenecks) {

    public static final String SCORING_MODEL = "impact = waitShare x (1 + tailVolatility); score = 100 x impact / max(impact); "
            + "waitShare = transition waiting time / total waiting time; tailVolatility = 1 - median/p95; "
            + "severity HIGH if waitShare >= 20%, MEDIUM if >= 10%, else LOW";
    static final double HIGH_WAIT_SHARE = 0.20;
    static final double MEDIUM_WAIT_SHARE = 0.10;

    public record Bottleneck(
            int rank,
            String fromActivity,
            String toActivity,
            double score,
            Severity severity,
            long transitionCount,
            long caseCount,
            double caseCoveragePercent,
            long avgWaitMs,
            long medianWaitMs,
            long p95WaitMs,
            long totalWaitMs,
            double waitSharePercent,
            double tailVolatility) {
    }

    public static BottleneckAnalysis of(String processKey, ProcessModel model, int limit) {
        long totalWait = model.totalWaitMs();
        List<ScoredTransition> scored = model.transitions().stream()
                .filter(transition -> transition.waits().sum() > 0)
                .map(transition -> ScoredTransition.of(transition, totalWait))
                .sorted(Comparator.comparingDouble(ScoredTransition::impact).reversed()
                        .thenComparing(candidate -> candidate.transition().from())
                        .thenComparing(candidate -> candidate.transition().to()))
                .toList();
        double maxImpact = scored.isEmpty() ? 0 : scored.getFirst().impact();
        List<Bottleneck> bottlenecks = new ArrayList<>();
        for (int i = 0; i < Math.min(limit, scored.size()); i++) {
            bottlenecks.add(scored.get(i).toBottleneck(i + 1, maxImpact, model.caseCount()));
        }
        return new BottleneckAnalysis(processKey, SCORING_MODEL, totalWait, scored.size(), bottlenecks);
    }

    private record ScoredTransition(ProcessModel.TransitionStats transition, double waitShare, double tailVolatility, double impact) {

        static ScoredTransition of(ProcessModel.TransitionStats transition, long totalWait) {
            double share = (double) transition.waits().sum() / totalWait;
            long p95 = transition.waits().percentile(95);
            double tail = p95 == 0 ? 0 : 1.0 - (double) transition.waits().median() / p95;
            return new ScoredTransition(transition, share, tail, share * (1 + tail));
        }

        Bottleneck toBottleneck(int rank, double maxImpact, long caseCount) {
            LongSamples waits = transition.waits();
            Severity severity = waitShare >= HIGH_WAIT_SHARE ? Severity.HIGH
                    : waitShare >= MEDIUM_WAIT_SHARE ? Severity.MEDIUM : Severity.LOW;
            return new Bottleneck(rank, transition.from(), transition.to(), Metrics.round2(100 * impact / maxImpact), severity,
                    transition.count(), transition.caseCount(), Metrics.percent(transition.caseCount(), caseCount),
                    waits.average(), waits.median(), waits.percentile(95), waits.sum(),
                    Metrics.round2(waitShare * 100), Metrics.round2(tailVolatility));
        }
    }
}
