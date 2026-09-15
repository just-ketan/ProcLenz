package com.proclenz.event;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProcessEventRepository extends JpaRepository<ProcessEvent, UUID> {

    /** Served by idx_event_case_time; arrival order breaks ties between simultaneous events. */
    List<ProcessEvent> findByProcessKeyAndCaseIdOrderByOccurredAtAscIngestSeqAsc(String processKey, String caseId);

    List<ProcessEvent> findByProcessKeyOrderByCaseIdAscOccurredAtAscIdAsc(String processKey);

    @Query("select e.id from ProcessEvent e where e.eventIdentity = :identity")
    Optional<UUID> findIdByEventIdentity(@Param("identity") String identity);
}
