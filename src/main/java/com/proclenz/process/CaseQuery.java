package com.proclenz.process;

import com.proclenz.common.ApiError;
import com.proclenz.common.ErrorCode;
import com.proclenz.common.ProclenzException;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/** Filter, sort and page for the case list. Sort fields map to a fixed column whitelist, never to raw input. */
public record CaseQuery(Long minDurationMs, String variantId, Sort sort, boolean descending, int page, int size) {

    public enum Sort {
        CASE_ID("caseId", "case_id"),
        STARTED_AT("startedAt", "started_at"),
        DURATION("durationMs", "duration_ms"),
        EVENT_COUNT("eventCount", "event_count");

        private final String parameter;
        private final String column;

        Sort(String parameter, String column) {
            this.parameter = parameter;
            this.column = column;
        }

        String column() {
            return column;
        }

        static Sort fromParameter(String value) {
            return Arrays.stream(values())
                    .filter(sort -> sort.parameter.equals(value))
                    .findFirst()
                    .orElseThrow(() -> invalid("sort", "must be one of " + Arrays.stream(values()).map(sort -> sort.parameter).collect(Collectors.joining(", "))));
        }
    }

    public static CaseQuery of(Long minDurationMs, String variantId, String sort, String direction, int page, int size) {
        boolean descending = switch (direction.toLowerCase(Locale.ROOT)) {
            case "desc" -> true;
            case "asc" -> false;
            default -> throw invalid("direction", "must be asc or desc");
        };
        String variant = variantId == null || variantId.isBlank() ? null : variantId.trim();
        return new CaseQuery(minDurationMs, variant, Sort.fromParameter(sort), descending, page, size);
    }

    private static ProclenzException invalid(String field, String message) {
        return new ProclenzException(ErrorCode.VALIDATION_FAILED, "Invalid case query", List.of(new ApiError.FieldError(field, message)), Map.of());
    }
}
