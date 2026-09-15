package com.proclenz.analytics;

import com.proclenz.analytics.engine.CaseTrace;
import java.sql.PreparedStatement;
import java.time.OffsetDateTime;
import java.util.function.Consumer;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Streams a process's events into case traces. Reads three narrow columns through JDBC instead of
 * loading entities, and never materialises the result set: rows are pulled {@code streamFetchSize}
 * at a time and discarded once their case has been handed to the consumer.
 */
@Repository
public class CaseTraceReader {
    /** Served in index order by idx_event_case_time (process_key, case_id, occurred_at). */
    private static final String EVENTS_IN_CASE_ORDER = """
            SELECT case_id, activity, occurred_at
            FROM process_events
            WHERE process_key = ?
            ORDER BY case_id, occurred_at, ingest_seq
            """;

    private final JdbcTemplate jdbcTemplate;
    private final AnalyticsProperties properties;

    public CaseTraceReader(JdbcTemplate jdbcTemplate, AnalyticsProperties properties) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties;
    }

    /**
     * Requires a surrounding transaction: the PostgreSQL driver only uses a server-side cursor (and
     * therefore honours the fetch size) when autocommit is off. Without one it would silently buffer
     * every row in memory, so a missing transaction fails fast instead.
     *
     * @return number of cases streamed
     */
    @Transactional(propagation = Propagation.MANDATORY, readOnly = true)
    public long forEachCase(String processKey, Consumer<CaseTrace> consumer) {
        CaseTraceAssembler assembler = new CaseTraceAssembler(consumer);
        jdbcTemplate.query(connection -> {
            PreparedStatement statement = connection.prepareStatement(EVENTS_IN_CASE_ORDER);
            statement.setFetchSize(properties.streamFetchSize());
            statement.setString(1, processKey);
            return statement;
        }, (RowCallbackHandler) row -> assembler.add(row.getString(1), row.getString(2), row.getObject(3, OffsetDateTime.class).toInstant()));
        return assembler.finish();
    }
}
