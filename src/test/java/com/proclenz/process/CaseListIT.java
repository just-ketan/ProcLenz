package com.proclenz.process;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.proclenz.analytics.engine.VariantId;
import com.proclenz.support.IntegrationTest;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CaseListIT extends IntegrationTest {

    @BeforeEach
    void seedCases() throws Exception {
        List<String> events = new ArrayList<>();
        events.addAll(caseEvents("orders", "LONG", "A", 0, "B", 100, "C", 300));
        events.addAll(caseEvents("orders", "SHORT", "A", 0, "B", 5, "C", 10));
        events.addAll(caseEvents("orders", "MEDIUM", "A", 0, "C", 60));
        events.addAll(caseEvents("orders", "REWORK", "A", 0, "B", 20, "A", 50, "C", 100));
        ingest(events);
    }

    @Test
    void listsCasesLongestFirstByDefault() throws Exception {
        mockMvc.perform(get("/api/v1/processes/orders/cases"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].caseId", contains("LONG", "REWORK", "MEDIUM", "SHORT")))
                .andExpect(jsonPath("$.content[0].durationMs").value(18_000_000))
                .andExpect(jsonPath("$.content[1].eventCount").value(4))
                .andExpect(jsonPath("$.totalElements").value(4));
    }

    @Test
    void sortsFiltersAndPages() throws Exception {
        mockMvc.perform(get("/api/v1/processes/orders/cases").param("sort", "caseId").param("direction", "asc"))
                .andExpect(jsonPath("$.content[*].caseId", contains("LONG", "MEDIUM", "REWORK", "SHORT")));

        mockMvc.perform(get("/api/v1/processes/orders/cases").param("minDurationMs", "3600000"))
                .andExpect(jsonPath("$.content[*].caseId", contains("LONG", "REWORK", "MEDIUM")));

        mockMvc.perform(get("/api/v1/processes/orders/cases").param("size", "3").param("page", "1"))
                .andExpect(jsonPath("$.content[*].caseId", contains("SHORT")))
                .andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.totalPages").value(2));

        mockMvc.perform(get("/api/v1/processes/orders/cases").param("size", "3").param("page", "5"))
                .andExpect(jsonPath("$.content").isEmpty())
                .andExpect(jsonPath("$.totalElements").value(4));
    }

    @Test
    void variantIdComputedInSqlMatchesTheEngine() throws Exception {
        String straightThrough = VariantId.of(List.of("A", "B", "C"));

        mockMvc.perform(get("/api/v1/processes/orders/cases").param("variantId", straightThrough))
                .andExpect(jsonPath("$.content[*].caseId", containsInAnyOrder("LONG", "SHORT")))
                .andExpect(jsonPath("$.content[0].variantId").value(straightThrough));
    }

    @Test
    void rejectsUnknownSortFields() throws Exception {
        mockMvc.perform(get("/api/v1/processes/orders/cases").param("sort", "case_id; DROP TABLE process_events"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("sort"));
    }
}
