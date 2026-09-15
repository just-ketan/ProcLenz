package com.proclenz.event;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * @param chunkSize             events written per transaction; bounds memory and rollback scope
 * @param maxClockSkew          how far in the future an event timestamp may be before it is rejected
 * @param maxReportedRejections rejected items listed individually in a batch response
 */
@Validated
@ConfigurationProperties("proclenz.ingestion")
public record IngestionProperties(
        @DefaultValue("500") @Min(1) @Max(5000) int chunkSize,
        @DefaultValue("PT24H") @NotNull Duration maxClockSkew,
        @DefaultValue("100") @Min(0) int maxReportedRejections) {
}
