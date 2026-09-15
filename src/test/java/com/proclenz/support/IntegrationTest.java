package com.proclenz.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Base for tests that exercise REST → service → PostgreSQL through the full Spring context and the
 * real Flyway schema. Every test starts from empty application tables.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
public abstract class IntegrationTest {
    protected static final Instant DAY_START = Instant.parse("2026-09-01T09:00:00Z");

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected JdbcTemplate jdbcTemplate;

    @BeforeEach
    void truncateApplicationTables() {
        List<String> tables = jdbcTemplate.queryForList(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'flyway_schema_history'", String.class);
        if (!tables.isEmpty()) {
            jdbcTemplate.execute("TRUNCATE TABLE " + String.join(", ", tables) + " RESTART IDENTITY CASCADE");
        }
    }

    /** JSON events for one case: activities paired with minute offsets from {@link #DAY_START}. */
    protected static List<String> caseEvents(String processKey, String caseId, Object... activityMinutePairs) {
        List<String> events = new ArrayList<>();
        for (int i = 0; i < activityMinutePairs.length; i += 2) {
            Instant timestamp = DAY_START.plus(Duration.ofMinutes(((Number) activityMinutePairs[i + 1]).longValue()));
            events.add("""
                    {"processKey":"%s","caseId":"%s","activity":"%s","timestamp":"%s","resource":"system"}"""
                    .formatted(processKey, caseId, activityMinutePairs[i], timestamp));
        }
        return events;
    }

    protected void ingest(List<String> events) throws Exception {
        mockMvc.perform(post("/api/v1/events/batch").contentType(MediaType.APPLICATION_JSON).content("[" + String.join(",", events) + "]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rejected").value(0));
    }
}
