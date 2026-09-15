package com.proclenz.analytics;

import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.proclenz.support.IntegrationTest;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** End-to-end: events ingested over REST, mined from PostgreSQL, returned as process intelligence. */
class AnalyticsIT extends IntegrationTest {
    private static final String BASE = "/api/v1/processes/order-to-cash";

    @BeforeEach
    void seedOrderToCash() throws Exception {
        List<String> events = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            events.addAll(caseEvents("order-to-cash", "HAPPY-" + i, "Created", 0, "Credit Check", 10, "Approved", 30, "Shipped", 90, "Paid", 150));
        }
        for (int i = 0; i < 3; i++) {
            events.addAll(caseEvents("order-to-cash", "SLOW-APPROVAL-" + i, "Created", 0, "Credit Check", 10, "Approved", 610, "Shipped", 670, "Paid", 730));
        }
        for (int i = 0; i < 3; i++) {
            events.addAll(caseEvents("order-to-cash", "REWORK-" + i, "Created", 0, "Credit Check", 10, "Credit Check", 40, "Approved", 60, "Shipped", 120, "Paid", 180));
        }
        for (int i = 0; i < 2; i++) {
            events.addAll(caseEvents("order-to-cash", "NO-CREDIT-CHECK-" + i, "Created", 0, "Approved", 20, "Shipped", 80, "Paid", 140));
        }
        ingest(events);
    }

    @Test
    void summarisesTheProcess() throws Exception {
        mockMvc.perform(get(BASE + "/summary").param("sla", "PT8H"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.caseCount").value(20))
                .andExpect(jsonPath("$.eventCount").value(101))
                .andExpect(jsonPath("$.activityCount").value(5))
                .andExpect(jsonPath("$.variantCount").value(3))
                .andExpect(jsonPath("$.topVariantCasePercent").value(75.0))
                .andExpect(jsonPath("$.reworkRatePercent").value(15.0))
                .andExpect(jsonPath("$.sla.violatingCases").value(3))
                .andExpect(jsonPath("$.sla.source").value("REQUEST"));
    }

    /** Slow approvals follow the happy path's sequence, so they share its variant and show up as a long duration tail. */
    @Test
    void discoversVariantsWithPagination() throws Exception {
        mockMvc.perform(get(BASE + "/variants").param("size", "2"))
                .andExpect(jsonPath("$.totalVariants").value(3))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.variants[0].caseCount").value(15))
                .andExpect(jsonPath("$.variants[0].sequence").value("Created → Credit Check → Approved → Shipped → Paid"))
                .andExpect(jsonPath("$.variants[0].medianDurationMs").value(9_000_000))
                .andExpect(jsonPath("$.variants[0].p95DurationMs").value(43_800_000));

        mockMvc.perform(get(BASE + "/variants").param("size", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("size"));
    }

    @Test
    void detectsReworkAndBottlenecks() throws Exception {
        mockMvc.perform(get(BASE + "/rework"))
                .andExpect(jsonPath("$.casesWithRework").value(3))
                .andExpect(jsonPath("$.activities[0].activity").value("Credit Check"));

        mockMvc.perform(get(BASE + "/bottlenecks"))
                .andExpect(jsonPath("$.bottlenecks[0].fromActivity").value("Credit Check"))
                .andExpect(jsonPath("$.bottlenecks[0].toActivity").value("Approved"))
                .andExpect(jsonPath("$.bottlenecks[0].waitSharePercent").value(43.66))
                .andExpect(jsonPath("$.bottlenecks[0].severity").value("HIGH"))
                .andExpect(jsonPath("$.scoringModel", startsWith("impact = waitShare")));
    }

    @Test
    void measuresSlaAgainstRequestAndDefaultThresholds() throws Exception {
        mockMvc.perform(get(BASE + "/sla").param("threshold", "PT8H"))
                .andExpect(jsonPath("$.violatingCases").value(3))
                .andExpect(jsonPath("$.violationRatePercent").value(15.0))
                .andExpect(jsonPath("$.worstViolations[0].caseId").value("SLOW-APPROVAL-0"))
                .andExpect(jsonPath("$.worstViolations[0].overByMs").value(15_000_000));

        mockMvc.perform(get(BASE + "/sla"))
                .andExpect(jsonPath("$.thresholdSource").value("DEFAULT"))
                .andExpect(jsonPath("$.thresholdMs").value(604_800_000))
                .andExpect(jsonPath("$.violatingCases").value(0));

        mockMvc.perform(get(BASE + "/sla").param("threshold", "-PT1H"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].field").value("threshold"));
    }

    @Test
    void buildsAFrontendReadyGraph() throws Exception {
        mockMvc.perform(get(BASE + "/graph"))
                .andExpect(jsonPath("$.nodes[0].id").value("__start__"))
                .andExpect(jsonPath("$.nodes[-1:].id", hasItems("__end__")))
                .andExpect(jsonPath("$.edges[?(@.source == 'Created' && @.target == 'Credit Check')].percentOfSourceOutgoing", hasItems(90.0)))
                .andExpect(jsonPath("$.edges[?(@.source == 'Credit Check' && @.target == 'Credit Check')].reworkEdge", hasItems(true)));
    }

    @Test
    void turnsMetricsIntoInsights() throws Exception {
        mockMvc.perform(get(BASE + "/insights").param("sla", "PT8H"))
                .andExpect(jsonPath("$.insights[*].type", hasItems("BOTTLENECK", "SLA_RISK", "REWORK_HOTSPOT", "SKIPPED_ACTIVITY")))
                .andExpect(jsonPath("$.insights[0].severity").value("HIGH"));
    }

    @Test
    void unknownProcessIsNotFound() throws Exception {
        mockMvc.perform(get("/api/v1/processes/does-not-exist/graph"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PROCESS_NOT_FOUND"));
    }
}
