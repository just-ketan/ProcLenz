import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import type { Bottleneck, BottleneckAnalysis, ProcessGraph, VariantAnalysis } from "@/api/types";
import { usePreferences } from "@/app/preferences";
import { intParam, stringParam } from "@/app/search";
import { EmptyState, QueryView } from "@/components/feedback/states";
import { ProcessControls } from "@/components/layout/ProcessControls";
import { ProcessGraphView } from "@/components/process-graph/ProcessGraphView";
import { Bar, DefinitionList, PageHeader, Panel, SequenceChips, SeverityBadge } from "@/components/proclenz/ui";
import { Button } from "@/components/ui/button";
import { transitionKey, variantsContainingTransition } from "@/domain/derived";
import { formatCount, formatDecimal, formatDuration, formatPercent } from "@/domain/format";
import type { BuildGraphOptions } from "@/domain/graph";
import { useBottlenecks, useProcessGraph, useProcessSummary, useVariants } from "@/hooks/queries";

type BottlenecksSearch = { selected?: string | undefined; limit?: number | undefined };

export const Route = createFileRoute("/p/$processKey/bottlenecks")({
  validateSearch: (search: Record<string, unknown>): BottlenecksSearch => ({
    selected: stringParam(search["selected"]),
    limit: intParam(search["limit"], 1, 100),
  }),
  head: () => ({ meta: [{ title: "Bottlenecks · Proclenz" }] }),
  component: BottlenecksPage,
});

type NumericKey = "rank" | "score" | "waitSharePercent" | "avgWaitMs" | "medianWaitMs" | "p95WaitMs" | "tailVolatility" | "transitionCount" | "caseCount";

const COLUMNS: { key: NumericKey; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "waitSharePercent", label: "Wait share" },
  { key: "avgWaitMs", label: "Avg wait" },
  { key: "medianWaitMs", label: "Median" },
  { key: "p95WaitMs", label: "P95 wait" },
  { key: "tailVolatility", label: "Tail" },
  { key: "transitionCount", label: "Transitions" },
  { key: "caseCount", label: "Cases" },
];

function BottlenecksPage() {
  const { processKey } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { sla } = usePreferences();
  const limit = search.limit ?? 25;
  const [sortKey, setSortKey] = useState<NumericKey>("rank");
  const [descending, setDescending] = useState(false);

  const summary = useProcessSummary(processKey, sla);
  const analysis = useBottlenecks(processKey, limit);
  const graph = useProcessGraph(processKey, search.selected !== undefined);
  const variants = useVariants(processKey, { sla, page: 0, size: 200 }, search.selected !== undefined);

  const select = (key: string | undefined) => void navigate({ search: (previous) => ({ ...previous, selected: key }), replace: true });
  const sortBy = (key: NumericKey) => {
    if (key === sortKey) setDescending((current) => !current);
    else {
      setSortKey(key);
      setDescending(key !== "rank");
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Bottleneck analysis"
        title="Bottlenecks"
        description="Transitions ranked by how much of the process's waiting time they cause, adjusted for long-tail delays, not simply the slowest step."
      />
      <ProcessControls processKey={processKey} summary={summary.data} />

      <QueryView query={analysis} loadingLabel="Scoring transitions…" rows={8}>
        {(data) => {
          const sorted = [...data.bottlenecks].sort((a, b) => (a[sortKey] - b[sortKey]) * (descending ? -1 : 1));
          const selected = data.bottlenecks.find((bottleneck) => transitionKey(bottleneck.fromActivity, bottleneck.toActivity) === search.selected);
          const maxShare = Math.max(1, ...data.bottlenecks.map((bottleneck) => bottleneck.waitSharePercent));
          return (
            <div className={selected || search.selected ? "two-column" : "page-stack"}>
              <Panel
                eyebrow={`${formatCount(data.transitionsAnalyzed)} TRANSITIONS WITH WAITING TIME`}
                title="Ranked transitions"
                action={
                  <label className="field">
                    <span className="field-label">Show top</span>
                    <select value={limit} onChange={(event) => void navigate({ search: (previous) => ({ ...previous, limit: Number(event.target.value) }) })}>
                      {[10, 25, 50, 100].map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                }
              >
                {data.bottlenecks.length === 0 ? (
                  <EmptyState title="No waiting time to rank" description="All transitions happen instantly, or the process has single-event cases only." />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <NumericHeader column={{ key: "rank", label: "#" }} sortKey={sortKey} descending={descending} onSort={sortBy} />
                          <th>Transition</th>
                          <th>Severity</th>
                          {COLUMNS.map((column) => (
                            <NumericHeader key={column.key} column={column} sortKey={sortKey} descending={descending} onSort={sortBy} />
                          ))}
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((bottleneck) => {
                          const key = transitionKey(bottleneck.fromActivity, bottleneck.toActivity);
                          return (
                            <tr key={key} className={`row-clickable ${key === search.selected ? "row-selected" : ""}`} onClick={() => select(key === search.selected ? undefined : key)}>
                              <td className="numeric mono-value">{bottleneck.rank}</td>
                              <td>
                                <strong className="text-[11px]">{bottleneck.fromActivity}</strong>
                                <span className="muted"> → </span>
                                <strong className="text-[11px]">{bottleneck.toActivity}</strong>
                              </td>
                              <td>
                                <SeverityBadge severity={bottleneck.severity} />
                              </td>
                              <td className="numeric">
                                <span className="inline-flex items-center gap-2">
                                  <span className="mono-value">{formatDecimal(bottleneck.score, 1)}</span>
                                  <Bar value={bottleneck.score} max={100} tone={bottleneck.severity === "HIGH" ? "danger" : bottleneck.severity === "MEDIUM" ? "warning" : undefined} />
                                </span>
                              </td>
                              <td className="numeric mono-value">
                                <span className="inline-flex items-center gap-2">
                                  {formatPercent(bottleneck.waitSharePercent)}
                                  <Bar value={bottleneck.waitSharePercent} max={maxShare} />
                                </span>
                              </td>
                              <td className="numeric mono-value">{formatDuration(bottleneck.avgWaitMs)}</td>
                              <td className="numeric mono-value">{formatDuration(bottleneck.medianWaitMs)}</td>
                              <td className="numeric mono-value">{formatDuration(bottleneck.p95WaitMs)}</td>
                              <td className="numeric mono-value">{formatDecimal(bottleneck.tailVolatility, 2)}</td>
                              <td className="numeric mono-value">{formatCount(bottleneck.transitionCount)}</td>
                              <td className="numeric mono-value">
                                {formatCount(bottleneck.caseCount)} <span className="muted">({formatPercent(bottleneck.caseCoveragePercent, 0)})</span>
                              </td>
                              <td>
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="muted px-5 pb-4 text-[10px]">
                  Scoring model: <code>{data.scoringModel}</code>
                </p>
              </Panel>

              {selected ? (
                <BottleneckDetail bottleneck={selected} analysis={data} graph={graph.data} variants={variants.data} processKey={processKey} onClose={() => select(undefined)} />
              ) : search.selected ? (
                <Panel title="Transition not in the current ranking">
                  <EmptyState
                    title={search.selected.replace("->", " → ")}
                    description={`It is not among the top ${limit} transitions. Show more rows or clear the selection.`}
                    action={
                      <Button variant="outline" size="sm" onClick={() => select(undefined)}>
                        Clear selection
                      </Button>
                    }
                  />
                </Panel>
              ) : null}
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}

function NumericHeader({ column, sortKey, descending, onSort }: { column: { key: NumericKey; label: string }; sortKey: NumericKey; descending: boolean; onSort: (key: NumericKey) => void }) {
  const active = column.key === sortKey;
  return (
    <th className="numeric" aria-sort={active ? (descending ? "descending" : "ascending") : "none"}>
      <button type="button" className={`sort-button ${active ? "sort-active" : ""}`} onClick={() => onSort(column.key)}>
        {column.label}
        {active ? descending ? <ArrowDown /> : <ArrowUp /> : <ArrowUpDown />}
      </button>
    </th>
  );
}

function BottleneckDetail({
  bottleneck,
  analysis,
  graph,
  variants,
  processKey,
  onClose,
}: {
  bottleneck: Bottleneck;
  analysis: BottleneckAnalysis;
  graph: ProcessGraph | undefined;
  variants: VariantAnalysis | undefined;
  processKey: string;
  onClose: () => void;
}) {
  const key = transitionKey(bottleneck.fromActivity, bottleneck.toActivity);
  const waitShare = bottleneck.waitSharePercent / 100;
  const impact = waitShare * (1 + bottleneck.tailVolatility);
  const affected = variants ? variantsContainingTransition(variants.variants, bottleneck.fromActivity, bottleneck.toActivity) : undefined;
  const options = useMemo<BuildGraphOptions>(
    () => ({
      mode: "duration",
      overlays: { bottlenecks: true, rework: false, deviations: false },
      direction: "LR",
      bottlenecks: analysis.bottlenecks,
      highlightEdges: new Set([key]),
      maxLabels: 10,
    }),
    [analysis.bottlenecks, key],
  );

  return (
    <Panel
      eyebrow={`RANK #${bottleneck.rank}`}
      title={`${bottleneck.fromActivity} → ${bottleneck.toActivity}`}
      action={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="panel-body flex flex-col gap-5">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <SeverityBadge severity={bottleneck.severity} />
            <span className="muted text-[10px]">Severity uses absolute wait share: HIGH ≥ 20%, MEDIUM ≥ 10%.</span>
          </div>
          <div className="inspector-title">Why this is a bottleneck</div>
          <p className="text-[11px] leading-relaxed">
            {formatPercent(bottleneck.waitSharePercent)} of all waiting time in this process ({formatDuration(bottleneck.totalWaitMs)} of {formatDuration(analysis.totalWaitingTimeMs)}) happens between these two
            activities, across {formatPercent(bottleneck.caseCoveragePercent)} of cases. Its p95 wait of {formatDuration(bottleneck.p95WaitMs)} against a median of {formatDuration(bottleneck.medianWaitMs)}{" "}
            {bottleneck.tailVolatility >= 0.5 ? "shows a long tail of occasional extreme delays." : "shows delays are fairly consistent."}
          </p>
          <DefinitionList
            items={[
              { label: "Wait share", value: formatPercent(bottleneck.waitSharePercent, 2) },
              { label: "Tail volatility (1 − median/p95)", value: formatDecimal(bottleneck.tailVolatility, 2) },
              { label: "Impact = share × (1 + tail)", value: `${formatDecimal(waitShare, 3)} × ${formatDecimal(1 + bottleneck.tailVolatility, 2)} = ${formatDecimal(impact, 3)}` },
              { label: "Score (worst transition = 100)", value: formatDecimal(bottleneck.score, 1) },
            ]}
          />
        </div>

        <div>
          <div className="inspector-title">Wait profile</div>
          {[
            ["Average", bottleneck.avgWaitMs],
            ["Median", bottleneck.medianWaitMs],
            ["P95", bottleneck.p95WaitMs],
          ].map(([label, value]) => (
            <div key={label} className="mb-1.5 grid grid-cols-[60px_1fr_70px] items-center gap-2 text-[11px]">
              <span className="muted">{label}</span>
              <span className="bar-track w-full">
                <span className="bar-fill" style={{ width: `${bottleneck.p95WaitMs > 0 ? (Number(value) / bottleneck.p95WaitMs) * 100 : 0}%` }} />
              </span>
              <span className="mono-value text-right">{formatDuration(Number(value))}</span>
            </div>
          ))}
          <DefinitionList
            items={[
              { label: "Cases affected", value: `${formatCount(bottleneck.caseCount)} (${formatPercent(bottleneck.caseCoveragePercent)})` },
              { label: "Transitions observed", value: formatCount(bottleneck.transitionCount) },
            ]}
          />
        </div>

        <div>
          <div className="inspector-title">Variants containing this transition</div>
          {!affected ? (
            <p className="muted text-[11px]">Loading variants…</p>
          ) : affected.length === 0 ? (
            <p className="muted text-[11px]">None among the {formatCount(variants?.variants.length ?? 0)} variants loaded.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="muted text-[10px]">
                {formatCount(affected.length)} of the {formatCount(variants?.variants.length ?? 0)} most common variants.
              </p>
              {affected.slice(0, 6).map((variant) => (
                <div key={variant.variantId} className="rounded border p-2">
                  <div className="mb-1 flex items-center justify-between text-[10px]">
                    <Link to="/p/$processKey/variants" params={{ processKey }} search={{ selected: variant.variantId }} className="link">
                      V{variant.rank} · {formatPercent(variant.casePercent)} of cases
                    </Link>
                    <Link to="/p/$processKey/cases" params={{ processKey }} search={{ variantId: variant.variantId }} className="link">
                      {formatCount(variant.caseCount)} cases
                    </Link>
                  </div>
                  <SequenceChips activities={variant.activities} max={6} highlight={new Set([bottleneck.fromActivity, bottleneck.toActivity])} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="inspector-title">In context</div>
          <div className="overflow-hidden rounded border">
            {graph ? <ProcessGraphView graph={graph} options={options} height={280} /> : <p className="muted p-3 text-[11px]">Loading graph…</p>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/p/$processKey/explorer" params={{ processKey }} search={{ edge: key }}>
                Open in Process Explorer
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/p/$processKey/sla" params={{ processKey }}>
                SLA impact
              </Link>
            </Button>
          </div>
          <p className="muted mt-2 text-[10px]">No trend chart: the backend does not expose time-bucketed analytics yet, so none is shown rather than invented.</p>
        </div>
      </div>
    </Panel>
  );
}
