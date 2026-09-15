package com.proclenz.analytics.engine;

import java.util.Arrays;

/**
 * Growable buffer of primitive longs (durations in milliseconds) with order statistics. Avoids
 * boxing millions of {@code Long}s. Call {@link #freeze()} once collection is finished; a frozen
 * instance is sorted, read-only and safe to share between threads.
 */
public final class LongSamples {
    private long[] values = new long[8];
    private int size;
    private long sum;
    private boolean frozen;

    public void add(long value) {
        if (frozen) throw new IllegalStateException("Samples are frozen");
        if (size == values.length) values = Arrays.copyOf(values, size * 2);
        values[size++] = value;
        sum += value;
    }

    public LongSamples freeze() {
        if (!frozen) {
            Arrays.sort(values, 0, size);
            frozen = true;
        }
        return this;
    }

    public int size() {
        return size;
    }

    public long sum() {
        return sum;
    }

    public long average() {
        return size == 0 ? 0 : Math.round((double) sum / size);
    }

    public long median() {
        return percentile(50);
    }

    public long max() {
        requireFrozen();
        return size == 0 ? 0 : values[size - 1];
    }

    /**
     * Nearest-rank percentile: the smallest sample such that at least {@code percentile}% of all
     * samples are less than or equal to it. Always returns an observed value, never an interpolation.
     */
    public long percentile(double percentile) {
        requireFrozen();
        if (size == 0) return 0;
        int rank = (int) Math.ceil(percentile / 100.0 * size);
        return values[Math.clamp(rank, 1, size) - 1];
    }

    /** Number of samples strictly greater than {@code threshold}. */
    public long countGreaterThan(long threshold) {
        requireFrozen();
        int low = 0;
        int high = size;
        while (low < high) {
            int middle = (low + high) >>> 1;
            if (values[middle] <= threshold) low = middle + 1;
            else high = middle;
        }
        return size - low;
    }

    private void requireFrozen() {
        if (!frozen) throw new IllegalStateException("Order statistics require frozen samples");
    }
}
