package com.proclenz.common;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.proclenz.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class ErrorHandlingIT extends IntegrationTest {

    @Test
    void malformedJsonIsAClientErrorNotAServerError() throws Exception {
        mockMvc.perform(post("/api/v1/events").contentType(MediaType.APPLICATION_JSON).content("{bad json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"))
                .andExpect(jsonPath("$.message").value("Request body is not valid JSON"))
                .andExpect(jsonPath("$.path").value("/api/v1/events"))
                .andExpect(jsonPath("$.traceId").isNotEmpty())
                .andExpect(jsonPath("$.timestamp").isNotEmpty());
    }

    @Test
    void invalidFieldValueNamesTheFieldWithoutLeakingInternals() throws Exception {
        String body = """
                {"caseId":"ORD-1","activity":"Order Created","timestamp":"yesterday"}""";

        mockMvc.perform(post("/api/v1/events").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"))
                .andExpect(jsonPath("$.message", containsString("timestamp")))
                .andExpect(jsonPath("$.message", not(containsString("com.proclenz"))))
                .andExpect(jsonPath("$.message", not(containsString("jackson"))));
    }

    @Test
    void validationFailureListsEveryInvalidField() throws Exception {
        String body = """
                {"caseId":" ","activity":"","timestamp":null}""";

        mockMvc.perform(post("/api/v1/events").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[*].field", containsInAnyOrder("caseId", "activity", "timestamp")));
    }

    @Test
    void invalidQueryParameterIsAClientError() throws Exception {
        mockMvc.perform(get("/api/v1/processes/orders/sla").param("threshold", "abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"))
                .andExpect(jsonPath("$.message", containsString("threshold")));
    }

    @Test
    void unknownRouteReturnsNotFound() throws Exception {
        mockMvc.perform(get("/api/v1/does-not-exist"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ROUTE_NOT_FOUND"));
    }

    @Test
    void unknownCaseReturnsNotFoundInsteadOfAnEmptyTimeline() throws Exception {
        mockMvc.perform(get("/api/v1/cases/NOPE/timeline").param("processKey", "orders"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CASE_NOT_FOUND"));
    }

    @Test
    void unsupportedMethodReturns405WithAllowHeader() throws Exception {
        mockMvc.perform(delete("/api/v1/events"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(header().string("Allow", containsString("POST")))
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
    }

    @Test
    void unsupportedContentTypeReturns415() throws Exception {
        mockMvc.perform(post("/api/v1/events").contentType(MediaType.TEXT_PLAIN).content("hello"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));
    }

    @Test
    void callerSuppliedCorrelationIdBecomesTheTraceId() throws Exception {
        mockMvc.perform(get("/api/v1/does-not-exist").header("X-Correlation-Id", "demo-trace-42"))
                .andExpect(header().string("X-Correlation-Id", "demo-trace-42"))
                .andExpect(jsonPath("$.traceId").value("demo-trace-42"));
    }

    @Test
    void unsafeCorrelationIdIsReplaced() throws Exception {
        mockMvc.perform(get("/api/v1/does-not-exist").header("X-Correlation-Id", "<script>alert(1)</script>"))
                .andExpect(header().string("X-Correlation-Id", matchesPattern("[0-9a-f-]{36}")));
    }
}
