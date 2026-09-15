package com.proclenz.analytics;

import com.proclenz.analytics.engine.SlaThreshold;
import com.proclenz.common.ApiError;
import com.proclenz.common.ErrorCode;
import com.proclenz.common.ProclenzException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Decides which SLA threshold applies: an explicit request value wins, otherwise the platform default. */
@Component
public class SlaPolicy {
    private final AnalyticsProperties properties;

    public SlaPolicy(AnalyticsProperties properties) {
        this.properties = properties;
    }

    public SlaThreshold resolve(String parameterName, Duration requested) {
        if (requested == null) return new SlaThreshold(properties.defaultSla(), SlaThreshold.Source.DEFAULT);
        if (requested.isNegative() || requested.isZero()) {
            throw new ProclenzException(ErrorCode.VALIDATION_FAILED, "SLA threshold must be a positive duration",
                    List.of(new ApiError.FieldError(parameterName, "must be a positive ISO-8601 duration such as P2D")), Map.of());
        }
        return new SlaThreshold(requested, SlaThreshold.Source.REQUEST);
    }
}
