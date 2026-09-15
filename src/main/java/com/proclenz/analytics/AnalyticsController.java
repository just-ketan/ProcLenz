package com.proclenz.analytics;

import com.proclenz.analytics.engine.BottleneckAnalysis;
import com.proclenz.analytics.engine.InsightReport;
import com.proclenz.analytics.engine.ProcessGraph;
import com.proclenz.analytics.engine.ProcessSummary;
import com.proclenz.analytics.engine.ReworkAnalysis;
import com.proclenz.analytics.engine.SlaAnalysis;
import com.proclenz.analytics.engine.VariantAnalysis;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.Duration;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Read-only process intelligence views. SLA thresholds are ISO-8601 durations, e.g. {@code P2D} or {@code PT36H}. */
@RestController
@RequestMapping("/api/v1/processes/{processKey}")
public class AnalyticsController {
    private final ProcessAnalyticsService analytics;

    public AnalyticsController(ProcessAnalyticsService analytics) {
        this.analytics = analytics;
    }

    @GetMapping("/summary")
    public ProcessSummary summary(@PathVariable String processKey, @RequestParam(required = false) Duration sla) {
        return analytics.summary(processKey, sla);
    }

    @GetMapping("/variants")
    public VariantAnalysis variants(@PathVariable String processKey,
                                    @RequestParam(required = false) Duration sla,
                                    @RequestParam(defaultValue = "0") @Min(0) int page,
                                    @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
        return analytics.variants(processKey, sla, page, size);
    }

    @GetMapping("/rework")
    public ReworkAnalysis rework(@PathVariable String processKey,
                                 @RequestParam(defaultValue = "10") @Min(0) @Max(100) int loops) {
        return analytics.rework(processKey, loops);
    }

    @GetMapping("/bottlenecks")
    public BottleneckAnalysis bottlenecks(@PathVariable String processKey,
                                          @RequestParam(defaultValue = "10") @Min(1) @Max(100) int limit) {
        return analytics.bottlenecks(processKey, limit);
    }

    @GetMapping("/sla")
    public SlaAnalysis sla(@PathVariable String processKey,
                           @RequestParam(required = false) Duration threshold,
                           @RequestParam(defaultValue = "10") @Min(0) @Max(100) int worst) {
        return analytics.sla(processKey, threshold, worst);
    }

    @GetMapping("/graph")
    public ProcessGraph graph(@PathVariable String processKey) {
        return analytics.graph(processKey);
    }

    @GetMapping("/insights")
    public InsightReport insights(@PathVariable String processKey, @RequestParam(required = false) Duration sla) {
        return analytics.insights(processKey, sla);
    }
}
