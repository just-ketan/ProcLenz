package com.proclenz.analytics.engine;

import static com.proclenz.analytics.engine.Traces.SLA_4H;
import static com.proclenz.analytics.engine.Traces.mine;
import static com.proclenz.analytics.engine.Traces.minutes;
import static com.proclenz.analytics.engine.Traces.trace;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class SlaAnalysisTest {

    private final ProcessModel model = mine(
            trace("FAST", "Created", 0, "Shipped", 180),
            trace("ON-THE-LINE", "Created", 0, "Shipped", 240),
            trace("LATE", "Created", 0, "Approved", 60, "Shipped", 300),
            trace("VERY-LATE", "Created", 0, "Approved", 120, "Shipped", 480));

    @Test
    void caseFinishingExactlyOnTheThresholdComplies() {
        SlaAnalysis analysis = SlaAnalysis.of("orders", model, SLA_4H, 10);

        assertThat(analysis.compliantCases()).isEqualTo(2);
        assertThat(analysis.violatingCases()).isEqualTo(2);
        assertThat(analysis.violationRatePercent()).isEqualTo(50.0);
        assertThat(analysis.thresholdMs()).isEqualTo(minutes(240));
        assertThat(analysis.thresholdSource()).isEqualTo(SlaThreshold.Source.REQUEST);
    }

    @Test
    void listsWorstViolationsByDurationWithOverrun() {
        SlaAnalysis analysis = SlaAnalysis.of("orders", model, SLA_4H, 10);

        assertThat(analysis.worstViolations()).extracting(SlaAnalysis.Violation::caseId).containsExactly("VERY-LATE", "LATE");
        SlaAnalysis.Violation worst = analysis.worstViolations().getFirst();
        assertThat(worst.overByMs()).isEqualTo(minutes(240));
        assertThat(worst.overByPercent()).isEqualTo(100.0);
        assertThat(SlaAnalysis.of("orders", model, SLA_4H, 1).worstViolations()).hasSize(1);
    }

    @Test
    void attributesBreachesToVariants() {
        SlaAnalysis analysis = SlaAnalysis.of("orders", model, SLA_4H, 10);

        assertThat(analysis.variantsByViolations()).singleElement().satisfies(variant -> {
            assertThat(variant.activities()).containsExactly("Created", "Approved", "Shipped");
            assertThat(variant.violations()).isEqualTo(2);
            assertThat(variant.violationRatePercent()).isEqualTo(100.0);
        });
    }

    @Test
    void summaryAgreesWithDetailedAnalysis() {
        ProcessSummary summary = ProcessSummary.of("orders", model, SLA_4H);

        assertThat(summary.sla().violatingCases()).isEqualTo(2);
        assertThat(summary.sla().violationRatePercent()).isEqualTo(50.0);
        assertThat(summary.medianCaseDurationMs()).isEqualTo(minutes(240));
        assertThat(summary.maxCaseDurationMs()).isEqualTo(minutes(480));
    }

    @Test
    void thresholdMustBePositive() {
        assertThatThrownBy(() -> new SlaThreshold(Duration.ZERO, SlaThreshold.Source.DEFAULT)).isInstanceOf(IllegalArgumentException.class);
    }
}
