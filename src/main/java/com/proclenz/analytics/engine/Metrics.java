package com.proclenz.analytics.engine;

/** Rounding and formatting conventions shared by all analyses. */
final class Metrics {
    private Metrics() {
    }

    /** {@code part / total} as a percentage rounded to two decimals; 0 when total is 0. */
    static double percent(long part, long total) {
        return total <= 0 ? 0.0 : Math.round(part * 10_000.0 / total) / 100.0;
    }

    static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    /** Compact human-readable duration for insight text, e.g. "2d 4h", "3h 12m", "45s". */
    static String humanize(long millis) {
        if (millis < 1_000) return millis + "ms";
        long seconds = millis / 1_000;
        long days = seconds / 86_400;
        long hours = seconds % 86_400 / 3_600;
        long minutes = seconds % 3_600 / 60;
        long secs = seconds % 60;
        if (days > 0) return hours > 0 ? days + "d " + hours + "h" : days + "d";
        if (hours > 0) return minutes > 0 ? hours + "h " + minutes + "m" : hours + "h";
        if (minutes > 0) return secs > 0 ? minutes + "m " + secs + "s" : minutes + "m";
        return secs + "s";
    }
}
