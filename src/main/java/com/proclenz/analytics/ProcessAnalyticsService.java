package com.proclenz.analytics;

import com.proclenz.analytics.engine.BottleneckAnalysis;
import com.proclenz.analytics.engine.InsightGenerator;
import com.proclenz.analytics.engine.InsightReport;
import com.proclenz.analytics.engine.ProcessGraph;
import com.proclenz.analytics.engine.ProcessMiner;
import com.proclenz.analytics.engine.ProcessModel;
import com.proclenz.analytics.engine.ProcessSummary;
import com.proclenz.analytics.engine.ReworkAnalysis;
import com.proclenz.analytics.engine.SlaAnalysis;
import com.proclenz.analytics.engine.SlaThreshold;
import com.proclenz.analytics.engine.VariantAnalysis;
import com.proclenz.common.ErrorCode;
import com.proclenz.common.ProclenzException;
import java.time.Duration;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Application service for process intelligence: streams the process's events into the engine and
 * returns the requested projection. Each call is one read-only transaction, so every figure in a
 * response comes from a single consistent snapshot of the data.
 */
@Service
@Transactional(readOnly = true)
public class ProcessAnalyticsService {
    private final CaseTraceReader traces;
    private final SlaPolicy slaPolicy;

    public ProcessAnalyticsService(CaseTraceReader traces, SlaPolicy slaPolicy) {
        this.traces = traces;
        this.slaPolicy = slaPolicy;
    }

    public ProcessSummary summary(String processKey, Duration sla) {
        SlaThreshold threshold = slaPolicy.resolve("sla", sla);
        return ProcessSummary.of(processKey, mine(processKey), threshold);
    }

    public VariantAnalysis variants(String processKey, Duration sla, int page, int size) {
        SlaThreshold threshold = slaPolicy.resolve("sla", sla);
        return VariantAnalysis.of(processKey, mine(processKey), threshold, page, size);
    }

    public ReworkAnalysis rework(String processKey, int loopLimit) {
        return ReworkAnalysis.of(processKey, mine(processKey), loopLimit);
    }

    public BottleneckAnalysis bottlenecks(String processKey, int limit) {
        return BottleneckAnalysis.of(processKey, mine(processKey), limit);
    }

    public SlaAnalysis sla(String processKey, Duration threshold, int worstLimit) {
        SlaThreshold resolved = slaPolicy.resolve("threshold", threshold);
        return SlaAnalysis.of(processKey, mine(processKey), resolved, worstLimit);
    }

    public ProcessGraph graph(String processKey) {
        return ProcessGraph.of(processKey, mine(processKey));
    }

    public InsightReport insights(String processKey, Duration sla) {
        SlaThreshold threshold = slaPolicy.resolve("sla", sla);
        return InsightGenerator.generate(processKey, mine(processKey), threshold);
    }

    private ProcessModel mine(String processKey) {
        ProcessMiner miner = new ProcessMiner();
        if (traces.forEachCase(processKey, miner::accept) == 0) {
            throw new ProclenzException(ErrorCode.PROCESS_NOT_FOUND, "Process '%s' has no events".formatted(processKey));
        }
        return miner.build();
    }
}
