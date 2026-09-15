package com.proclenz.event;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public record EventRequest(
        @Size(max = 100) String processKey,
        @NotBlank @Size(max = 200) String caseId,
        @NotBlank @Size(max = 200) String activity,
        @NotNull Instant timestamp,
        @Size(max = 200) String resource) { }
