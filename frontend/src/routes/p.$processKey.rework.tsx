import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { usePreferences } from "@/app/preferences";
import { stringParam } from "@/app/search";
import { EmptyState, QueryView } from "@/components/feedback/states";
import { ProcessControls } from "@/components/layout/ProcessControls";
import { Bar, PageHeader, Panel, SequenceChips, Stat } from "@/components/proclenz/ui";
import { Button } from "@/components/ui/button";
import { formatCount, formatDecimal, formatDuration, formatPercent } from "@/domain/format";
import { useProcessSummary, useRework } from "@/hooks/queries";

type ReworkSearch = { activity?: string | undefined };

export const Route = createFileRoute("/p/$processKey/rework")({
  validateSearch: (search: Record<string, unknown>): ReworkSearch => ({ activity: stringParam(search["activity"]) }),
  head: () => ({ meta: [{ title: "Rework · Proclenz" }] }),
  component: ReworkPage,
});

function ReworkPage() {
  const { processKey } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { sla } = usePreferences();
  const summary = useProcessSummary(processKey, sla);
  const rework = useRework(processKey, 50);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Rework analysis"
        title="Rework"
        description="Activities executed again within the same case, detected structurally from the sequence, whatever the activity is called."
      />
      <ProcessControls processKey={processKey} summary={summary.data} />
      <QueryView query={rework} loadingLabel="Detecting repeated activities…" rows={6}>
        {(data) => {
          if (data.casesWithRework === 0) {
            return (
              <Panel>
                <EmptyState icon={<Check />} title="No rework detected" description="No activity repeats within any case of this process." />
              </Panel>
            );
          }
          const maxAffected = Math.max(1, ...data.activities.map((activity) => activity.affectedCasePercent));
          const loops = search.activity ? data.loops.filter((loop) => loop.activity === search.activity) : data.loops;
          return (
            <>
              <div className="stat-grid">
                <Stat label="Rework rate" value={formatPercent(data.reworkRatePercent)} hint={`${formatCount(data.casesWithRework)} of ${formatCount(data.totalCases)} cases`} tone="warning" />
                <Stat label="Repeat executions" value={formatCount(data.totalRepeatOccurrences)} hint="Extra executions beyond the first" />
                <Stat label="Time in rework loops" value={formatDuration(data.totalReworkTimeMs)} hint="From an activity to its repeat, summed per activity" />
                <Stat label="Reworked activities" value={formatCount(data.activities.length)} hint="Activities repeated in at least one case" />
              </div>
              <div className="two-column">
                <Panel eyebrow="BY ACTIVITY" title="Rework-heavy activities">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Activity</th>
                          <th className="numeric">Affected cases</th>
                          <th className="numeric">Repeats</th>
                          <th className="numeric">Repeats / case</th>
                          <th className="numeric">Time lost / case</th>
                          <th className="numeric">Total time lost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.activities.map((activity) => (
                          <tr
                            key={activity.activity}
                            className={`row-clickable ${search.activity === activity.activity ? "row-selected" : ""}`}
                            onClick={() =>
                              void navigate({
                                search: { activity: search.activity === activity.activity ? undefined : activity.activity },
                                replace: true,
                              })
                            }
                          >
                            <td>
                              <strong className="text-[11px]">{activity.activity}</strong>
                            </td>
                            <td className="numeric">
                              <span className="inline-flex items-center gap-2 mono-value">
                                {formatCount(activity.affectedCases)} ({formatPercent(activity.affectedCasePercent)})
                                <Bar value={activity.affectedCasePercent} max={maxAffected} tone="warning" />
                              </span>
                            </td>
                            <td className="numeric mono-value">{formatCount(activity.repeatOccurrences)}</td>
                            <td className="numeric mono-value">{formatDecimal(activity.avgRepeatsPerAffectedCase, 2)}</td>
                            <td className="numeric mono-value">{formatDuration(activity.avgReworkTimePerAffectedCaseMs)}</td>
                            <td className="numeric mono-value">{formatDuration(activity.totalReworkTimeMs)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
                <Panel
                  eyebrow="CONCRETE PATHS"
                  title={search.activity ? `Loops through ${search.activity}` : "Rework loops"}
                  action={
                    <Button asChild variant="ghost" size="sm" className="section-action">
                      <Link to="/p/$processKey/explorer" params={{ processKey }} search={{ overlay: "rework" }}>
                        Show on graph
                      </Link>
                    </Button>
                  }
                >
                  <div className="panel-body flex flex-col gap-3">
                    {loops.length === 0 ? (
                      <p className="muted text-[11px]">No loops recorded for this activity in the top loops returned.</p>
                    ) : (
                      loops.map((loop) => (
                        <div key={loop.path.join("→")} className="rounded border p-3">
                          <SequenceChips activities={loop.path} max={8} />
                          <div className="muted mt-2 flex flex-wrap gap-3 text-[10px]">
                            <span>
                              <strong className="text-foreground">{formatCount(loop.occurrences)}</strong> occurrences
                            </span>
                            <span>avg loop {formatDuration(loop.avgLoopDurationMs)}</span>
                            <span>p95 {formatDuration(loop.p95LoopDurationMs)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Panel>
              </div>
            </>
          );
        }}
      </QueryView>
    </div>
  );
}
