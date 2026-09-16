import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import type { CaseTimeline } from "@/api/types";
import { usePreferences } from "@/app/preferences";
import { QueryView } from "@/components/feedback/states";
import { Chip, PageHeader, Panel, SlaStatusBadge, Stat } from "@/components/proclenz/ui";
import { caseSlaStatus, compareWithDominant, FORMULAS, isAbnormalWait, transitionKey } from "@/domain/derived";
import { formatCount, formatDate, formatDateTime, formatDuration, formatTime, shortId, type TimeDisplay } from "@/domain/format";
import { useCaseTimeline, useProcessGraph, useProcessSummary, useVariants } from "@/hooks/queries";

export const Route = createFileRoute("/p/$processKey/cases/$caseId")({
  head: ({ params }) => ({ meta: [{ title: `Case ${params.caseId} · Proclenz` }] }),
  component: CaseTimelinePage,
});

function CaseTimelinePage() {
  const { processKey, caseId } = Route.useParams();
  const { sla, timeDisplay } = usePreferences();
  const timeline = useCaseTimeline(processKey, caseId);
  const graph = useProcessGraph(processKey);
  const summary = useProcessSummary(processKey, sla);
  const dominant = useVariants(processKey, { sla, page: 0, size: 1 });

  const p95ByTransition = useMemo(() => new Map((graph.data?.edges ?? []).map((edge) => [edge.id, edge.p95DurationMs])), [graph.data]);

  return (
    <div className="page-stack">
      <Link to="/p/$processKey/cases" params={{ processKey }} className="link inline-flex items-center gap-1 text-xs">
        <ArrowLeft className="h-3.5 w-3.5" />
        All cases in {processKey}
      </Link>
      <QueryView query={timeline} loadingLabel="Reconstructing the case from its events…" rows={8}>
        {(data) => (
          <TimelineContent
            data={data}
            thresholdMs={summary.data?.sla.thresholdMs}
            dominantActivities={dominant.data?.variants[0]?.activities}
            dominantVariantId={dominant.data?.variants[0]?.variantId}
            p95ByTransition={graph.data ? p95ByTransition : undefined}
            timeDisplay={timeDisplay}
          />
        )}
      </QueryView>
    </div>
  );
}

function TimelineContent({
  data,
  thresholdMs,
  dominantActivities,
  dominantVariantId,
  p95ByTransition,
  timeDisplay,
}: {
  data: CaseTimeline;
  thresholdMs: number | undefined;
  dominantActivities: string[] | undefined;
  dominantVariantId: string | undefined;
  p95ByTransition: ReadonlyMap<string, number> | undefined;
  timeDisplay: TimeDisplay;
}) {
  const status = thresholdMs === undefined ? undefined : caseSlaStatus(data.durationMs, thresholdMs);
  const maxDelta = Math.max(1, ...data.events.map((event) => event.deltaFromPreviousMs));
  const comparison = dominantActivities ? compareWithDominant(data.events.map((event) => event.activity), dominantActivities) : undefined;
  const abnormalCount = data.events.filter((event, index) => {
    const previous = data.events[index - 1];
    return previous !== undefined && isAbnormalWait(event.deltaFromPreviousMs, p95ByTransition?.get(transitionKey(previous.activity, event.activity)));
  }).length;
  const chartData = data.events.map((event) => ({ sequence: event.sequence, activity: event.activity, elapsedHours: event.elapsedMs / 3_600_000 }));

  return (
    <>
      <PageHeader
        eyebrow="Case timeline"
        title={`Case ${data.caseId}`}
        description={`${data.processKey} · ${formatDateTime(data.startedAt, timeDisplay)} → ${formatDateTime(data.endedAt, timeDisplay)}`}
      />
      <div className="stat-grid">
        <Stat label="Case duration" value={formatDuration(data.durationMs)} hint="Last event minus first event" />
        <Stat label="Events" value={formatCount(data.eventCount)} hint={`${formatCount(new Set(data.events.map((event) => event.activity)).size)} distinct activities`} />
        <Stat
          label="SLA status"
          value={status ? <SlaStatusBadge status={status} /> : "—"}
          hint={thresholdMs !== undefined ? `Threshold ${formatDuration(thresholdMs)}` : "Resolving threshold…"}
          info={FORMULAS.caseSlaStatus}
        />
        <Stat
          label="Variant"
          value={
            <Link to="/p/$processKey/variants" params={{ processKey: data.processKey }} search={{ selected: data.variantId }} className="link">
              {data.variantId === dominantVariantId ? "V1" : shortId(data.variantId)}
            </Link>
          }
          hint={data.variantId === dominantVariantId ? "The most common path" : "Click to compare with other variants"}
        />
        <Stat
          label="Rework"
          value={formatCount(data.reworkActivities.length)}
          hint={data.reworkActivities.length ? data.reworkActivities.join(", ") : "No activity repeated"}
          tone={data.reworkActivities.length ? "warning" : undefined}
        />
        <Stat label="Abnormal waits" value={p95ByTransition ? formatCount(abnormalCount) : "…"} hint="Waits above the transition's p95" info={FORMULAS.abnormalWait} tone={abnormalCount ? "danger" : undefined} />
      </div>

      <div className="two-column">
        <Panel eyebrow="RECONSTRUCTED" title="Event sequence">
          <ol className="timeline">
            {data.events.map((event, index) => {
              const previous = data.events[index - 1];
              const p95 = previous ? p95ByTransition?.get(transitionKey(previous.activity, event.activity)) : undefined;
              const abnormal = previous !== undefined && isAbnormalWait(event.deltaFromPreviousMs, p95);
              return (
                <li key={event.eventId} className="timeline-item">
                  <div className="timeline-time">
                    {formatTime(event.timestamp, timeDisplay)}
                    <span>{formatDate(event.timestamp, timeDisplay)}</span>
                  </div>
                  <div className="timeline-rail">
                    <span className={`timeline-dot ${event.rework ? "rework" : ""} ${abnormal ? "abnormal" : ""}`} />
                  </div>
                  <div className="timeline-body">
                    {previous ? (
                      <div className={`timeline-wait ${abnormal ? "abnormal" : ""}`}>
                        <span className="timeline-wait-bar" style={{ width: `${Math.max(3, (event.deltaFromPreviousMs / maxDelta) * 180)}px` }} />
                        wait {formatDuration(event.deltaFromPreviousMs)}
                        {abnormal && p95 !== undefined ? (
                          <Chip tone="danger" title={FORMULAS.abnormalWait}>
                            ABNORMAL WAIT · p95 {formatDuration(p95)}
                          </Chip>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="timeline-card">
                      <div>
                        <strong>{event.activity}</strong>
                        <div className="timeline-meta">
                          <span>#{event.sequence}</span>
                          {event.resource ? <span>by {event.resource}</span> : null}
                          <span>elapsed {formatDuration(event.elapsedMs)}</span>
                        </div>
                      </div>
                      <div className="timeline-meta">
                        {event.rework ? <Chip tone="rework">REWORK</Chip> : null}
                        <Link to="/events/$eventId" params={{ eventId: event.eventId }} className="link">
                          Event details
                        </Link>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="muted px-5 pb-4 text-[10px]">
            Events carry one completion timestamp, so the gaps above are waiting time between activities; activity execution time is not measurable from this log.
          </p>
        </Panel>

        <div className="page-stack">
          <Panel eyebrow="DEVIATION" title="Compared with the dominant path">
            <div className="panel-body">
              {!comparison ? (
                <p className="muted text-[11px]">Loading the most common variant…</p>
              ) : comparison.missing.length === 0 && comparison.unexpected.length === 0 ? (
                <p className="flex items-center gap-2 text-[11px]">
                  <Check className="h-4 w-4 text-green-700" />
                  Same activities as the most common variant{data.variantId === dominantVariantId ? " (and the same order)." : ", in a different order or with repeats."}
                </p>
              ) : (
                <div className="flex flex-col gap-3 text-[11px]">
                  <div>
                    <div className="inspector-title">Missing activities</div>
                    {comparison.missing.length ? (
                      <div className="flex flex-wrap gap-1">
                        {comparison.missing.map((activity) => (
                          <Chip key={activity} tone="warning">
                            {activity}
                          </Chip>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">None</span>
                    )}
                  </div>
                  <div>
                    <div className="inspector-title">Unexpected activities</div>
                    {comparison.unexpected.length ? (
                      <div className="flex flex-wrap gap-1">
                        {comparison.unexpected.map((activity) => (
                          <Chip key={activity} tone="danger">
                            {activity}
                          </Chip>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">None</span>
                    )}
                  </div>
                </div>
              )}
              <p className="muted mt-3 text-[10px]">{FORMULAS.deviation}</p>
            </div>
          </Panel>
          <Panel eyebrow="PROGRESS" title="Elapsed time">
            <div className="chart-box px-3 pb-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="#e6ebf2" vertical={false} />
                  <XAxis dataKey="sequence" tick={{ fontSize: 10 }} label={{ value: "Event #", position: "insideBottomRight", offset: -2, fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={42} unit="h" />
                  <ChartTooltip
                    formatter={(value) => [formatDuration(Number(value) * 3_600_000), "Elapsed"]}
                    labelFormatter={(sequence) => {
                      const event = chartData.find((entry) => entry.sequence === Number(sequence));
                      return event ? `#${event.sequence} ${event.activity}` : String(sequence);
                    }}
                  />
                  {thresholdMs !== undefined ? (
                    <ReferenceLine y={thresholdMs / 3_600_000} stroke="#c4473e" strokeDasharray="4 4" label={{ value: `SLA ${formatDuration(thresholdMs)}`, fontSize: 10, fill: "#c4473e", position: "insideTopLeft" }} />
                  ) : null}
                  <Line type="stepAfter" dataKey="elapsedHours" stroke="#2f67c4" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
