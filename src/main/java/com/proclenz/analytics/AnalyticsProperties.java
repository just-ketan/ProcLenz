package com.proclenz.analytics;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * @param defaultSla      case-duration SLA used when neither the request nor the process defines one
 * @param streamFetchSize rows fetched per round trip while streaming events into the miner
 */
@Validated
@ConfigurationProperties("proclenz.analytics")
public record AnalyticsProperties(
        @DefaultValue("P7D") @NotNull Duration defaultSla,
        @DefaultValue("2000") @Min(100) @Max(50_000) int streamFetchSize) {
}
