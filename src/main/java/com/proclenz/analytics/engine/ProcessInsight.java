package com.proclenz.analytics.engine;

import java.util.Map;

/** An operational finding with the metrics it was derived from, so it can be verified rather than trusted. */
public record ProcessInsight(Type type, Severity severity, String title, String detail, Map<String, Object> evidence) {

    public enum Type {
        BOTTLENECK,
        SLA_RISK,
        REWORK_HOTSPOT,
        SKIPPED_ACTIVITY,
        VARIANT_FRAGMENTATION
    }
}
