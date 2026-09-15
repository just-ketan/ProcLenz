package com.proclenz.analytics.engine;

import static com.proclenz.analytics.engine.Traces.SLA_4H;
import static com.proclenz.analytics.engine.Traces.mine;
import static com.proclenz.analytics.engine.Traces.minutes;
import static com.proclenz.analytics.engine.Traces.trace;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class VariantAnalysisTest {

    private final ProcessModel model = mine(
            trace("HAPPY-1", "Created", 0, "Approved", 20, "Shipped", 60),
            trace("HAPPY-2", "Created", 0, "Approved", 100, "Shipped", 180),
            trace("REWORK-1", "Created", 0, "Approved", 60, "Created", 120, "Approved", 200, "Shipped", 300),
            trace("SKIP-1", "Created", 0, "Shipped", 120));

    @Test
    void reportsShareDurationAndSlaViolationRatePerVariant() {
        VariantAnalysis analysis = VariantAnalysis.of("orders", model, SLA_4H, 0, 10);

        assertThat(analysis.totalCases()).isEqualTo(4);
        assertThat(analysis.totalVariants()).isEqualTo(3);
        VariantAnalysis.Variant happy = analysis.variants().getFirst();
        assertThat(happy.rank()).isEqualTo(1);
        assertThat(happy.sequence()).isEqualTo("Created → Approved → Shipped");
        assertThat(happy.caseCount()).isEqualTo(2);
        assertThat(happy.casePercent()).isEqualTo(50.0);
        assertThat(happy.avgDurationMs()).isEqualTo(minutes(120));
        assertThat(happy.slaViolations()).isZero();
        assertThat(happy.containsRework()).isFalse();

        VariantAnalysis.Variant rework = find(analysis.variants(), "REWORK");
        assertThat(rework.containsRework()).isTrue();
        assertThat(rework.slaViolations()).isEqualTo(1);
        assertThat(rework.slaViolationRatePercent()).isEqualTo(100.0);
    }

    @Test
    void cumulativePercentageShowsParetoCoverage() {
        List<VariantAnalysis.Variant> variants = VariantAnalysis.of("orders", model, SLA_4H, 0, 10).variants();

        assertThat(variants).extracting(VariantAnalysis.Variant::cumulativeCasePercent).containsExactly(50.0, 75.0, 100.0);
    }

    @Test
    void paginatesWithoutLosingRankOrCumulativeShare() {
        VariantAnalysis secondPage = VariantAnalysis.of("orders", model, SLA_4H, 1, 2);

        assertThat(secondPage.totalPages()).isEqualTo(2);
        assertThat(secondPage.variants()).singleElement().satisfies(variant -> {
            assertThat(variant.rank()).isEqualTo(3);
            assertThat(variant.cumulativeCasePercent()).isEqualTo(100.0);
        });
    }

    @Test
    void variantIdIsStableForTheSameSequence() {
        String first = VariantAnalysis.of("orders", model, SLA_4H, 0, 1).variants().getFirst().variantId();

        assertThat(first).isEqualTo(VariantId.of(List.of("Created", "Approved", "Shipped")));
    }

    private static VariantAnalysis.Variant find(List<VariantAnalysis.Variant> variants, String kind) {
        return variants.stream()
                .filter(variant -> kind.equals("REWORK") ? variant.activityCount() == 5 : variant.activityCount() == 2)
                .findFirst().orElseThrow();
    }
}
