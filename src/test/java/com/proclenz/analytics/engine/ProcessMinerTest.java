package com.proclenz.analytics.engine;

import static com.proclenz.analytics.engine.Traces.mine;
import static com.proclenz.analytics.engine.Traces.minutes;
import static com.proclenz.analytics.engine.Traces.ord1001;
import static com.proclenz.analytics.engine.Traces.trace;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class ProcessMinerTest {

    @Test
    void countsActivityFrequencyAndCaseCoverage() {
        ProcessModel model = mine(ord1001());

        assertThat(model.caseCount()).isEqualTo(1);
        assertThat(model.eventCount()).isEqualTo(6);
        ProcessModel.ActivityStats inventory = activity(model, "Inventory Checked");
        assertThat(inventory.occurrences()).isEqualTo(2);
        assertThat(inventory.caseCount()).isEqualTo(1);
        assertThat(inventory.repeatOccurrences()).isEqualTo(1);
        assertThat(inventory.reworkTimeMs()).isEqualTo(minutes(35));
        assertThat(activity(model, "Order Created").startCount()).isEqualTo(1);
        assertThat(activity(model, "Order Shipped").endCount()).isEqualTo(1);
    }

    @Test
    void recordsTransitionFrequencyWaitingTimeAndReworkEdges() {
        ProcessModel model = mine(ord1001());

        assertThat(model.transitions()).hasSize(5);
        ProcessModel.TransitionStats approvedToInventory = transition(model, "Order Approved", "Inventory Checked");
        assertThat(approvedToInventory.count()).isEqualTo(1);
        assertThat(approvedToInventory.waits().average()).isEqualTo(minutes(76));
        assertThat(approvedToInventory.reworkCount()).isZero();
        assertThat(transition(model, "Rework Required", "Inventory Checked").reworkCount()).isEqualTo(1);
    }

    @Test
    void capturesReworkLoopsWithTheirDuration() {
        ProcessModel model = mine(ord1001());

        assertThat(model.casesWithRework()).isEqualTo(1);
        assertThat(model.loops()).singleElement().satisfies(loop -> {
            assertThat(loop.path()).containsExactly("Inventory Checked", "Rework Required", "Inventory Checked");
            assertThat(loop.durations().average()).isEqualTo(minutes(35));
        });
    }

    @Test
    void groupsCasesWithIdenticalSequencesIntoVariantsOrderedByFrequency() {
        ProcessModel model = mine(
                trace("A", "Created", 0, "Checked", 60, "Checked", 120, "Shipped", 300),
                trace("B", "Created", 0, "Checked", 10, "Shipped", 20),
                trace("C", "Created", 0, "Checked", 30, "Shipped", 90));

        assertThat(model.variants()).hasSize(2);
        ProcessModel.VariantStats top = model.variants().getFirst();
        assertThat(top.activities()).containsExactly("Created", "Checked", "Shipped");
        assertThat(top.caseCount()).isEqualTo(2);
        assertThat(top.durations().average()).isEqualTo(minutes(55));
    }

    @Test
    void countsCaseCoverageOncePerCaseEvenWhenATransitionRepeats() {
        ProcessModel model = mine(trace("A", "Review", 0, "Fix", 10, "Review", 20, "Fix", 30));

        ProcessModel.TransitionStats reviewToFix = transition(model, "Review", "Fix");
        assertThat(reviewToFix.count()).isEqualTo(2);
        assertThat(reviewToFix.caseCount()).isEqualTo(1);
    }

    @Test
    void tracksFirstAndLastEventAcrossCases() {
        ProcessModel model = mine(trace("A", "Created", 30, "Shipped", 90), trace("B", "Created", 0, "Shipped", 60));

        assertThat(model.firstEventAt()).isEqualTo(Traces.BASE);
        assertThat(model.lastEventAt()).isEqualTo(Traces.BASE.plusSeconds(90 * 60));
        assertThat(model.caseDurations().median()).isEqualTo(minutes(60));
    }

    static ProcessModel.ActivityStats activity(ProcessModel model, String name) {
        return model.activities().stream().filter(activity -> activity.activity().equals(name)).findFirst().orElseThrow();
    }

    static ProcessModel.TransitionStats transition(ProcessModel model, String from, String to) {
        List<ProcessModel.TransitionStats> matches = model.transitions().stream()
                .filter(transition -> transition.from().equals(from) && transition.to().equals(to))
                .toList();
        assertThat(matches).hasSize(1);
        return matches.getFirst();
    }
}
