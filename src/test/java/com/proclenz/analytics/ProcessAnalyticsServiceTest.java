package com.proclenz.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

import com.proclenz.event.ProcessEvent;
import com.proclenz.event.ProcessEventRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ProcessAnalyticsServiceTest {
    @Mock ProcessEventRepository repository;
    @InjectMocks ProcessAnalyticsService service;
    @Test void discoversVariantsReworkSlaAndGraph() {
        Instant start = Instant.parse("2026-09-15T09:00:00Z");
        when(repository.findByProcessKeyOrderByCaseIdAscOccurredAtAscIdAsc("orders")).thenReturn(List.of(
                event("A", "Created", start), event("A", "Checked", start.plus(Duration.ofHours(1))), event("A", "Checked", start.plus(Duration.ofHours(2))), event("A", "Shipped", start.plus(Duration.ofHours(5))),
                event("B", "Created", start), event("B", "Checked", start.plus(Duration.ofMinutes(10))), event("B", "Shipped", start.plus(Duration.ofMinutes(20)))));
        assertEquals(2, service.variants("orders", Duration.ofHours(4)).size());
        assertEquals("Checked", service.rework("orders").getFirst().activity());
        assertEquals(1, service.sla("orders", Duration.ofHours(4)).violatingCases());
        assertEquals(3, service.graph("orders").nodes().size());
        assertEquals("Checked", service.bottlenecks("orders").getFirst().fromActivity());
    }
    private ProcessEvent event(String caseId, String activity, Instant time) { return new ProcessEvent(UUID.randomUUID(), "orders", caseId, activity, time, "system", UUID.randomUUID().toString().replace("-", "")); }
}
