package com.proclenz.analytics.engine;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The discovered process as a directly-follows graph: nodes are activities, edges are observed
 * transitions. Synthetic start and end nodes make case entry and exit points explicit, so every
 * activity's outgoing percentages (including to the end node) sum to 100%. Node and edge IDs are
 * stable, and all measures are plain numbers, so the payload can be handed straight to a graph
 * layout library.
 */
public record ProcessGraph(String processKey, long caseCount, List<Node> nodes, List<Edge> edges) {

    public static final String START_NODE = "__start__";
    public static final String END_NODE = "__end__";

    public enum NodeType {
        START,
        ACTIVITY,
        END
    }

    /** @param avgTimeToActivityMs average waiting time before the activity, measured from the preceding event */
    public record Node(String id, String label, NodeType type, long frequency, long caseCount, double caseCoveragePercent,
                       long avgTimeToActivityMs, long repeatOccurrences) {
    }

    /**
     * @param percentOfSourceOutgoing share of all flow leaving {@code source} that continues to {@code target}
     * @param reworkCount             times this edge led back to an activity already executed in the case
     */
    public record Edge(String id, String source, String target, long count, long caseCount, double percentOfSourceOutgoing,
                       double casePercent, long avgDurationMs, long medianDurationMs, long p95DurationMs,
                       long reworkCount, boolean reworkEdge) {
    }

    public static ProcessGraph of(String processKey, ProcessModel model) {
        long cases = model.caseCount();
        Map<String, Long> outgoing = new HashMap<>();
        model.transitions().forEach(transition -> outgoing.merge(transition.from(), transition.count(), Long::sum));
        model.activities().forEach(activity -> outgoing.merge(activity.activity(), activity.endCount(), Long::sum));

        List<Node> nodes = new ArrayList<>();
        nodes.add(new Node(START_NODE, "Start", NodeType.START, cases, cases, Metrics.percent(cases, cases), 0, 0));
        for (ProcessModel.ActivityStats activity : model.activities()) {
            nodes.add(new Node(activity.activity(), activity.activity(), NodeType.ACTIVITY, activity.occurrences(), activity.caseCount(),
                    Metrics.percent(activity.caseCount(), cases), activity.incomingWaits().average(), activity.repeatOccurrences()));
        }
        nodes.add(new Node(END_NODE, "End", NodeType.END, cases, cases, Metrics.percent(cases, cases), 0, 0));

        List<Edge> edges = new ArrayList<>();
        for (ProcessModel.ActivityStats activity : model.activities()) {
            if (activity.startCount() > 0) edges.add(boundaryEdge(START_NODE, activity.activity(), activity.startCount(), cases, cases));
            if (activity.endCount() > 0) edges.add(boundaryEdge(activity.activity(), END_NODE, activity.endCount(), outgoing.get(activity.activity()), cases));
        }
        for (ProcessModel.TransitionStats transition : model.transitions()) {
            LongSamples waits = transition.waits();
            edges.add(new Edge(edgeId(transition.from(), transition.to()), transition.from(), transition.to(), transition.count(),
                    transition.caseCount(), Metrics.percent(transition.count(), outgoing.get(transition.from())),
                    Metrics.percent(transition.caseCount(), cases), waits.average(), waits.median(), waits.percentile(95),
                    transition.reworkCount(), transition.reworkCount() > 0));
        }
        edges.sort(Comparator.comparingLong(Edge::count).reversed().thenComparing(Edge::id));
        return new ProcessGraph(processKey, cases, nodes, edges);
    }

    private static Edge boundaryEdge(String source, String target, long count, long sourceOutgoing, long cases) {
        return new Edge(edgeId(source, target), source, target, count, count, Metrics.percent(count, sourceOutgoing),
                Metrics.percent(count, cases), 0, 0, 0, 0, false);
    }

    private static String edgeId(String source, String target) {
        return source + "->" + target;
    }
}
