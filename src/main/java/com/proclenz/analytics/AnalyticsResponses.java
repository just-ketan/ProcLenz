package com.proclenz.analytics;
import java.time.Duration;
import java.util.List;
import java.util.Map;
public final class AnalyticsResponses {
    private AnalyticsResponses() { }
    public record Variant(String sequence, long caseCount, double percentage, Duration averageDuration, Duration medianDuration, double slaViolationRate) { }
    public record Rework(String activity, long affectedCases, long repeatOccurrences) { }
    public record Bottleneck(String fromActivity, String toActivity, long transitionCount, Duration averageWait, Duration p95Wait, double contributionToCaseDuration) { }
    public record Sla(long compliantCases, long violatingCases, double violationPercentage, List<Violation> worstViolations) { }
    public record Violation(String caseId, Duration duration, Duration overBy) { }
    public record Graph(List<Node> nodes, List<Edge> edges) { }
    public record Node(String activity, long frequency) { }
    public record Edge(String from, String to, long count, double percentage, Duration averageDuration, boolean reworkAssociated) { }
}
