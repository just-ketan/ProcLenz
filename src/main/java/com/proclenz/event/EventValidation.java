package com.proclenz.event;

import com.proclenz.common.ApiError;
import java.util.List;

/** Outcome of validating one event. A result type rather than an exception, because invalid items are routine in bulk ingestion. */
public sealed interface EventValidation {

    record Valid(NormalizedEvent event) implements EventValidation {
    }

    record Invalid(List<ApiError.FieldError> violations) implements EventValidation {
    }
}
