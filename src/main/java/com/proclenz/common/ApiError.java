package com.proclenz.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * The single error format for every failed API call. {@code traceId} equals the request's
 * correlation ID, so a client-reported error can be found in the server logs.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ApiError(
        Instant timestamp,
        int status,
        String code,
        String message,
        String path,
        String traceId,
        List<FieldError> fieldErrors,
        Map<String, Object> details) {

    public record FieldError(String field, String message) {
    }
}
