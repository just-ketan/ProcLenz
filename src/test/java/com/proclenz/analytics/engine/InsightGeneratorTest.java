package com.proclenz.analytics.engine;

import static com.proclenz.analytics.engine.Traces.mine;
import static com.proclenz.analytics.engine.Traces.trace;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class InsightGeneratorTest {
    private static final SlaThreshold SLA_8H = new SlaThreshold(Duration.ofHours(8), SlaThreshold.Source.PROCESS);

    @Test
    void turnsProcessPatternsIntoPrioritisedInsights() {
        List<CaseTrace> traces = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            traces.add(trace("HAPPY-" + i, "Created", 0, "Credit Check", 10, "Approved", 30, "Shipped", 90, "Paid", 150));
        }
        for (int i = 0; i < 3; i++) {
            traces.add(trace("SLOW-APPROVAL-" + i, "Created", 0, "Credit Check", 10, "Approved", 610, "Shipped", 670, "Paid", 730));
        }
        for (int i = 0; i < 3; i++) {
            traces.add(trace("REWORK-" + i, "Created", 0, "Credit Check", 10, "Credit Check", 40, "Approved", 60, "Shipped", 120, "Paid", 180));
        }
        for (int i = 0; i < 2; i++) {
            traces.add(trace("NO-CREDIT-CHECK-" + i, "Created", 0, "Approved", 20, "Shipped", 80, "Paid", 140));
        }

        InsightReport report = InsightGenerator.generate("order-to-cash", mine(traces), SLA_8H);

        assertThat(report.insights()).extracting(ProcessInsight::type).containsExactlyInAnyOrder(
                ProcessInsight.Type.BOTTLENECK, ProcessInsight.Type.SLA_RISK,
                ProcessInsight.Type.REWORK_HOTSPOT, ProcessInsight.Type.SKIPPED_ACTIVITY);
        assertThat(report.insights().getFirst().severity()).isEqualTo(Severity.HIGH);
        assertThat(insight(report, ProcessInsight.Type.BOTTLENECK).evidence())
                .containsEntry("fromActivity", "Credit Check").containsEntry("toActivity", "Approved");
        assertThat(insight(report, ProcessInsight.Type.SLA_RISK).evidence()).containsEntry("violatingCases", 3L);
        assertThat(insight(report, ProcessInsight.Type.REWORK_HOTSPOT).title()).contains("'Credit Check'", "15.0%");
        assertThat(insight(report, ProcessInsight.Type.SKIPPED_ACTIVITY).evidence()).containsEntry("casesWithoutActivity", 2L);
    }

    @Test
    void consistentProcessProducesNoInsights() {
        List<CaseTrace> traces = new ArrayList<>();
        for (int i = 0; i < 10; i++) traces.add(trace("C" + i, "Created", 0, "Approved", 10, "Shipped", 20));

        assertThat(InsightGenerator.generate("orders", mine(traces), SLA_8H).insights()).isEmpty();
    }

    @Test
    void flagsFragmentedProcesses() {
        List<CaseTrace> traces = new ArrayList<>();
        String[] steps = {"A", "B", "C", "D", "E", "F"};
        for (int variant = 0; variant < 6; variant++) {
            traces.add(trace("CASE-" + variant, "Start", 0, steps[variant], 10, "End", 20));
        }

        InsightReport report = InsightGenerator.generate("orders", mine(traces), SLA_8H);

        assertThat(report.insights()).extracting(ProcessInsight::type).contains(ProcessInsight.Type.VARIANT_FRAGMENTATION);
    }

    private static ProcessInsight insight(InsightReport report, ProcessInsight.Type type) {
        return report.insights().stream().filter(insight -> insight.type() == type).findFirst().orElseThrow();
    }
}
