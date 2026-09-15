package com.proclenz.common;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * @param allowedOrigins origins or origin patterns (e.g. {@code https://*.vercel.app}, {@code http://localhost:[*]})
 *                       whose browser pages may call the API and actuator endpoints
 */
@ConfigurationProperties("proclenz.cors")
public record CorsProperties(@DefaultValue List<String> allowedOrigins) {
}
