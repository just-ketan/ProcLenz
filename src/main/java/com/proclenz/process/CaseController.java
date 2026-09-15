package com.proclenz.process;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
@RestController @RequestMapping("/api/v1/cases")
public class CaseController {
    private final CaseTimelineService service;
    public CaseController(CaseTimelineService service) { this.service = service; }
    @GetMapping("/{caseId}/timeline")
    public List<CaseTimelineItem> timeline(@PathVariable String caseId, @RequestParam(defaultValue = "default") String processKey) {
        return service.timeline(processKey, caseId);
    }
}
