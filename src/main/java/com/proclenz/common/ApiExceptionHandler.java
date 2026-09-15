package com.proclenz.common;

import com.proclenz.observability.CorrelationIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.NestedRuntimeException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import tools.jackson.core.JacksonException;
import tools.jackson.core.exc.StreamReadException;
import tools.jackson.databind.exc.MismatchedInputException;

/**
 * Maps every failure to {@link ApiError}. Client mistakes become 4xx with an actionable message;
 * infrastructure outages become a retryable 503; anything unexpected becomes a generic 500 whose
 * details (stack trace, exception message) go only to the server log, keyed by the trace ID.
 */
@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);
    static final String RETRY_AFTER_SECONDS = "5";

    private final Clock clock;

    public ApiExceptionHandler(Clock clock) {
        this.clock = clock;
    }

    @ExceptionHandler(ProclenzException.class)
    ResponseEntity<ApiError> businessFailure(ProclenzException exception, HttpServletRequest request) {
        return respond(exception.code(), exception.getMessage(), request, exception.fieldErrors(), exception.details(), new HttpHeaders());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> invalidBody(MethodArgumentNotValidException exception, HttpServletRequest request) {
        List<ApiError.FieldError> fields = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new ApiError.FieldError(error.getField(), error.getDefaultMessage()))
                .toList();
        return respond(ErrorCode.VALIDATION_FAILED, "Request validation failed", request, fields);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ApiError> invalidParameters(HandlerMethodValidationException exception, HttpServletRequest request) {
        List<ApiError.FieldError> fields = exception.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> new ApiError.FieldError(result.getMethodParameter().getParameterName(), error.getDefaultMessage())))
                .toList();
        return respond(ErrorCode.VALIDATION_FAILED, "Request validation failed", request, fields);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> unreadableBody(HttpMessageNotReadableException exception, HttpServletRequest request) {
        return respond(ErrorCode.MALFORMED_REQUEST, describeUnreadableBody(exception.getCause()), request, List.of());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ApiError> parameterTypeMismatch(MethodArgumentTypeMismatchException exception, HttpServletRequest request) {
        String hint = exception.getRequiredType() == Duration.class ? " (expected an ISO-8601 duration such as PT4H or P2D)" : "";
        return respond(ErrorCode.MALFORMED_REQUEST, "Parameter '%s' has an invalid value%s".formatted(exception.getName(), hint), request, List.of());
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    ResponseEntity<ApiError> missingParameter(MissingServletRequestParameterException exception, HttpServletRequest request) {
        return respond(ErrorCode.MALFORMED_REQUEST, "Required parameter '%s' is missing".formatted(exception.getParameterName()), request, List.of());
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ApiError> unknownRoute(NoResourceFoundException exception, HttpServletRequest request) {
        return respond(ErrorCode.ROUTE_NOT_FOUND, "No endpoint %s %s".formatted(request.getMethod(), request.getRequestURI()), request, List.of());
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ApiError> methodNotAllowed(HttpRequestMethodNotSupportedException exception, HttpServletRequest request) {
        HttpHeaders headers = new HttpHeaders();
        if (exception.getSupportedHttpMethods() != null) headers.setAllow(exception.getSupportedHttpMethods());
        return respond(ErrorCode.METHOD_NOT_ALLOWED, "Method %s is not supported for this endpoint".formatted(exception.getMethod()),
                request, List.of(), Map.of(), headers);
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<ApiError> unsupportedMediaType(HttpMediaTypeNotSupportedException exception, HttpServletRequest request) {
        String contentType = exception.getContentType() == null ? "(none)" : exception.getContentType().toString();
        List<String> supported = exception.getSupportedMediaTypes().stream().map(MediaType::toString).toList();
        return respond(ErrorCode.UNSUPPORTED_MEDIA_TYPE, "Content type '%s' is not supported".formatted(contentType),
                request, List.of(), Map.of("supportedMediaTypes", supported), new HttpHeaders());
    }

    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    ResponseEntity<ApiError> notAcceptable(HttpMediaTypeNotAcceptableException exception, HttpServletRequest request) {
        return respond(ErrorCode.NOT_ACCEPTABLE, "None of the requested media types can be produced", request, List.of());
    }

    /** The database being unreachable is transient from the client's point of view: tell it to retry. */
    @ExceptionHandler({DataAccessResourceFailureException.class, TransientDataAccessException.class, CannotCreateTransactionException.class})
    ResponseEntity<ApiError> backingServiceUnavailable(NestedRuntimeException exception, HttpServletRequest request) {
        log.warn("Database unavailable during {} {}: {}", request.getMethod(), request.getRequestURI(), exception.getMostSpecificCause().toString());
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.RETRY_AFTER, RETRY_AFTER_SECONDS);
        return respond(ErrorCode.SERVICE_UNAVAILABLE, "The database is temporarily unavailable; retry the request later",
                request, List.of(), Map.of(), headers);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception exception, HttpServletRequest request) {
        log.error("Unhandled error during {} {}", request.getMethod(), request.getRequestURI(), exception);
        return respond(ErrorCode.INTERNAL_ERROR, "An unexpected error occurred; quote the traceId when reporting it", request, List.of());
    }

    /** Builds a client-safe message from Jackson's exception without echoing class names or parser internals. */
    static String describeUnreadableBody(Throwable cause) {
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

    private ResponseEntity<ApiError> respond(ErrorCode code, String message, HttpServletRequest request, List<ApiError.FieldError> fieldErrors) {
        return respond(code, message, request, fieldErrors, Map.of(), new HttpHeaders());
    }

    private ResponseEntity<ApiError> respond(ErrorCode code, String message, HttpServletRequest request,
                                             List<ApiError.FieldError> fieldErrors, Map<String, Object> details, HttpHeaders headers) {
        ApiError body = new ApiError(Instant.now(clock), code.httpStatus(), code.name(), message, request.getRequestURI(),
                CorrelationIdFilter.currentId(request), fieldErrors, details);
        return ResponseEntity.status(code.httpStatus()).headers(headers).body(body);
    }
}
