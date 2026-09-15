package com.proclenz.process;
import com.proclenz.common.ErrorCode;
import com.proclenz.common.ProclenzException;
import com.proclenz.event.ProcessEvent;
import com.proclenz.event.ProcessEventRepository;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CaseTimelineService {
    private final ProcessEventRepository repository;
    public CaseTimelineService(ProcessEventRepository repository) { this.repository = repository; }
    @Transactional(readOnly = true)
    public List<CaseTimelineItem> timeline(String processKey, String caseId) {
        List<ProcessEvent> events = repository.findByProcessKeyAndCaseIdOrderByOccurredAtAscIngestSeqAsc(processKey, caseId);
        if (events.isEmpty()) {
            throw new ProclenzException(ErrorCode.CASE_NOT_FOUND, "Case '%s' was not found in process '%s'".formatted(caseId, processKey));
        }
        List<CaseTimelineItem> response = new ArrayList<>();
        for (int i = 0; i < events.size(); i++) {
            ProcessEvent current = events.get(i); ProcessEvent first = events.getFirst();
            Duration previous = i == 0 ? Duration.ZERO : Duration.between(events.get(i - 1).getOccurredAt(), current.getOccurredAt());
            response.add(new CaseTimelineItem(current.getId(), i + 1, current.getActivity(), current.getOccurredAt(), current.getResource(), previous,
                    Duration.between(first.getOccurredAt(), current.getOccurredAt())));
        }
        return response;
    }
}
