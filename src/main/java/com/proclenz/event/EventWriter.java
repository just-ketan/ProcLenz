package com.proclenz.event;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Repository;

/**
 * Idempotent bulk writer for the append-only event log, shared by every ingestion channel.
 *
 * <p>A chunk is written with one {@code INSERT ... SELECT FROM unnest(...) ON CONFLICT (event_identity)
 * DO NOTHING RETURNING event_identity} statement. The unique constraint is the only duplicate
 * authority: racing requests, retried batches and redelivered messages all resolve inside
 * PostgreSQL, where the first writer inserts and every other writer inserts nothing. There is no
 * check-then-insert window and no exception-driven control flow. JDBC is used instead of JPA
 * because the event log is append-only and high-volume; a persistence context adds nothing here.
 */
@Repository
public class EventWriter {
    private static final String INSERT_CHUNK = """
            INSERT INTO process_events (id, process_key, case_id, activity, occurred_at, resource, source_event_id, content_hash, event_identity)
            SELECT id::uuid, process_key, case_id, activity, occurred_at::timestamptz, resource, source_event_id, content_hash, event_identity
            FROM unnest(?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[])
                 AS incoming(id, process_key, case_id, activity, occurred_at, resource, source_event_id, content_hash, event_identity)
            ON CONFLICT (event_identity) DO NOTHING
            RETURNING event_identity
            """;
    private static final String STORED_CONTENT_HASHES =
            "SELECT event_identity, content_hash FROM process_events WHERE event_identity = ANY(?::text[])";

    private final JdbcTemplate jdbcTemplate;

    public EventWriter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Writes validated events and returns one outcome per input, in input order. The caller owns the
     * transaction, which defines the atomic unit.
     */
    public List<IngestionOutcome> write(List<NormalizedEvent> events) {
        if (events.isEmpty()) return List.of();
        Map<String, NormalizedEvent> firstByIdentity = new LinkedHashMap<>();
        events.forEach(event -> firstByIdentity.putIfAbsent(event.identity(), event));

        Set<String> inserted = insert(List.copyOf(firstByIdentity.values()));
        Map<String, String> storedHashes = storedHashesOfReplayedProducerIds(firstByIdentity.values(), inserted);

        List<IngestionOutcome> outcomes = new ArrayList<>(events.size());
        Set<String> acceptedIdentities = new HashSet<>();
        for (NormalizedEvent event : events) {
            String identity = event.identity();
            if (inserted.contains(identity) && acceptedIdentities.add(identity)) {
                outcomes.add(IngestionOutcome.ACCEPTED);
                continue;
            }
            String originalHash = inserted.contains(identity)
                    ? firstByIdentity.get(identity).contentHash()
                    : storedHashes.getOrDefault(identity, event.contentHash());
            outcomes.add(originalHash.equals(event.contentHash()) ? IngestionOutcome.DUPLICATE : IngestionOutcome.CONFLICT);
        }
        return outcomes;
    }

    private Set<String> insert(List<NormalizedEvent> events) {
        List<String> inserted = jdbcTemplate.query(connection -> {
            PreparedStatement statement = connection.prepareStatement(INSERT_CHUNK);
            bindTextArray(connection, statement, 1, events, event -> event.id().toString());
            bindTextArray(connection, statement, 2, events, NormalizedEvent::processKey);
            bindTextArray(connection, statement, 3, events, NormalizedEvent::caseId);
            bindTextArray(connection, statement, 4, events, NormalizedEvent::activity);
            bindTextArray(connection, statement, 5, events, event -> event.occurredAt().toString());
            bindTextArray(connection, statement, 6, events, NormalizedEvent::resource);
            bindTextArray(connection, statement, 7, events, NormalizedEvent::sourceEventId);
            bindTextArray(connection, statement, 8, events, NormalizedEvent::contentHash);
            bindTextArray(connection, statement, 9, events, NormalizedEvent::identity);
            return statement;
        }, (row, rowNumber) -> row.getString(1));
        return new HashSet<>(inserted);
    }

    /**
     * Content-derived identities cannot conflict (same identity means same content), so the stored
     * hash is only needed for replayed producer event IDs.
     */
    private Map<String, String> storedHashesOfReplayedProducerIds(Iterable<NormalizedEvent> candidates, Set<String> inserted) {
        List<String> replayed = new ArrayList<>();
        candidates.forEach(event -> {
            if (event.sourceEventId() != null && !inserted.contains(event.identity())) replayed.add(event.identity());
        });
        if (replayed.isEmpty()) return Map.of();
        Map<String, String> stored = new HashMap<>();
        jdbcTemplate.query(connection -> {
            PreparedStatement statement = connection.prepareStatement(STORED_CONTENT_HASHES);
            statement.setArray(1, connection.createArrayOf("text", replayed.toArray(String[]::new)));
            return statement;
        }, (RowCallbackHandler) row -> stored.put(row.getString(1), row.getString(2)));
        return stored;
    }

    private static void bindTextArray(Connection connection, PreparedStatement statement, int parameterIndex,
                                      List<NormalizedEvent> events, Function<NormalizedEvent, String> column) throws SQLException {
        String[] values = new String[events.size()];
        for (int i = 0; i < values.length; i++) values[i] = column.apply(events.get(i));
        statement.setArray(parameterIndex, connection.createArrayOf("text", values));
    }
}
