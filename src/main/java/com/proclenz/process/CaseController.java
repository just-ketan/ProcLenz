package com.proclenz.process;

import com.proclenz.common.PageResponse;
import com.proclenz.event.EventNormalizer;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class CaseController {
    private final CaseService cases;

    public CaseController(CaseService cases) {
        this.cases = cases;
    }

    @GetMapping("/cases/{caseId}/timeline")
    public CaseTimeline timeline(@PathVariable String caseId,
                                 @RequestParam(defaultValue = EventNormalizer.DEFAULT_PROCESS_KEY) String processKey) {
        return cases.timeline(processKey, caseId);
    }

    /** Filterable, sortable page of cases, e.g. {@code ?sort=durationMs&direction=desc&minDurationMs=86400000}. */
    @GetMapping("/processes/{processKey}/cases")
    public PageResponse<CaseSummaryView> cases(@PathVariable String processKey,
                                               @RequestParam(defaultValue = "0") @Min(0) int page,
                                               @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size,
                                               @RequestParam(defaultValue = "durationMs") String sort,
                                               @RequestParam(defaultValue = "desc") String direction,
                                               @RequestParam(required = false) @PositiveOrZero Long minDurationMs,
                                               @RequestParam(required = false) String variantId) {
        return cases.list(processKey, CaseQuery.of(minDurationMs, variantId, sort, direction, page, size));
    }
}
