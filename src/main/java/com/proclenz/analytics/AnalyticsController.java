package com.proclenz.analytics;

import java.time.Duration;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/processes/{processKey}")
public class AnalyticsController {
    private final ProcessAnalyticsService service;
    public AnalyticsController(ProcessAnalyticsService service) { this.service = service; }
    @GetMapping("/variants") public List<AnalyticsResponses.Variant> variants(@PathVariable String processKey, @RequestParam(defaultValue = "PT4H") Duration sla) { return service.variants(processKey, sla); }
    @GetMapping("/rework") public List<AnalyticsResponses.Rework> rework(@PathVariable String processKey) { return service.rework(processKey); }
    @GetMapping("/bottlenecks") public List<AnalyticsResponses.Bottleneck> bottlenecks(@PathVariable String processKey) { return service.bottlenecks(processKey); }
    @GetMapping("/sla") public AnalyticsResponses.Sla sla(@PathVariable String processKey, @RequestParam(defaultValue = "PT4H") Duration threshold) { return service.sla(processKey, threshold); }
    @GetMapping("/graph") public AnalyticsResponses.Graph graph(@PathVariable String processKey) { return service.graph(processKey); }
}
