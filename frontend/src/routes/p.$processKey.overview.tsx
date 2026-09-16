import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, BarChart3, Check, ChevronRight, Clock3, RefreshCw, ShieldAlert, Sparkles, Users } from "lucide-react";
import type { BottleneckAnalysis, InsightReport, ProcessGraph, ProcessSummary } from "@/api/types";
import { usePreferences } from "@/app/preferences";
import { EmptyState, ErrorState, LoadingState, QueryView } from "@/components/feedback/states";
import { ProcessControls } from "@/components/layout/ProcessControls";
import { ProcessGraphView } from "@/components/process-graph/ProcessGraphView";
import { InsightItem } from "@/components/proclenz/insights";
import { KpiCard, PageHeader, Panel, SequenceChips } from "@/components/proclenz/ui";
import { Button } from "@/components/ui/button";
import { activeBottleneckCount, compliancePercent, FORMULAS } from "@/domain/derived";
import { formatCompact, formatCount, formatDate, formatDecimal, formatDuration, formatPercent, variantLabel } from "@/domain/format";
import { END_NODE, START_NODE, type BuildGraphOptions, type GraphMode } from "@/domain/graph";
import { useBottlenecks, useInsights, useProcessGraph, useProcessSummary, useVariants } from "@/hooks/queries";

export const Route = createFileRoute("/p/$processKey/overview")({
  head: () => ({ meta: [{ title: "Overview · Proclenz" }] }),
  component: OverviewPage,
});

const OVERVIEW_OVERLAYS = { bottlenecks: true, rework: false, deviations: false };

function OverviewPage() {
  const { processKey } = Route.useParams();
  const { sla, timeDisplay } = usePreferences();
  const queryClient = useQueryClient();
  const summary = useProcessSummary(processKey, sla);
  const graph = useProcessGraph(processKey);
  const insights = useInsights(processKey, sla);
  const bottlenecks = useBottlenecks(processKey);
  const variants = useVariants(processKey, { sla, page: 0, size: 5 });

  const refreshing = summary.isFetching || graph.isFetching || insights.isFetching;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Process overview"
        title="Process Intelligence"
        description="Understand how your processes actually execute."
        actions={
          <Button variant="outline" size="sm" onClick={() => void queryClient.invalidateQueries({ queryKey: ["process", processKey] })} disabled={refreshing}>
            <RefreshCw className={refreshing ? "spin" : ""} />
            {refreshing ? "Refreshing" : "Refresh data"}
          </Button>
        }
      />
      <ProcessControls processKey={processKey} summary={summary.data} />

      {summary.isPending ? (
        <Panel>
          <LoadingState label="Computing process model…" rows={6} />
        </Panel>
      ) : summary.isError ? (
        <Panel>
          <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
        </Panel>
      ) : (
        <>
          <PipelineStrip processKey={processKey} summary={summary.data} graph={graph.data} bottlenecks={bottlenecks.data} insights={insights.data} />
          <KpiRow summary={summary.data} bottlenecks={bottlenecks.data} timeDisplay={timeDisplay} />

          <div className="content-grid">
            <ProcessFlowPanel processKey={processKey} graph={graph} bottlenecks={bottlenecks.data} />
            <Panel
              eyebrow="EVIDENCE-BASED"
              title="Top operational issues"
              className="issues-panel"
              action={
                <Button asChild variant="ghost" size="sm" className="section-action">
                  <Link to="/p/$processKey/bottlenecks" params={{ processKey }}>
                    Bottlenecks
                    <ChevronRight />
                  </Link>
                </Button>
              }
            >
              <QueryView query={insights} loadingLabel="Generating insights…">
                {(report) =>
                  report.insights.length === 0 ? (
                    <EmptyState icon={<Check />} title="No significant issues detected" description="Under the current SLA threshold no rule-based insight fired." />
                  ) : (
                    <div className="issues-list">
                      {report.insights.map((insight) => (
                        <InsightItem key={`${insight.type}-${insight.title}`} insight={insight} processKey={processKey} />
                      ))}
                    </div>
                  )
                }
              </QueryView>
              <div className="issues-footer">
                <Sparkles />
                <span>Insights are deterministic rules over backend metrics, ranked by severity. Each one links to its evidence.</span>
              </div>
            </Panel>
          </div>

          <Panel
            eyebrow="PROCESS VARIANTS"
            title="The paths work actually takes"
            className="variants-panel"
            action={
              <Button asChild variant="ghost" size="sm" className="section-action">
                <Link to="/p/$processKey/variants" params={{ processKey }}>
                  Explore all {formatCount(summary.data.variantCount)} variants
                  <ChevronRight />
                </Link>
              </Button>
            }
          >
            <QueryView query={variants} loadingLabel="Discovering variants…" rows={5}>
              {(analysis) => (
                <div className="variants-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Variant</th>
                        <th>Sequence</th>
                        <th>Case share</th>
                        <th>Avg duration</th>
                        <th>SLA breaches</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.variants.map((variant) => (
                        <tr key={variant.variantId}>
                          <td>
                            <div className="variant-id">
                              <span>{variantLabel(variant.rank, variant.variantId)}</span>
                              <code>{variant.variantId.slice(0, 8)}</code>
                            </div>
                          </td>
                          <td>
                            <SequenceChips activities={variant.activities} max={7} />
                          </td>
                          <td>
                            <div className="share-cell">
                              <strong>{formatPercent(variant.casePercent)}</strong>
                              <div className="share-track">
                                <span style={{ width: `${variant.casePercent}%` }} />
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="mono">{formatDuration(variant.avgDurationMs)}</span>
                          </td>
                          <td>
                            <span className={`sla-pill ${variant.slaViolationRatePercent >= 25 ? "sla-breach" : variant.slaViolationRatePercent > 0 ? "sla-risk" : "sla-good"}`}>
                              {formatPercent(variant.slaViolationRatePercent)}
                            </span>
                          </td>
                          <td>
                            <Button asChild variant="ghost" size="icon" aria-label={`Open variant ${variant.rank}`}>
                              <Link to="/p/$processKey/variants" params={{ processKey }} search={{ selected: variant.variantId }}>
                                <ChevronRight />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </QueryView>
          </Panel>
        </>
      )}
    </div>
  );
}

function PipelineStrip({
  processKey,
  summary,
  graph,
  bottlenecks,
  insights,
}: {
  processKey: string;
  summary: ProcessSummary;
  graph: ProcessGraph | undefined;
  bottlenecks: BottleneckAnalysis | undefined;
  insights: InsightReport | undefined;
}) {
  const transitions = graph ? graph.edges.filter((edge) => edge.source !== START_NODE && edge.target !== END_NODE).length : undefined;
  return (
    <section className="pipeline" aria-label="Process intelligence pipeline">
      <div className="pipeline-intro">
        <span className="eyebrow">THE PROCESS STORY</span>
        <strong>From event log to action</strong>
      </div>
      <div className="pipeline-steps">
        <Link to="/ingestion" className="pipeline-step">
          <strong>{formatCompact(summary.eventCount)}</strong>
          <span>events ingested</span>
          <ChevronRight />
        </Link>
        <Link to="/p/$processKey/cases" params={{ processKey }} className="pipeline-step">
          <strong>{formatCount(summary.caseCount)}</strong>
          <span>cases reconstructed</span>
          <ChevronRight />
        </Link>
        <Link to="/p/$processKey/variants" params={{ processKey }} className="pipeline-step">
          <strong>{formatCount(summary.variantCount)}</strong>
          <span>process variants</span>
          <ChevronRight />
        </Link>
        <Link to="/p/$processKey/explorer" params={{ processKey }} className="pipeline-step">
          <strong>
            {formatCount(summary.activityCount)}·{transitions === undefined ? "…" : formatCount(transitions)}
          </strong>
          <span>activities · transitions</span>
          <ChevronRight />
        </Link>
        <Link to="/p/$processKey/bottlenecks" params={{ processKey }} className="pipeline-step">
          <strong>{bottlenecks ? formatCount(activeBottleneckCount(bottlenecks.bottlenecks)) : "…"}</strong>
          <span>active bottlenecks</span>
          <ChevronRight />
        </Link>
        <Link to="/p/$processKey/sla" params={{ processKey }} className="pipeline-step">
          <strong>{formatCount(summary.sla.violatingCases)}</strong>
          <span>SLA breaches</span>
          <ChevronRight />
        </Link>
        <div className="pipeline-step">
          <strong>{insights ? formatCount(insights.insights.length) : "…"}</strong>
          <span>operational insights</span>
        </div>
      </div>
    </section>
  );
}

function KpiRow({ summary, bottlenecks, timeDisplay }: { summary: ProcessSummary; bottlenecks: BottleneckAnalysis | undefined; timeDisplay: "local" | "utc" }) {
  const active = bottlenecks ? activeBottleneckCount(bottlenecks.bottlenecks) : undefined;
  const top = bottlenecks?.bottlenecks[0];
  const compliance = compliancePercent(summary.caseCount - summary.sla.violatingCases, summary.caseCount);
  return (
    <section className="kpi-grid" aria-label="Key process metrics">
      <KpiCard label="Total cases" value={formatCount(summary.caseCount)} subline={`${formatDecimal(summary.avgEventsPerCase, 1)} events per case`} icon={Users} tone="blue" footer="Reconstructed from the event log" />
      <KpiCard
        label="Events processed"
        value={formatCompact(summary.eventCount)}
        subline={`${formatDate(summary.firstEventAt, timeDisplay)} → ${formatDate(summary.lastEventAt, timeDisplay)}`}
        icon={Activity}
        footer={`${formatCount(summary.activityCount)} activities observed`}
      />
      <KpiCard
        label="Avg case duration"
        value={formatDuration(summary.avgCaseDurationMs)}
        subline={`Median ${formatDuration(summary.medianCaseDurationMs)} · P95 ${formatDuration(summary.p95CaseDurationMs)}`}
        icon={Clock3}
        footer="Waiting time between completion events"
      />
      <KpiCard
        label="SLA compliance"
        value={formatPercent(compliance)}
        subline={`${formatCount(summary.sla.violatingCases)} of ${formatCount(summary.caseCount)} cases breach`}
        icon={ShieldAlert}
        tone={summary.sla.violationRatePercent >= 10 ? "warning" : "neutral"}
        footer={`Threshold ${formatDuration(summary.sla.thresholdMs)} · ${summary.sla.source.toLowerCase()}`}
        info={FORMULAS.compliance}
      />
      <KpiCard
        label="Active bottlenecks"
        value={active === undefined ? "…" : formatCount(active)}
        subline={top ? `${top.fromActivity} → ${top.toActivity}` : "No waiting hotspots ranked"}
        icon={AlertTriangle}
        tone={active ? "critical" : "neutral"}
        footer={top ? `Top transition · ${formatPercent(top.waitSharePercent)} wait share` : "Ranked by share of waiting time"}
        info={FORMULAS.activeBottlenecks}
      />
      <KpiCard
        label="Rework rate"
        value={formatPercent(summary.reworkRatePercent)}
        subline={`${formatCount(summary.casesWithRework)} cases repeat an activity`}
        icon={RefreshCw}
        tone="violet"
        footer="An activity executed again in the same case"
      />
    </section>
  );
}

function ProcessFlowPanel({ processKey, graph, bottlenecks }: { processKey: string; graph: ReturnType<typeof useProcessGraph>; bottlenecks: BottleneckAnalysis | undefined }) {
  const [mode, setMode] = useState<GraphMode>("frequency");
  const navigate = useNavigate();
  const options = useMemo<BuildGraphOptions>(
    () => ({ mode, overlays: OVERVIEW_OVERLAYS, direction: "LR", bottlenecks: bottlenecks?.bottlenecks, maxLabels: 14 }),
    [mode, bottlenecks],
  );

  return (
    <Panel
      eyebrow="PROCESS MODEL"
      title="How work flows"
      className="process-panel"
      action={
        <Button asChild variant="ghost" size="sm" className="section-action">
          <Link to="/p/$processKey/explorer" params={{ processKey }}>
            Open explorer
            <ChevronRight />
          </Link>
        </Button>
      }
    >
      <div className="panel-controls">
        <div className="segmented">
          <button type="button" className={mode === "frequency" ? "selected" : ""} onClick={() => setMode("frequency")}>
            <BarChart3 />
            Frequency
          </button>
          <button type="button" className={mode === "duration" ? "selected" : ""} onClick={() => setMode("duration")}>
            <Clock3 />
            Waiting time
          </button>
        </div>
        <div className="flow-legend">
          <span>
            <i className="legend-line legend-main" />
            Transition (width = frequency)
          </span>
          <span>
            <i className="legend-line legend-warning" />
            Bottleneck
          </span>
        </div>
      </div>
      <div className="flow-wrap">
        <QueryView query={graph} loadingLabel="Laying out the process graph…" rows={6}>
          {(data) => (
            <ProcessGraphView
              graph={data}
              options={options}
              height={430}
              onSelectNode={(node) => {
                if (node) void navigate({ to: "/p/$processKey/explorer", params: { processKey }, search: { node } });
              }}
              onSelectEdge={(edge) => {
                if (edge) void navigate({ to: "/p/$processKey/explorer", params: { processKey }, search: { edge } });
              }}
            />
          )}
        </QueryView>
      </div>
    </Panel>
  );
}
