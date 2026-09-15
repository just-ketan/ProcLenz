package com.proclenz.analytics.engine;

import static com.proclenz.analytics.engine.Traces.mine;
import static com.proclenz.analytics.engine.Traces.minutes;
import static com.proclenz.analytics.engine.Traces.trace;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ReworkAnalysisTest {

    private final ProcessModel model = mine(
            trace("LOOP-TWICE", "Check", 0, "Rework", 30, "Check", 90, "Rework", 100, "Check", 160, "Ship", 200),
            trace("CLEAN", "Check", 0, "Ship", 10),
            trace("IMMEDIATE-REPEAT", "Check", 0, "Check", 5, "Ship", 10));

    @Test
    void reportsAffectedCasesAndReworkRate() {
        ReworkAnalysis analysis = ReworkAnalysis.of("orders", model, 10);

        assertThat(analysis.totalCases()).isEqualTo(3);
        assertThat(analysis.casesWithRework()).isEqualTo(2);
        assertThat(analysis.reworkRatePercent()).isEqualTo(66.67);
    }

    @Test
    void ranksReworkHeavyActivitiesAndMeasuresTimeLost() {
        ReworkAnalysis analysis = ReworkAnalysis.of("orders", model, 10);

        ReworkAnalysis.ActivityRework check = analysis.activities().getFirst();
        assertThat(check.activity()).isEqualTo("Check");
        assertThat(check.affectedCases()).isEqualTo(2);
        assertThat(check.repeatOccurrences()).isEqualTo(3);
        assertThat(check.avgRepeatsPerAffectedCase()).isEqualTo(1.5);
        assertThat(check.totalReworkTimeMs()).isEqualTo(minutes(90 + 70 + 5));
        assertThat(check.avgReworkTimePerAffectedCaseMs()).isEqualTo(minutes(90 + 70 + 5) / 2);

        assertThat(analysis.activities()).extracting(ReworkAnalysis.ActivityRework::activity).containsExactly("Check", "Rework");
    }

    @Test
    void groupsConcreteLoopsMostFrequentFirst() {
        ReworkAnalysis analysis = ReworkAnalysis.of("orders", model, 10);

        ReworkAnalysis.Loop loop = analysis.loops().getFirst();
        assertThat(loop.path()).containsExactly("Check", "Rework", "Check");
        assertThat(loop.occurrences()).isEqualTo(2);
        assertThat(loop.avgLoopDurationMs()).isEqualTo(minutes(80));
        assertThat(analysis.loops()).extracting(ReworkAnalysis.Loop::path)
                .contains(java.util.List.of("Check", "Check"), java.util.List.of("Rework", "Check", "Rework"));
    }

    @Test
    void processWithoutRepeatsHasNoRework() {
        ReworkAnalysis analysis = ReworkAnalysis.of("orders", mine(trace("A", "Check", 0, "Ship", 10)), 10);

        assertThat(analysis.casesWithRework()).isZero();
        assertThat(analysis.activities()).isEmpty();
        assertThat(analysis.loops()).isEmpty();
    }
}
