package com.proclenz.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.proclenz.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class BatchIngestionIT extends IntegrationTest {
    private static final String MIXED_BATCH = """
            [
              {"processKey":"orders","caseId":"ORD-1","activity":"Order Created","timestamp":"2026-09-01T09:00:00Z"},
              {"processKey":"orders","caseId":"ORD-1","activity":"Order Approved","timestamp":"2026-09-01T09:14:00Z"},
              {"processKey":"orders","caseId":"ORD-1","activity":"Order Created","timestamp":"2026-09-01T09:00:00Z"},
              {"processKey":"orders","caseId":" ","activity":"Order Created","timestamp":"2026-09-01T09:00:00Z"},
              {"processKey":"orders","caseId":"ORD-2","activity":"Order Created","timestamp":"not-a-time"},
              {"processKey":"orders","caseId":"ORD-2","activity":"Order Created","timestamp":"2026-09-01T10:00:00Z"}
            ]""";

    @Test
    void invalidItemsAreRejectedIndividuallyWithoutFailingTheBatch() throws Exception {
        submit(MIXED_BATCH, MediaType.APPLICATION_JSON)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.batchId").isNotEmpty())
                .andExpect(jsonPath("$.received").value(6))
                .andExpect(jsonPath("$.accepted").value(3))
                .andExpect(jsonPath("$.duplicates").value(1))
                .andExpect(jsonPath("$.conflicts").value(0))
                .andExpect(jsonPath("$.rejected").value(2))
                .andExpect(jsonPath("$.rejections[0].index").value(3))
                .andExpect(jsonPath("$.rejections[0].code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.rejections[0].message", containsString("caseId")))
                .andExpect(jsonPath("$.rejections[1].index").value(4))
                .andExpect(jsonPath("$.rejections[1].code").value("MALFORMED_REQUEST"))
                .andExpect(jsonPath("$.rejections[1].message", containsString("timestamp")));
        assertThat(storedEvents("orders")).isEqualTo(3);
    }

    @Test
    void resubmittingTheSameBatchWritesNothingNew() throws Exception {
        submit(MIXED_BATCH, MediaType.APPLICATION_JSON).andExpect(status().isOk());

        submit(MIXED_BATCH, MediaType.APPLICATION_JSON)
                .andExpect(jsonPath("$.accepted").value(0))
                .andExpect(jsonPath("$.duplicates").value(4))
                .andExpect(jsonPath("$.rejected").value(2));
        assertThat(storedEvents("orders")).isEqualTo(3);
    }

    @Test
    void acceptsNewlineDelimitedJson() throws Exception {
        String ndjson = """
                {"processKey":"orders","caseId":"ORD-9","activity":"Order Created","timestamp":"2026-09-01T09:00:00Z"}
                {"processKey":"orders","caseId":"ORD-9","activity":"Order Approved","timestamp":"2026-09-01T09:30:00Z"}
                {"processKey":"orders","caseId":"ORD-9","activity":"Order Shipped","timestamp":"2026-09-01T11:00:00Z"}
                """;

        submit(ndjson, MediaType.APPLICATION_NDJSON).andExpect(status().isOk()).andExpect(jsonPath("$.accepted").value(3));
    }

    @Test
    void streamsBatchesLargerThanOneChunk() throws Exception {
        int events = 1_234;
        StringBuilder body = new StringBuilder("[");
        for (int i = 0; i < events; i++) {
            if (i > 0) body.append(',');
            body.append("""
                    {"processKey":"bulk","caseId":"C-%d","activity":"Step","timestamp":"2026-09-01T09:00:00Z"}""".formatted(i));
        }
        body.append(']');

        submit(body.toString(), MediaType.APPLICATION_JSON).andExpect(jsonPath("$.accepted").value(events));
        assertThat(storedEvents("bulk")).isEqualTo(events);
    }

    @Test
    void malformedJsonMidStreamKeepsTheProcessedPrefixAndReportsIt() throws Exception {
        String truncated = """
                [{"processKey":"orders","caseId":"ORD-1","activity":"Order Created","timestamp":"2026-09-01T09:00:00Z"},
                 {"processKey":"orders","caseId":"ORD-1","activity":"Order Approved","timestamp":"2026-09-01T09:14:00Z"},
                 {"processKey":"orders","caseId": """;

        submit(truncated, MediaType.APPLICATION_JSON)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"))
                .andExpect(jsonPath("$.details.accepted").value(2));
        assertThat(storedEvents("orders")).isEqualTo(2);
    }

    @Test
    void reportsProducerIdConflictsInsideABatch() throws Exception {
        String batch = """
                [{"eventId":"evt-1","processKey":"orders","caseId":"ORD-1","activity":"Order Created","timestamp":"2026-09-01T09:00:00Z"},
                 {"eventId":"evt-1","processKey":"orders","caseId":"ORD-1","activity":"Order Cancelled","timestamp":"2026-09-01T09:00:00Z"}]""";

        submit(batch, MediaType.APPLICATION_JSON)
                .andExpect(jsonPath("$.accepted").value(1))
                .andExpect(jsonPath("$.conflicts").value(1))
                .andExpect(jsonPath("$.rejections[0].index").value(1))
                .andExpect(jsonPath("$.rejections[0].code").value("EVENT_ID_CONFLICT"));
    }

    private ResultActions submit(String body, MediaType contentType) throws Exception {
        return mockMvc.perform(post("/api/v1/events/batch").contentType(contentType).content(body));
    }

    private long storedEvents(String processKey) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM process_events WHERE process_key = ?", Long.class, processKey);
    }
}
