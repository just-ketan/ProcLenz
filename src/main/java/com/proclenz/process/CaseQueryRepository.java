package com.proclenz.process;

import com.proclenz.common.PageResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Case list aggregated inside PostgreSQL: one row per case with event count, start, end, duration and
 * variant ID, then filtered, sorted and paged. Only the requested page leaves the database. The variant
 * ID is computed with the same SHA-256 recipe as {@code VariantId}, so list rows can be joined to
 * variant analytics.
 */
@Repository
public class CaseQueryRepository {
    private static final String CASES = """
            WITH cases AS (
                SELECT case_id,
                       count(*) AS event_count,
                       min(occurred_at) AS started_at,
                       max(occurred_at) AS ended_at,
                       floor(extract(epoch FROM max(occurred_at) - min(occurred_at)) * 1000)::bigint AS duration_ms,
                       left(encode(sha256(convert_to(string_agg(activity, E'\\x1F' ORDER BY occurred_at, ingest_seq), 'UTF8')), 'hex'), 16) AS variant_id
                FROM process_events
                WHERE process_key = :processKey
                GROUP BY case_id
            ), filtered AS (
                SELECT * FROM cases
                WHERE (CAST(:minDurationMs AS bigint) IS NULL OR duration_ms >= :minDurationMs)
                  AND (CAST(:variantId AS text) IS NULL OR variant_id = :variantId)
            )
            """;
    private static final String PAGE = CASES + """
            SELECT case_id, event_count, started_at, ended_at, duration_ms, variant_id, count(*) OVER () AS total_cases
            FROM filtered
            ORDER BY %s, case_id
            LIMIT :limit OFFSET :offset
            """;
    private static final String COUNT = CASES + "SELECT count(*) FROM filtered";

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public CaseQueryRepository(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public PageResponse<CaseSummaryView> find(String processKey, CaseQuery query) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("processKey", processKey)
                .addValue("minDurationMs", query.minDurationMs(), Types.BIGINT)
                .addValue("variantId", query.variantId(), Types.VARCHAR)
                .addValue("limit", query.size())
                .addValue("offset", (long) query.page() * query.size());
        String orderBy = query.sort().column() + (query.descending() ? " DESC" : " ASC");
        long[] total = {0};
        List<CaseSummaryView> content = jdbcTemplate.query(PAGE.formatted(orderBy), parameters, (row, rowNumber) -> {
            total[0] = row.getLong("total_cases");
            return toView(row);
        });
        // The window count is only available when the page has rows; past the last page, count separately.
        if (content.isEmpty() && query.page() > 0) {
            total[0] = jdbcTemplate.queryForObject(COUNT, parameters, Long.class);
        }
        return PageResponse.of(content, query.page(), query.size(), total[0]);
    }

    private static CaseSummaryView toView(ResultSet row) throws SQLException {
        return new CaseSummaryView(row.getString("case_id"), row.getLong("event_count"),
                row.getObject("started_at", OffsetDateTime.class).toInstant(), row.getObject("ended_at", OffsetDateTime.class).toInstant(),
                row.getLong("duration_ms"), row.getString("variant_id"));
    }
}
