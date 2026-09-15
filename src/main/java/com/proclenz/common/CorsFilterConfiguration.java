package com.proclenz.common;

import com.proclenz.observability.CorrelationIdFilter;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

/**
 * Lets browser frontends on other origins (the Vercel-hosted UI, a local dev server) call the REST API and
 * the actuator endpoints. A servlet filter applies the same rules to both, including error responses.
 * Browsers hide response headers unless they are exposed, so the ones the UI reads are listed explicitly.
 */
@Configuration(proxyBeanMethods = false)
public class CorsFilterConfiguration {
    static final List<String> EXPOSED_HEADERS =
            List.of(CorrelationIdFilter.HEADER, HttpHeaders.LOCATION, HttpHeaders.ETAG, HttpHeaders.RETRY_AFTER);

    @Bean
    FilterRegistrationBean<CorsFilter> corsFilter(CorsProperties properties) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOriginPatterns(properties.allowedOrigins());
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("*"));
        cors.setExposedHeaders(EXPOSED_HEADERS);
        // A publicly hosted UI calling a backend on localhost triggers Chrome's Private Network Access preflight.
        cors.setAllowPrivateNetwork(true);
        cors.setMaxAge(Duration.ofHours(1));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cors);
        source.registerCorsConfiguration("/actuator/**", cors);

        FilterRegistrationBean<CorsFilter> registration = new FilterRegistrationBean<>(new CorsFilter(source));
        // Directly after the correlation filter, so even rejected preflights carry a correlation ID.
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 1);
        return registration;
    }
}
