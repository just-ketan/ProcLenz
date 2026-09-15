package com.proclenz.common;

import java.time.Instant;
import tools.jackson.core.JacksonException;
import tools.jackson.core.exc.StreamReadException;
import tools.jackson.databind.exc.MismatchedInputException;

/** Client-safe descriptions of JSON failures that name the offending field without echoing class names or parser internals. */
public final class JsonErrorMessages {

    private JsonErrorMessages() {
    }

    public static String describe(Throwable cause) {
        if (cause instanceof StreamReadException) return "Request body is not valid JSON";
        if (cause instanceof JacksonException jackson && !jackson.getPath().isEmpty()) {
            String field = fieldPath(jackson);
            if (jackson instanceof MismatchedInputException mismatch && mismatch.getTargetType() == Instant.class) {
                return "Field '%s' must be an ISO-8601 instant such as 2026-09-15T09:00:00Z".formatted(field);
            }
            return "Field '%s' has an invalid value".formatted(field);
        }
        return "Request body is missing or unreadable";
    }

    private static String fieldPath(JacksonException exception) {
        StringBuilder path = new StringBuilder();
        for (JacksonException.Reference reference : exception.getPath()) {
            if (reference.getPropertyName() != null) {
                if (!path.isEmpty()) path.append('.');
                path.append(reference.getPropertyName());
            } else if (reference.getIndex() >= 0) {
                path.append('[').append(reference.getIndex()).append(']');
            }
        }
        return path.toString();
    }
}
