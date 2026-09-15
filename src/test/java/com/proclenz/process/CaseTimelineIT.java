package com.proclenz.process;

import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.proclenz.analytics.engine.VariantId;
import com.proclenz.support.IntegrationTest;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class CaseTimelineIT extends IntegrationTest {

    @Test
    void reconstructsTheBriefExampleOrderWithWaitingTimesAndRework() throws Exception {
        ingest(caseEvents("orders", "ORD-1001",
                "Order Created", 0,
                "Order Approved", 14,
                "Inventory Checked", 90,
                "Rework Required", 102,
                "Inventory Checked", 125,
                "Order Shipped", 140));

        mockMvc.perform(get("/api/v1/cases/ORD-1001/timeline").param("processKey", "orders"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.caseId").value("ORD-1001"))
                .andExpect(jsonPath("$.eventCount").value(6))
                .andExpect(jsonPath("$.durationMs").value(8_400_000))
                .andExpect(jsonPath("$.startedAt").value("2026-09-01T09:00:00Z"))
                .andExpect(jsonPath("$.reworkActivities", contains("Inventory Checked")))
                .andExpect(jsonPath("$.variantId").value(VariantId.of(List.of("Order Created", "Order Approved",
                        "Inventory Checked", "Rework Required", "Inventory Checked", "Order Shipped"))))
                .andExpect(jsonPath("$.events[*].activity", contains("Order Created", "Order Approved",
                        "Inventory Checked", "Rework Required", "Inventory Checked", "Order Shipped")))
                .andExpect(jsonPath("$.events[*].deltaFromPreviousMs", contains(0, 840_000, 4_560_000, 720_000, 1_380_000, 900_000)))
                .andExpect(jsonPath("$.events[*].elapsedMs", contains(0, 840_000, 5_400_000, 6_120_000, 7_500_000, 8_400_000)))
                .andExpect(jsonPath("$.events[*].rework", contains(false, false, false, false, true, false)))
                .andExpect(jsonPath("$.events[0].resource").value("system"))
                .andExpect(jsonPath("$.events[0].eventId").isNotEmpty());
    }

    @Test
    void simultaneousEventsKeepTheirArrivalOrder() throws Exception {
        String timestamp = "2026-09-01T12:00:00Z";
        for (String activity : List.of("Payment Received", "Invoice Generated")) {
            mockMvc.perform(post("/api/v1/events").contentType(MediaType.APPLICATION_JSON).content("""
                            {"processKey":"orders","caseId":"ORD-7","activity":"%s","timestamp":"%s"}""".formatted(activity, timestamp)))
                    .andExpect(status().isCreated());
        }

        mockMvc.perform(get("/api/v1/cases/ORD-7/timeline").param("processKey", "orders"))
                .andExpect(jsonPath("$.events[*].activity", contains("Payment Received", "Invoice Generated")))
                .andExpect(jsonPath("$.durationMs").value(0));
    }
}
