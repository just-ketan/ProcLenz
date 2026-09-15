package com.proclenz.analytics.engine;

import static com.proclenz.analytics.engine.Traces.mine;
import static com.proclenz.analytics.engine.Traces.minutes;
import static com.proclenz.analytics.engine.Traces.trace;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class ProcessGraphTest {

    private final ProcessGraph graph = ProcessGraph.of("orders", mine(
            trace("A", "Created", 0, "Approved", 30, "Shipped", 90),
            trace("B", "Created", 0, "Approved", 60, "Rework", 90, "Approved", 150, "Shipped", 210),
            trace("C", "Created", 0, "Shipped", 45)));

    @Test
    void wrapsActivitiesBetweenStartAndEndNodes() {
        assertThat(graph.nodes().getFirst().type()).isEqualTo(ProcessGraph.NodeType.START);
        assertThat(graph.nodes().getLast().type()).isEqualTo(ProcessGraph.NodeType.END);
        assertThat(graph.nodes()).filteredOn(node -> node.type() == ProcessGraph.NodeType.ACTIVITY)
                .extracting(ProcessGraph.Node::id).containsExactlyInAnyOrder("Created", "Approved", "Shipped", "Rework");
        assertThat(edge("__start__", "Created").percentOfSourceOutgoing()).isEqualTo(100.0);
        assertThat(edge("Shipped", "__end__").count()).isEqualTo(3);
    }

    @Test
    void edgePercentagesAreShareOfTheSourcesOutgoingFlow() {
        assertThat(edge("Created", "Approved").percentOfSourceOutgoing()).isEqualTo(66.67);
        assertThat(edge("Created", "Shipped").percentOfSourceOutgoing()).isEqualTo(33.33);
        assertThat(edge("Approved", "Shipped").percentOfSourceOutgoing()).isEqualTo(66.67);

        Map<String, Double> outgoingTotals = graph.edges().stream()
                .collect(Collectors.groupingBy(ProcessGraph.Edge::source, Collectors.summingDouble(ProcessGraph.Edge::percentOfSourceOutgoing)));
        outgoingTotals.values().forEach(total -> assertThat(total).isCloseTo(100.0, within(0.02)));
    }

    @Test
    void edgesCarryTransitionTimeAndReworkAssociation() {
        ProcessGraph.Edge createdToApproved = edge("Created", "Approved");
        assertThat(createdToApproved.avgDurationMs()).isEqualTo(minutes(45));
        assertThat(createdToApproved.reworkEdge()).isFalse();

        ProcessGraph.Edge backToApproval = edge("Rework", "Approved");
        assertThat(backToApproval.reworkEdge()).isTrue();
        assertThat(backToApproval.reworkCount()).isEqualTo(1);
    }

    @Test
    void nodesReportCoverageAndRepeats() {
        ProcessGraph.Node approved = graph.nodes().stream().filter(node -> node.id().equals("Approved")).findFirst().orElseThrow();

        assertThat(approved.frequency()).isEqualTo(3);
        assertThat(approved.caseCount()).isEqualTo(2);
        assertThat(approved.caseCoveragePercent()).isEqualTo(66.67);
        assertThat(approved.repeatOccurrences()).isEqualTo(1);
    }

    private ProcessGraph.Edge edge(String source, String target) {
        return graph.edges().stream()
                .filter(edge -> edge.source().equals(source) && edge.target().equals(target))
                .findFirst().orElseThrow();
    }
}
