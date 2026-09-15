package com.proclenz.analytics.engine;

import java.util.List;

public record InsightReport(String processKey, long caseCount, long slaThresholdMs, List<ProcessInsight> insights) {
}
