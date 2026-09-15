package com.proclenz.common;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.proclenz.support.IntegrationTest;
import org.junit.jupiter.api.Test;

class CorsIT extends IntegrationTest {
    private static final String LOCAL_FRONTEND = "http://localhost:5173";

    @Test
    void allowsAFrontendPreflightIncludingPrivateNetworkAccess() throws Exception {
        mockMvc.perform(options("/api/v1/events/batch")
                        .header("Origin", LOCAL_FRONTEND)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type,x-correlation-id")
                        .header("Access-Control-Request-Private-Network", "true"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", LOCAL_FRONTEND))
                .andExpect(header().string("Access-Control-Allow-Private-Network", "true"));
    }

    @Test
    void exposesTracingHeadersEvenOnErrorResponses() throws Exception {
        mockMvc.perform(get("/api/v1/does-not-exist").header("Origin", LOCAL_FRONTEND))
                .andExpect(status().isNotFound())
                .andExpect(header().string("Access-Control-Allow-Origin", LOCAL_FRONTEND))
                .andExpect(header().string("Access-Control-Expose-Headers", containsString("X-Correlation-Id")))
                .andExpect(header().string("Access-Control-Expose-Headers", containsString("Retry-After")));
    }

    @Test
    void coversActuatorHealthWithComponentStatuses() throws Exception {
        mockMvc.perform(get("/actuator/health").header("Origin", LOCAL_FRONTEND))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", LOCAL_FRONTEND))
                .andExpect(jsonPath("$.components.db.status").value("UP"));
    }

    @Test
    void rejectsOriginsThatAreNotAllowed() throws Exception {
        mockMvc.perform(options("/api/v1/events")
                        .header("Origin", "https://evil.example")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
    }
}
