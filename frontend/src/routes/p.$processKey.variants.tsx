import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, RefreshCw } from "lucide-react";
import { Bar as ChartBar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import type { Variant } from "@/api/types";
import { usePreferences } from "@/app/preferences";
import { intParam, stringParam } from "@/app/search";
import { EmptyState, QueryView } from "@/components/feedback/states";
import { ProcessControls } from "@/components/layout/ProcessControls";
import { Chip, DefinitionList, PageHeader, Pager, Panel, SequenceChips, ShareBar, Stat } from "@/components/proclenz/ui";
import { Button } from "@/components/ui/button";
import { compareWithDominant, FORMULAS, variantsCovering } from "@/domain/derived";
import { formatCount, formatDuration, formatPercent } from "@/domain/format";
import { useProcessSummary, useVariants } from "@/hooks/queries";

type VariantsSearch = { page?: number | undefined; size?: number | undefined; selected?: string | undefined };

export const Route = createFileRoute("/p/$processKey/variants")({
  validateSearch: (search: Record<string, unknown>): VariantsSearch => ({
    page: intParam(search["page"], 0),
    size: intParam(search["size"], 1, 200),
    selected: stringParam(search["selected"]),
  }),
  head: () => ({ meta: [{ title: "Variants · Proclenz" }] }),
  component: VariantsPage,
});

function VariantsPage() {
  const { processKey } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { sla } = usePreferences();
  const page = search.page ?? 0;
  const size = search.size ?? 20;

  const summary = useProcessSummary(processKey, sla);
  const analysis = useVariants(processKey, { sla, page, size });
  const dominantPage = useVariants(processKey, { sla, page: 0, size: 1 });
  const selectedOnPage = analysis.data?.variants.find((variant) => variant.variantId === search.selected);
  const wide = useVariants(processKey, { sla, page: 0, size: 200 }, search.selected !== undefined && analysis.data !== undefined && !selectedOnPage);
  const selected = selectedOnPage ?? wide.data?.variants.find((variant) => variant.variantId === search.selected);
  const dominant = dominantPage.data?.variants[0];

  const select = (variantId: string | undefined) => void navigate({ search: (previous) => ({ ...previous, selected: variantId }), replace: true });

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Process variants"
        title="Variants"
        description="Cases grouped by their exact activity sequence. The long tail shows how standardised the process really is."
      />
      <ProcessControls processKey={processKey} summary={summary.data} />

      <QueryView query={analysis} loadingLabel="Discovering variants…" rows={8}>
        {(data) => {
          const covering = page === 0 ? variantsCovering(data.variants) : undefined;
          const chartData = data.variants.map((variant) => ({ name: `V${variant.rank}`, share: variant.casePercent, cumulative: variant.cumulativeCasePercent }));
          return (
            <>
              <div className="stat-grid">
                <Stat label="Variants" value={formatCount(data.totalVariants)} hint={`across ${formatCount(data.totalCases)} cases`} />
                <Stat label="Most common variant" value={dominant ? formatPercent(dominant.casePercent) : "…"} hint="Share of cases following V1" />
                <Stat
                  label="Variants covering 80%"
                  value={covering !== undefined ? formatCount(covering) : page === 0 ? `> ${formatCount(data.variants.length)}` : "—"}
                  hint="Fewer means a more standardised process"
                  info={FORMULAS.variantsCovering}
                />
                <Stat label="SLA threshold" value={formatDuration(data.slaThresholdMs)} hint="Used for each variant's violation rate" />
              </div>

              <Panel eyebrow="PARETO" title="Case share by variant (this page)">
                <div className="chart-box px-3 pb-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 16, right: 20, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke="#e6ebf2" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} width={44} />
                      <ChartTooltip formatter={(value, name) => [formatPercent(Number(value)), name === "share" ? "Case share" : "Cumulative share"]} />
                      <Legend formatter={(value) => (value === "share" ? "Case share" : "Cumulative share")} wrapperStyle={{ fontSize: 10 }} />
                      <ChartBar dataKey="share" fill="#2f67c4" radius={[3, 3, 0, 0]} maxBarSize={28} onClick={(_, index) => select(data.variants[index]?.variantId)} cursor="pointer" />
                      <Line type="monotone" dataKey="cumulative" stroke="#c27d16" strokeWidth={2} dot={{ r: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <div className={selected ? "two-column" : "page-stack"}>
                <Panel eyebrow={`PAGE ${page + 1}`} title="Discovered variants">
                  {data.variants.length === 0 ? (
                    <EmptyState title="No variants on this page" />
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Variant</th>
                            <th>Sequence</th>
                            <th>Cases</th>
                            <th className="numeric">Avg · median · p95</th>
                            <th className="numeric">SLA violations</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.variants.map((variant) => (
                            <tr
                              key={variant.variantId}
                              className={`row-clickable ${variant.variantId === search.selected ? "row-selected" : ""}`}
                              onClick={() => select(variant.variantId === search.selected ? undefined : variant.variantId)}
                            >
                              <td>
                                <div className="variant-id">
                                  <span>V{variant.rank}</span>
                                  <code>{variant.variantId.slice(0, 8)}</code>
                                </div>
                              </td>
                              <td>
                                <SequenceChips activities={variant.activities} max={6} />
                                <div className="mt-1 flex gap-1">
                                  {variant.containsRework ? (
                                    <Chip tone="rework">
                                      <RefreshCw className="h-2.5 w-2.5" /> REWORK
                                    </Chip>
                                  ) : null}
                                  {dominant && variant.rank !== 1 ? <DeviationChips variant={variant} dominant={dominant} /> : null}
                                </div>
                              </td>
                              <td>
                                <div className="mono-value">{formatCount(variant.caseCount)}</div>
                                <ShareBar percent={variant.casePercent} />
                              </td>
                              <td className="numeric mono-value nowrap">
                                {formatDuration(variant.avgDurationMs)} · {formatDuration(variant.medianDurationMs)} · {formatDuration(variant.p95DurationMs)}
                              </td>
                              <td className="numeric">
                                <span className={`sla-pill ${variant.slaViolationRatePercent >= 25 ? "sla-breach" : variant.slaViolationRatePercent > 0 ? "sla-risk" : "sla-good"}`}>
                                  {formatPercent(variant.slaViolationRatePercent)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <Pager page={data.page} totalPages={data.totalPages} totalElements={data.totalVariants} itemLabel="variants" onPage={(next) => void navigate({ search: (previous) => ({ ...previous, page: next }) })} />
                </Panel>
                {selected ? <VariantDetail variant={selected} dominant={dominant} processKey={processKey} onClose={() => select(undefined)} /> : null}
              </div>
              {search.selected && !selected && !wide.isFetching && wide.isFetched ? (
                <Panel>
                  <EmptyState title="Variant not found in the top 200" description="It may be a rare variant further down the long tail." />
                </Panel>
              ) : null}
            </>
          );
        }}
      </QueryView>
    </div>
  );
}

function DeviationChips({ variant, dominant }: { variant: Variant; dominant: Variant }) {
  const { missing, unexpected } = compareWithDominant(variant.activities, dominant.activities);
  return (
    <>
      {missing.length ? <Chip tone="warning" title={`Missing vs V1: ${missing.join(", ")}`}>−{missing.length} vs V1</Chip> : null}
      {unexpected.length ? <Chip tone="danger" title={`Not in V1: ${unexpected.join(", ")}`}>+{unexpected.length} vs V1</Chip> : null}
    </>
  );
}

function VariantDetail({ variant, dominant, processKey, onClose }: { variant: Variant; dominant: Variant | undefined; processKey: string; onClose: () => void }) {
  const comparison = dominant && variant.variantId !== dominant.variantId ? compareWithDominant(variant.activities, dominant.activities) : undefined;
  const seen = new Set<string>();
  return (
    <Panel
      eyebrow={`VARIANT ${variant.variantId}`}
      title={`V${variant.rank}`}
      action={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="panel-body flex flex-col gap-4">
        <DefinitionList
          items={[
            { label: "Cases", value: `${formatCount(variant.caseCount)} (${formatPercent(variant.casePercent)})` },
            { label: "Cumulative share", value: formatPercent(variant.cumulativeCasePercent) },
            { label: "Avg duration", value: formatDuration(variant.avgDurationMs) },
            { label: "Median duration", value: formatDuration(variant.medianDurationMs) },
            { label: "P95 duration", value: formatDuration(variant.p95DurationMs) },
            { label: "SLA violations", value: `${formatCount(variant.slaViolations)} (${formatPercent(variant.slaViolationRatePercent)})` },
          ]}
        />
        <div>
          <div className="inspector-title">Path ({variant.activityCount} steps)</div>
          <ol className="flex flex-col gap-1">
            {variant.activities.map((activity, index) => {
              const repeat = seen.has(activity);
              seen.add(activity);
              return (
                <li key={`${activity}-${index}`} className="flex items-center gap-2 text-[11px]">
                  <span className="mono-value muted w-5 text-right">{index + 1}</span>
                  {index > 0 ? <ArrowDown className="h-3 w-3 text-muted-foreground" /> : <span className="w-3" />}
                  <span className={repeat ? "font-semibold text-amber-700" : ""}>{activity}</span>
                  {repeat ? <Chip tone="rework">repeat</Chip> : null}
                </li>
              );
            })}
          </ol>
        </div>
        {comparison ? (
          <div className="text-[11px]">
            <div className="inspector-title">Compared with V1</div>
            <p>
              Missing: {comparison.missing.length ? comparison.missing.join(", ") : "none"}
              <br />
              Unexpected: {comparison.unexpected.length ? comparison.unexpected.join(", ") : "none"}
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/p/$processKey/cases" params={{ processKey }} search={{ variantId: variant.variantId }}>
              View {formatCount(variant.caseCount)} cases
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/p/$processKey/explorer" params={{ processKey }} search={{ variant: variant.variantId }}>
              Highlight in Process Explorer
            </Link>
          </Button>
        </div>
      </div>
    </Panel>
  );
}
