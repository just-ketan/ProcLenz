package com.proclenz.event;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ProcessEventRepository extends JpaRepository<ProcessEvent, UUID> {
    List<ProcessEvent> findByProcessKeyAndCaseIdOrderByOccurredAtAscIdAsc(String processKey, String caseId);
    List<ProcessEvent> findByProcessKeyOrderByCaseIdAscOccurredAtAscIdAsc(String processKey);
    boolean existsByEventIdentity(String eventIdentity);
}
