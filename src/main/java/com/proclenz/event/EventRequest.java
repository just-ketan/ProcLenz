package com.proclenz.event;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;

/**
 * An event as submitted by a producer.
 *
 * @param eventId    optional producer-assigned ID; when present it is the idempotency key
 * @param processKey process the event belongs to; defaults to {@code default}
 * @param timestamp  when the activity happened in the source system (ISO-8601 instant)
 */
public record EventRequest(
        @Size(max = 200) String eventId,
        @Size(max = 100) @Pattern(regexp = "[A-Za-z0-9._-]*", message = "must contain only letters, digits, '.', '_' or '-'") String processKey,
        @NotBlank @Size(max = 200) String caseId,
        @NotBlank @Size(max = 200) String activity,
        @NotNull Instant timestamp,
        @Size(max = 200) String resource) {
}
