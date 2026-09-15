package com.proclenz.event;

import jakarta.validation.Valid;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.SmartValidator;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/events")
public class EventController {
    private final EventService service; private final SmartValidator validator;
    public EventController(EventService service, SmartValidator validator) { this.service = service; this.validator = validator; }
    @PostMapping
    public ResponseEntity<EventIngestionResult> ingest(@Valid @RequestBody EventRequest request) {
        EventIngestionResult result = service.ingest(request);
        return ResponseEntity.status("ACCEPTED".equals(result.status()) ? HttpStatus.CREATED : HttpStatus.OK).body(result);
    }
    @PostMapping("/batch")
    public ResponseEntity<BatchIngestionResult> ingestBatch(@RequestBody List<EventRequest> requests) {
        List<BatchIngestionResult.BatchItemResult> results = new ArrayList<>(); int accepted = 0, duplicates = 0, invalid = 0;
        for (int index = 0; index < requests.size(); index++) {
            BeanPropertyBindingResult errors = new BeanPropertyBindingResult(requests.get(index), "event");
            validator.validate(requests.get(index), errors);
            if (errors.hasErrors()) { invalid++; results.add(new BatchIngestionResult.BatchItemResult(index, "INVALID", errors.getAllErrors().getFirst().getDefaultMessage(), null)); continue; }
            EventIngestionResult result = service.ingest(requests.get(index));
            if ("ACCEPTED".equals(result.status())) accepted++; else duplicates++;
            results.add(new BatchIngestionResult.BatchItemResult(index, result.status(), null, result));
        }
        return ResponseEntity.status(accepted > 0 ? HttpStatus.CREATED : HttpStatus.OK).body(new BatchIngestionResult(accepted, duplicates, invalid, results));
    }
}
