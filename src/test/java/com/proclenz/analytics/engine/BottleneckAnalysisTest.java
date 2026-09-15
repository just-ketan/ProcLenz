package com.proclenz.analytics.engine;

import static com.proclenz.analytics.engine.Traces.mine;
import static com.proclenz.analytics.engine.Traces.minutes;
import static com.proclenz.analytics.engine.Traces.trace;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class BottleneckAnalysisTest {

    @Test
    void ranksByShareOfWaitingTimeRatherThanAverageWait() {
        List<CaseTrace> traces = new ArrayList<>();
        for (int i = 0; i < 10; i++) traces.add(trace("FREQUENT-" + i, "Pick", 0, "Pack", 60));
        traces.add(trace("RARE", "Customs", 0, "Cleared", 300));

        BottleneckAnalysis analysis = BottleneckAnalysis.of("orders", mine(traces), 10);

        BottleneckAnalysis.Bottleneck first = analysis.bottlenecks().getFirst();
        BottleneckAnalysis.Bottleneck second = analysis.bottlenecks().get(1);
        assertThat(first.fromActivity()).isEqualTo("Pick");
        assertThat(first.avgWaitMs()).isLessThan(second.avgWaitMs());
        assertThat(first.waitSharePercent()).isEqualTo(66.67);
        assertThat(first.score()).isEqualTo(100.0);
        assertThat(second.fromActivity()).isEqualTo("Customs");
        assertThat(second.score()).isEqualTo(50.0);
        assertThat(analysis.totalWaitingTimeMs()).isEqualTo(minutes(900));
    }

    @Test
    void longTailDelaysOutrankPredictableOnesWithTheSameTotalWait() {
        ProcessModel model = mine(
                trace("P1", "Steady", 0, "Done", 60), trace("P2", "Steady", 0, "Done", 60),
                trace("P3", "Steady", 0, "Done", 60), trace("P4", "Steady", 0, "Done", 60),
                trace("V1", "Erratic", 0, "Resolved", 10), trace("V2", "Erratic", 0, "Resolved", 10),
                trace("V3", "Erratic", 0, "Resolved", 10), trace("V4", "Erratic", 0, "Resolved", 210));

        BottleneckAnalysis.Bottleneck first = BottleneckAnalysis.of("orders", model, 10).bottlenecks().getFirst();

        assertThat(first.fromActivity()).isEqualTo("Erratic");
        assertThat(first.waitSharePercent()).isEqualTo(50.0);
        assertThat(first.medianWaitMs()).isEqualTo(minutes(10));
        assertThat(first.p95WaitMs()).isEqualTo(minutes(210));
        assertThat(first.tailVolatility()).isEqualTo(0.95);
    }

    @Test
    void severityUsesAbsoluteWaitShareThresholds() {
        List<CaseTrace> traces = new ArrayList<>();
        for (int i = 0; i < 10; i++) traces.add(trace("A" + i, "A", 0, "B", 60));
        traces.add(trace("C", "C", 0, "D", 300));
        traces.add(trace("E", "E", 0, "F", 150));
        traces.add(trace("G", "G", 0, "H", 50));

        List<BottleneckAnalysis.Bottleneck> bottlenecks = BottleneckAnalysis.of("orders", mine(traces), 10).bottlenecks();

        assertThat(bottlenecks).extracting(BottleneckAnalysis.Bottleneck::waitSharePercent).containsExactly(54.55, 27.27, 13.64, 4.55);
        assertThat(bottlenecks).extracting(BottleneckAnalysis.Bottleneck::severity)
                .containsExactly(Severity.HIGH, Severity.HIGH, Severity.MEDIUM, Severity.LOW);
    }

    @Test
    void ignoresTransitionsWithoutWaitingTimeAndRespectsLimit() {
        ProcessModel model = mine(trace("A", "Scan", 0, "Log", 0, "Ship", 45), trace("B", "Scan", 0, "Log", 0, "Ship", 30));

        BottleneckAnalysis analysis = BottleneckAnalysis.of("orders", model, 1);

        assertThat(analysis.transitionsAnalyzed()).isEqualTo(1);
        assertThat(analysis.bottlenecks()).singleElement().satisfies(bottleneck -> assertThat(bottleneck.fromActivity()).isEqualTo("Log"));
    }
}
