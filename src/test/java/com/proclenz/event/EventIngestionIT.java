package com.proclenz.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.proclenz.support.IntegrationTest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

class EventIngestionIT extends IntegrationTest {
    private static final String ORDER_CREATED = """
            {"processKey":"orders","caseId":"ORD-1001","activity":"Order Created","timestamp":"2026-09-01T09:00:00Z","resource":"system"}""";

    @Autowired
    private EventService eventService;

    @Test
    void acceptsANewEventWithLocationAndPersistsIt() throws Exception {
        MvcResult created = submit(ORDER_CREATED)
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", startsWith("/api/v1/events/")))
                .andExpect(jsonPath("$.status").value("ACCEPTED"))
                .andReturn();

        assertThat(storedEvents("orders")).isEqualTo(1);
        mockMvc.perform(get(created.getResponse().getHeader("Location")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.caseId").value("ORD-1001"))
                .andExpect(jsonPath("$.timestamp").value("2026-09-01T09:00:00Z"))
                .andExpect(jsonPath("$.ingestedAt").isNotEmpty());
    }

    @Test
    void replayingAnEventIsAnIdempotentSuccessThatReturnsTheOriginalId() throws Exception {
        String originalId = JsonPath.read(submit(ORDER_CREATED).andReturn().getResponse().getContentAsString(), "$.eventId");

        submit(ORDER_CREATED)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DUPLICATE"))
                .andExpect(jsonPath("$.eventId").value(originalId));
        assertThat(storedEvents("orders")).isEqualTo(1);
    }

    @Test
    void whitespaceAndSubMicrosecondDifferencesAreTheSameEvent() throws Exception {
        submit(ORDER_CREATED).andExpect(status().isCreated());

        submit("""
                {"processKey":"orders","caseId":" ORD-1001 ","activity":"Order Created","timestamp":"2026-09-01T09:00:00.000000900Z","resource":" system "}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DUPLICATE"));
        assertThat(storedEvents("orders")).isEqualTo(1);
    }

    @Test
    void reusingAProducerEventIdForDifferentContentIsAConflict() throws Exception {
        String created = """
                {"eventId":"evt-77","processKey":"orders","caseId":"ORD-1","activity":"Order Created","timestamp":"2026-09-01T09:00:00Z"}""";
        String cancelled = """
                {"eventId":"evt-77","processKey":"orders","caseId":"ORD-1","activity":"Order Cancelled","timestamp":"2026-09-01T09:00:00Z"}""";

        submit(created).andExpect(status().isCreated());
        submit(created).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DUPLICATE"));
        submit(cancelled)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EVENT_ID_CONFLICT"))
                .andExpect(jsonPath("$.details.eventId").value("evt-77"));
        assertThat(storedEvents("orders")).isEqualTo(1);
    }

    @Test
    void rejectsEventsTimestampedFarInTheFuture() throws Exception {
        Instant future = Instant.now().plus(Duration.ofDays(3));

        submit("""
                {"processKey":"orders","caseId":"ORD-1","activity":"Order Created","timestamp":"%s"}""".formatted(future))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("timestamp"));
        assertThat(storedEvents("orders")).isZero();
    }

    @Test
    void unknownEventIsNotFound() throws Exception {
        mockMvc.perform(get("/api/v1/events/" + UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EVENT_NOT_FOUND"));
    }

    @Test
    void concurrentSubmissionsOfOneEventPersistExactlyOneRow() throws Exception {
        int clients = 16;
        EventRequest request = new EventRequest(null, "orders", "RACE-1", "Order Created", Instant.parse("2026-09-01T09:00:00Z"), "system");
        CountDownLatch startTogether = new CountDownLatch(1);
        List<IngestionOutcome> outcomes = new ArrayList<>();

        try (ExecutorService pool = Executors.newFixedThreadPool(clients)) {
            List<Future<EventIngestionResult>> results = new ArrayList<>();
            for (int i = 0; i < clients; i++) {
                results.add(pool.submit(() -> {
                    startTogether.await();
                    return eventService.ingest(request);
                }));
            }
            startTogether.countDown();
            for (Future<EventIngestionResult> result : results) outcomes.add(result.get(60, TimeUnit.SECONDS).status());
        }

        assertThat(outcomes).filteredOn(outcome -> outcome == IngestionOutcome.ACCEPTED).hasSize(1);
        assertThat(outcomes).filteredOn(outcome -> outcome == IngestionOutcome.DUPLICATE).hasSize(clients - 1);
        assertThat(storedEvents("orders")).isEqualTo(1);
    }

    private ResultActions submit(String json) throws Exception {
        return mockMvc.perform(post("/api/v1/events").contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private long storedEvents(String processKey) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM process_events WHERE process_key = ?", Long.class, processKey);
    }
}
