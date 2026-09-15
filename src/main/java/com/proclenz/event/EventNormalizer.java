package com.proclenz.event;

import com.proclenz.common.ApiError;
import jakarta.validation.Validator;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Validates events and puts them in canonical form so that equivalent submissions produce the same
 * identity: fields trimmed, blank optionals treated as absent, and timestamps truncated to the
 * microsecond precision PostgreSQL stores (otherwise a value read back from the database would hash
 * differently from the one originally submitted).
 */
@Component
public class EventNormalizer {
    public static final String DEFAULT_PROCESS_KEY = "default";

    private final Validator validator;
    private final Clock clock;
    private final IngestionProperties properties;

    public EventNormalizer(Validator validator, Clock clock, IngestionProperties properties) {
        this.validator = validator;
        this.clock = clock;
        this.properties = properties;
    }

    public EventValidation normalize(EventRequest request) {
        List<ApiError.FieldError> violations = validator.validate(request).stream()
                .map(violation -> new ApiError.FieldError(violation.getPropertyPath().toString(), violation.getMessage()))
                .sorted(Comparator.comparing(ApiError.FieldError::field))
                .collect(ArrayList::new, ArrayList::add, ArrayList::addAll);
        if (violations.isEmpty() && request.timestamp().isAfter(clock.instant().plus(properties.maxClockSkew()))) {
            violations.add(new ApiError.FieldError("timestamp", "must not be more than %s in the future".formatted(properties.maxClockSkew())));
        }
        if (!violations.isEmpty()) return new EventValidation.Invalid(List.copyOf(violations));

        String processKey = isBlank(request.processKey()) ? DEFAULT_PROCESS_KEY : request.processKey().trim();
        String caseId = request.caseId().trim();
        String activity = request.activity().trim();
        Instant occurredAt = request.timestamp().truncatedTo(ChronoUnit.MICROS);
        String resource = trimToNull(request.resource());
        String producerEventId = trimToNull(request.eventId());
        String contentHash = EventIdentity.contentHash(processKey, caseId, activity, occurredAt, resource);
        return new EventValidation.Valid(new NormalizedEvent(UUID.randomUUID(), processKey, caseId, activity, occurredAt,
                resource, producerEventId, contentHash, EventIdentity.identity(processKey, producerEventId, contentHash)));
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String trimToNull(String value) {
        return isBlank(value) ? null : value.trim();
    }
}
