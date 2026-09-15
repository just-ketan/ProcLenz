package com.proclenz.event;

import java.time.Instant;
import java.util.UUID;

public record EventResponse(
        UUID eventId,
        String processKey,
        String caseId,
        String activity,
        Instant timestamp,
        String resource,
        String sourceEventId,
        String eventIdentity,
        Instant ingestedAt) {

    static EventResponse from(ProcessEvent event) {
        return new EventResponse(event.getId(), event.getProcessKey(), event.getCaseId(), event.getActivity(), event.getOccurredAt(),
                event.getResource(), event.getSourceEventId(), event.getEventIdentity(), event.getIngestedAt());
    }
}
