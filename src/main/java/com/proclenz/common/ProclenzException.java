package com.proclenz.common;

import java.util.List;
import java.util.Map;

/**
 * Expected business failure (not found, conflict, rule violation) carrying the error code that
 * decides the HTTP status. Unexpected failures stay as ordinary exceptions and become INTERNAL_ERROR.
 */
public class ProclenzException extends RuntimeException {
    private final ErrorCode code;
    private final List<ApiError.FieldError> fieldErrors;
    private final Map<String, Object> details;

    public ProclenzException(ErrorCode code, String message) {
        this(code, message, List.of(), Map.of());
    }

    public ProclenzException(ErrorCode code, String message, List<ApiError.FieldError> fieldErrors, Map<String, Object> details) {
        super(message);
        this.code = code;
        this.fieldErrors = List.copyOf(fieldErrors);
        this.details = Map.copyOf(details);
    }

    public ErrorCode code() {
        return code;
    }

    public List<ApiError.FieldError> fieldErrors() {
        return fieldErrors;
    }

    public Map<String, Object> details() {
        return details;
    }
}
