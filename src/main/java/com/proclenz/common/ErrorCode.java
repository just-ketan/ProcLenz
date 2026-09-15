package com.proclenz.common;

/** Stable, machine-readable error codes. Clients branch on {@code code}; {@code message} is for humans. */
public enum ErrorCode {
    VALIDATION_FAILED(400),
    MALFORMED_REQUEST(400),
    ROUTE_NOT_FOUND(404),
    CASE_NOT_FOUND(404),
    METHOD_NOT_ALLOWED(405),
    NOT_ACCEPTABLE(406),
    UNSUPPORTED_MEDIA_TYPE(415),
    INTERNAL_ERROR(500),
    SERVICE_UNAVAILABLE(503);

    private final int httpStatus;

    ErrorCode(int httpStatus) {
        this.httpStatus = httpStatus;
    }

    public int httpStatus() {
        return httpStatus;
    }
}
