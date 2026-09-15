package com.proclenz.analytics;

import static org.assertj.core.api.Assertions.assertThat;

import com.proclenz.analytics.engine.CaseTrace;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class CaseTraceAssemblerTest {
    private static final Instant T0 = Instant.parse("2026-09-01T09:00:00Z");

    @Test
    void groupsContiguousRowsIntoOneTracePerCase() {
        List<CaseTrace> traces = new ArrayList<>();
        CaseTraceAssembler assembler = new CaseTraceAssembler(traces::add);

        assembler.add("A", "Created", T0);
        assembler.add("A", "Shipped", T0.plusSeconds(60));
        assembler.add("B", "Created", T0);
        long cases = assembler.finish();

        assertThat(cases).isEqualTo(2);
        assertThat(traces).extracting(CaseTrace::caseId).containsExactly("A", "B");
        assertThat(traces.getFirst().activities()).containsExactly("Created", "Shipped");
        assertThat(traces.get(1).activities()).containsExactly("Created");
    }

    @Test
    void emitsNothingWhenThereAreNoRows() {
        List<CaseTrace> traces = new ArrayList<>();

        assertThat(new CaseTraceAssembler(traces::add).finish()).isZero();
        assertThat(traces).isEmpty();
    }
}
