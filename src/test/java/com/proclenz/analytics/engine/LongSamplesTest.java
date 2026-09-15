package com.proclenz.analytics.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class LongSamplesTest {

    @Test
    void nearestRankPercentilesReturnObservedValues() {
        LongSamples samples = samples(70, 10, 100, 40, 20, 90, 30, 60, 50, 80);

        assertThat(samples.median()).isEqualTo(50);
        assertThat(samples.percentile(90)).isEqualTo(90);
        assertThat(samples.percentile(95)).isEqualTo(100);
        assertThat(samples.average()).isEqualTo(55);
        assertThat(samples.max()).isEqualTo(100);
    }

    @Test
    void countGreaterThanIsStrict() {
        LongSamples samples = samples(10, 20, 20, 30);

        assertThat(samples.countGreaterThan(20)).isEqualTo(1);
        assertThat(samples.countGreaterThan(19)).isEqualTo(3);
        assertThat(samples.countGreaterThan(30)).isZero();
        assertThat(samples.countGreaterThan(0)).isEqualTo(4);
    }

    @Test
    void orderStatisticsRequireFreezeAndFreezingPreventsWrites() {
        LongSamples samples = new LongSamples();
        samples.add(5);

        assertThatThrownBy(() -> samples.percentile(50)).isInstanceOf(IllegalStateException.class);
        samples.freeze();
        assertThatThrownBy(() -> samples.add(6)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void emptySamplesReportZero() {
        LongSamples samples = new LongSamples().freeze();

        assertThat(samples.average()).isZero();
        assertThat(samples.percentile(95)).isZero();
        assertThat(samples.countGreaterThan(0)).isZero();
    }

    private static LongSamples samples(long... values) {
        LongSamples samples = new LongSamples();
        for (long value : values) samples.add(value);
        return samples.freeze();
    }
}
