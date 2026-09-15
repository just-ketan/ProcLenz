package com.proclenz.process;

import com.proclenz.analytics.engine.CaseTrace;
import com.proclenz.common.ErrorCode;
import com.proclenz.common.PageResponse;
import com.proclenz.common.ProclenzException;
import com.proclenz.event.ProcessEvent;
import com.proclenz.event.ProcessEventRepository;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Case reconstruction: one case in full detail, or many cases summarised. */
@Service
@Transactional(readOnly = true)
public class CaseService {
    private final ProcessEventRepository eventRepository;
    private final CaseQueryRepository caseQueries;

    public CaseService(ProcessEventRepository eventRepository, CaseQueryRepository caseQueries) {
        this.eventRepository = eventRepository;
        this.caseQueries = caseQueries;
    }

    /** Uses the same {@link CaseTrace} rules as the analytics engine, so a timeline never disagrees with the process metrics. */
    public CaseTimeline timeline(String processKey, String caseId) {
        List<ProcessEvent> events = eventRepository.findByProcessKeyAndCaseIdOrderByOccurredAtAscIngestSeqAsc(processKey, caseId);
        if (events.isEmpty()) {
            throw new ProclenzException(ErrorCode.CASE_NOT_FOUND, "Case '%s' was not found in process '%s'".formatted(caseId, processKey));
        }
        CaseTrace trace = new CaseTrace(caseId,
                events.stream().map(ProcessEvent::getActivity).toList(),
                events.stream().map(ProcessEvent::getOccurredAt).toList());

        List<CaseTimeline.Event> timeline = new ArrayList<>(events.size());
        for (int i = 0; i < events.size(); i++) {
            ProcessEvent event = events.get(i);
            timeline.add(new CaseTimeline.Event(i + 1, event.getId(), event.getActivity(), event.getOccurredAt(), event.getResource(),
                    trace.waitMs(i), trace.millisBetween(0, i), trace.isRepeat(i)));
        }
        return new CaseTimeline(processKey, caseId, trace.variantId(), trace.size(), trace.startedAt(), trace.endedAt(),
                trace.durationMs(), trace.reworkActivities(), timeline);
    }

    public PageResponse<CaseSummaryView> list(String processKey, CaseQuery query) {
        return caseQueries.find(processKey, query);
    }
}
