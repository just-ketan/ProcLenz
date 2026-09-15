package com.proclenz.common;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> validation(MethodArgumentNotValidException exception) {
        List<ApiError.FieldError> fields = exception.getBindingResult().getFieldErrors().stream().map(error -> new ApiError.FieldError(error.getField(), error.getDefaultMessage())).toList();
        return ResponseEntity.badRequest().body(new ApiError(Instant.now(), 400, "VALIDATION_FAILED", "Request validation failed", fields));
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception exception) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(new ApiError(Instant.now(), 500, "INTERNAL_ERROR", "An unexpected error occurred", List.of()));
    }
}
