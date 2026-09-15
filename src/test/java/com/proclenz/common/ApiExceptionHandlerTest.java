package com.proclenz.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.mock.web.MockHttpServletRequest;

class ApiExceptionHandlerTest {
    private static final Instant NOW = Instant.parse("2026-09-15T10:00:00Z");

    private final ApiExceptionHandler handler = new ApiExceptionHandler(Clock.fixed(NOW, ZoneOffset.UTC));
    private final MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/events");

    @Test
    void unexpectedFailureNeverExposesInternalDetails() {
        ResponseEntity<ApiError> response = handler.unexpected(new IllegalStateException("password=hunter2 in com.proclenz.Secret"), request);

        ApiError body = response.getBody();
        assertThat(response.getStatusCode().value()).isEqualTo(500);
        assertThat(body.code()).isEqualTo("INTERNAL_ERROR");
        assertThat(body.message()).doesNotContain("hunter2").doesNotContain("com.proclenz");
        assertThat(body.timestamp()).isEqualTo(NOW);
        assertThat(body.path()).isEqualTo("/api/v1/events");
    }

    @Test
    void databaseOutageIsARetryableServiceUnavailable() {
        ResponseEntity<ApiError> response = handler.backingServiceUnavailable(new CannotGetJdbcConnectionException("Connection to db:5432 refused"), request);

        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo(ApiExceptionHandler.RETRY_AFTER_SECONDS);
        assertThat(response.getBody().code()).isEqualTo("SERVICE_UNAVAILABLE");
        assertThat(response.getBody().message()).doesNotContain("5432");
    }

    @Test
    void businessFailureKeepsItsCodeAndDetails() {
        ProclenzException failure = new ProclenzException(ErrorCode.CASE_NOT_FOUND, "Case 'X' was not found", List.of(), Map.of("caseId", "X"));

        ResponseEntity<ApiError> response = handler.businessFailure(failure, request);

        assertThat(response.getStatusCode().value()).isEqualTo(404);
        assertThat(response.getBody().code()).isEqualTo("CASE_NOT_FOUND");
        assertThat(response.getBody().details()).containsEntry("caseId", "X");
    }

    @Test
    void serviceUnavailableBusinessFailureAlsoAdvisesRetry() {
        ProclenzException interrupted = new ProclenzException(ErrorCode.SERVICE_UNAVAILABLE, "Batch interrupted", List.of(), Map.of("accepted", 10L));

        ResponseEntity<ApiError> response = handler.businessFailure(interrupted, request);

        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo(ApiExceptionHandler.RETRY_AFTER_SECONDS);
        assertThat(response.getBody().details()).containsEntry("accepted", 10L);
    }

    @Test
    void missingBodyGetsAGenericMessage() {
        assertThat(JsonErrorMessages.describe(null)).isEqualTo("Request body is missing or unreadable");
    }
}
