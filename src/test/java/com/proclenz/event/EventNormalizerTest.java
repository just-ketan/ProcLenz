package com.proclenz.event;

import static org.assertj.core.api.Assertions.assertThat;

import com.proclenz.common.ApiError;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class EventNormalizerTest {
    private static final Instant NOW = Instant.parse("2026-09-15T12:00:00Z");
    private static ValidatorFactory validatorFactory;
    private static EventNormalizer normalizer;

    @BeforeAll
    static void createNormalizer() {
        validatorFactory = Validation.buildDefaultValidatorFactory();
        normalizer = new EventNormalizer(validatorFactory.getValidator(), Clock.fixed(NOW, ZoneOffset.UTC),
                new IngestionProperties(500, Duration.ofHours(24), 100));
    }

    @AfterAll
    static void closeValidator() {
        validatorFactory.close();
    }

    @Test
    void canonicalisesWhitespaceDefaultsAndTimestampPrecision() {
        NormalizedEvent event = valid(new EventRequest(null, null, "  ORD-1 ", " Order Created ",
                Instant.parse("2026-09-01T09:00:00.123456789Z"), "   "));

        assertThat(event.processKey()).isEqualTo(EventNormalizer.DEFAULT_PROCESS_KEY);
        assertThat(event.caseId()).isEqualTo("ORD-1");
        assertThat(event.activity()).isEqualTo("Order Created");
        assertThat(event.resource()).isNull();
        assertThat(event.occurredAt()).isEqualTo(Instant.parse("2026-09-01T09:00:00.123456Z"));
        assertThat(event.identity()).isEqualTo(event.contentHash());
    }

    @Test
    void differentlyFormattedCopiesOfOneEventShareAnIdentity() {
        NormalizedEvent original = valid(new EventRequest(null, "orders", "ORD-1", "Order Created",
                Instant.parse("2026-09-01T09:00:00.123456Z"), "system"));
        NormalizedEvent resent = valid(new EventRequest(" ", "orders", " ORD-1", "Order Created ",
                Instant.parse("2026-09-01T09:00:00.123456999Z"), " system "));

        assertThat(resent.identity()).isEqualTo(original.identity());
        assertThat(resent.id()).isNotEqualTo(original.id());
    }

    @Test
    void rejectsTimestampsBeyondTheAllowedClockSkew() {
        EventValidation tooFar = normalizer.normalize(new EventRequest(null, "orders", "ORD-1", "Order Created", NOW.plus(Duration.ofHours(25)), null));
        EventValidation withinSkew = normalizer.normalize(new EventRequest(null, "orders", "ORD-1", "Order Created", NOW.plus(Duration.ofHours(23)), null));

        assertThat(tooFar).isInstanceOfSatisfying(EventValidation.Invalid.class, invalid ->
                assertThat(invalid.violations()).extracting(ApiError.FieldError::field).containsExactly("timestamp"));
        assertThat(withinSkew).isInstanceOf(EventValidation.Valid.class);
    }

    @Test
    void reportsEveryBeanValidationViolation() {
        EventValidation result = normalizer.normalize(new EventRequest(null, "orders/../x", " ", "Order Created", null, null));

        assertThat(result).isInstanceOfSatisfying(EventValidation.Invalid.class, invalid ->
                assertThat(invalid.violations()).extracting(ApiError.FieldError::field).containsExactly("caseId", "processKey", "timestamp"));
    }

    private static NormalizedEvent valid(EventRequest request) {
        EventValidation result = normalizer.normalize(request);
        assertThat(result).isInstanceOf(EventValidation.Valid.class);
        return ((EventValidation.Valid) result).event();
    }
}
