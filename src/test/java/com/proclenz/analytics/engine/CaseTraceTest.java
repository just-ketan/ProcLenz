package com.proclenz.analytics.engine;

import static com.proclenz.analytics.engine.Traces.minutes;
import static com.proclenz.analytics.engine.Traces.ord1001;
import static com.proclenz.analytics.engine.Traces.trace;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class CaseTraceTest {

    @Test
    void caseDurationIsLastMinusFirstTimestamp() {
        assertThat(ord1001().durationMs()).isEqualTo(8_400_000L);
    }

    @Test
    void waitingTimeIsTheGapSinceThePreviousEvent() {
        CaseTrace trace = ord1001();

        assertThat(trace.waitMs(0)).isZero();
        assertThat(trace.waitMs(1)).isEqualTo(minutes(14));
        assertThat(trace.waitMs(2)).isEqualTo(minutes(76));
        assertThat(trace.waitMs(4)).isEqualTo(minutes(23));
    }

    @Test
    void detectsRepeatedActivityAsRework() {
        CaseTrace trace = ord1001();

        assertThat(trace.isRepeat(2)).isFalse();
        assertThat(trace.isRepeat(4)).isTrue();
        assertThat(trace.previousOccurrence(4)).isEqualTo(2);
        assertThat(trace.repeatCount()).isEqualTo(1);
        assertThat(trace.reworkActivities()).containsExactly("Inventory Checked");
    }

    @Test
    void singleEventCaseLastsZeroMilliseconds() {
        assertThat(trace("C1", "Created", 0).durationMs()).isZero();
    }

    @Test
    void variantIdDependsOnlyOnTheActivitySequence() {
        CaseTrace fast = trace("A", "Created", 0, "Approved", 5, "Shipped", 10);
        CaseTrace slow = trace("B", "Created", 0, "Approved", 500, "Shipped", 900);
        CaseTrace reordered = trace("C", "Created", 0, "Shipped", 5, "Approved", 10);

        assertThat(fast.variantId()).isEqualTo(slow.variantId()).hasSize(16);
        assertThat(reordered.variantId()).isNotEqualTo(fast.variantId());
    }

    @Test
    void rejectsEventsThatAreNotChronological() {
        assertThatThrownBy(() -> trace("C1", "Created", 10, "Approved", 5))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("chronological");
    }
}
