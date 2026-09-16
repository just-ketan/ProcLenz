import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bar as ChartBar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import type { ProcessSummary, SlaAnalysis } from "@/api/types";
import { usePreferences } from "@/app/preferences";
import { intParam } from "@/app/search";
import { EmptyState, QueryView } from "@/components/feedback/states";
import { ProcessControls } from "@/components/layout/ProcessControls";
import { Chip, PageHeader, Panel, SlaStatusBadge, Stat } from "@/components/proclenz/ui";
import { Button } from "@/components/ui/button";
import { atRiskMinDurationMs, breachedMinDurationMs, compliancePercent, FORMULAS, slaMarginMs } from "@/domain/derived";
import { formatCount, formatDuration, formatPercent, shortId } from "@/domain/format";
import { useCases, useProcessSummary, useSlaAnalysis } from "@/hooks/queries";

type SlaSearch = { worst?: number | undefined };

export const Route = createFileRoute("/p/$processKey/sla")({
  validateSearch: (search: Record<string, unknown>): SlaSearch => ({ worst: intParam(search["worst"], 1, 100) }),
  head: () => ({ meta: [{ title: "SLA & Compliance · Proclenz" }] }),
  component: SlaPage,
});

const HOUR_MS = 3_600_000;

function SlaPage() {
  const { processKey } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { sla } = usePreferences();
  const worst = search.worst ?? 10;

  const summary = useProcessSummary(processKey, sla);
  const analysis = useSlaAnalysis(processKey, sla, worst);
  const thresholdMs = analysis.data?.thresholdMs;
  const atRiskCases = useCases(processKey, { page: 0, size: 1, minDurationMs: thresholdMs === undefined ? undefined : atRiskMinDurationMs(thresholdMs) }, thresholdMs !== undefined);
  const atRisk = atRiskCases.data && analysis.data ? Math.max(0, atRiskCases.data.totalElements - analysis.data.violatingCases) : undefined;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="SLA & compliance"
        title="SLA & Compliance"
        description="Case duration measured against the SLA threshold. Change the threshold in the control strip to re-evaluate every case."
      />
      <ProcessControls processKey={processKey} summary={summary.data} />
      <QueryView query={analysis} loadingLabel="Evaluating cases against the SLA…" rows={8}>
        {(data) => <SlaContent data={data} summary={summary.data} atRisk={atRisk} processKey={processKey} worst={worst} onWorst={(value) => void navigate({ search: { worst: value } })} />}
      </QueryView>
    </div>
  );
}

function SlaContent({
  data,
  summary,
  atRisk,
  processKey,
  worst,
  onWorst,
}: {
  data: SlaAnalysis;
  summary: ProcessSummary | undefined;
  atRisk: number | undefined;
  processKey: string;
  worst: number;
  onWorst: (value: number) => void;
}) {
  const compliance = compliancePercent(data.compliantCases, data.totalCases);
  const margin = slaMarginMs(data.thresholdMs, data.avgDurationMs);
  const durationBars = [
    { name: "Average", ms: data.avgDurationMs },
    ...(summary ? [{ name: "Median", ms: summary.medianCaseDurationMs }] : []),
    { name: "P95", ms: data.p95DurationMs },
    ...(summary ? [{ name: "Max", ms: summary.maxCaseDurationMs }] : []),
  ].map((entry) => ({ ...entry, hours: entry.ms / HOUR_MS }));
  const variantBars = data.variantsByViolations.map((variant) => ({
    name: shortId(variant.variantId),
    violations: variant.violations,
    rate: variant.violationRatePercent,
    sequence: variant.activities.join(" → "),
  }));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <Chip tone="blue">Threshold {formatDuration(data.thresholdMs)}</Chip>
        <Chip>Source: {data.thresholdSource}</Chip>
        <span className="muted">A case complies when its duration is at most the threshold.</span>
      </div>
      <div className="stat-grid">
        <Stat label="SLA compliance" value={formatPercent(compliance)} hint={`${formatCount(data.compliantCases)} of ${formatCount(data.totalCases)} cases`} tone={compliance >= 95 ? "good" : compliance >= 85 ? "warning" : "danger"} info={FORMULAS.compliance} />
        <Stat
          label="Breached cases"
          value={formatCount(data.violatingCases)}
          hint={
            <Link to="/p/$processKey/cases" params={{ processKey }} search={{ minDurationMs: breachedMinDurationMs(data.thresholdMs) }} className="link">
              {formatPercent(data.violationRatePercent)} · view all
            </Link>
          }
          tone={data.violatingCases > 0 ? "danger" : "good"}
        />
        <Stat
          label="At-risk cases"
          value={atRisk === undefined ? "…" : formatCount(atRisk)}
          hint={
            <Link to="/p/$processKey/cases" params={{ processKey }} search={{ minDurationMs: atRiskMinDurationMs(data.thresholdMs) }} className="link">
              ≥ 80% of the threshold, not yet over
            </Link>
          }
          tone={atRisk ? "warning" : undefined}
          info={FORMULAS.atRisk}
        />
        <Stat label="Average SLA margin" value={formatDuration(margin)} hint={margin >= 0 ? "Average case finishes inside the SLA" : "Average case is over the SLA"} tone={margin >= 0 ? "good" : "danger"} info={FORMULAS.margin} />
        <Stat label="P95 case duration" value={formatDuration(data.p95DurationMs)} hint={`${data.p95DurationMs > data.thresholdMs ? "over" : "within"} the ${formatDuration(data.thresholdMs)} SLA`} tone={data.p95DurationMs > data.thresholdMs ? "warning" : "good"} />
      </div>

      <div className="three-column">
        <Panel eyebrow="DISTRIBUTION" title="Case duration vs SLA">
          <div className="chart-box px-3 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={durationBars} layout="vertical" margin={{ top: 12, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="#e6ebf2" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} unit="h" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={56} />
                <ChartTooltip formatter={(value) => [formatDuration(Number(value) * HOUR_MS), "Duration"]} />
                <ReferenceLine x={data.thresholdMs / HOUR_MS} stroke="#c4473e" strokeDasharray="4 4" label={{ value: "SLA", fill: "#c4473e", fontSize: 10, position: "top" }} />
                <ChartBar dataKey="hours" radius={[0, 3, 3, 0]} maxBarSize={22}>
                  {durationBars.map((entry) => (
                    <Cell key={entry.name} fill={entry.ms > data.thresholdMs ? "#c4473e" : "#2f67c4"} />
                  ))}
                </ChartBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel eyebrow="WHERE BREACHES COME FROM" title="Breaches by variant" className="col-span-2">
          {variantBars.length === 0 ? (
            <EmptyState title="No variant breaches the SLA" />
          ) : (
            <div className="chart-box px-3 pb-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={variantBars} margin={{ top: 12, right: 20, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="#e6ebf2" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={44} allowDecimals={false} />
                  <ChartTooltip
                    formatter={(value, name, item) => {
                      const payload = item.payload as { rate: number } | undefined;
                      return name === "violations" ? [`${formatCount(Number(value))} (${formatPercent(payload?.rate)} of the variant)`, "Breaches"] : [String(value), String(name)];
                    }}
                    labelFormatter={(label, payload) => {
                      const entry = payload?.[0]?.payload as { sequence?: string } | undefined;
                      return entry?.sequence ?? String(label);
                    }}
                  />
                  <ChartBar dataKey="violations" fill="#c27d16" radius={[3, 3, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        eyebrow="WORST OFFENDERS"
        title="Worst violations"
        action={
          <label className="field">
            <span className="field-label">Show</span>
            <select value={worst} onChange={(event) => onWorst(Number(event.target.value))}>
              {[10, 25, 50, 100].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        }
      >
        {data.worstViolations.length === 0 ? (
          <EmptyState title="No case breaches the SLA" description={`Every case finished within ${formatDuration(data.thresholdMs)}.`} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Variant</th>
                  <th className="numeric">Duration</th>
                  <th className="numeric">SLA</th>
                  <th className="numeric">Over by</th>
                  <th className="numeric">Variance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.worstViolations.map((violation) => (
                  <tr key={violation.caseId}>
                    <td>
                      <Link to="/p/$processKey/cases/$caseId" params={{ processKey, caseId: violation.caseId }} className="link mono-value">
                        {violation.caseId}
                      </Link>
                    </td>
                    <td>
                      <Link to="/p/$processKey/variants" params={{ processKey }} search={{ selected: violation.variantId }}>
                        <span className="chip chip-blue">{shortId(violation.variantId)}</span>
                      </Link>
                    </td>
                    <td className="numeric mono-value">{formatDuration(violation.durationMs)}</td>
                    <td className="numeric mono-value">{formatDuration(data.thresholdMs)}</td>
                    <td className="numeric mono-value">+{formatDuration(violation.overByMs)}</td>
                    <td className="numeric mono-value">+{formatPercent(violation.overByPercent)}</td>
                    <td>
                      <SlaStatusBadge status="BREACHED" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-4 pt-2">
          <p className="muted text-[10px]">Compliance over time and breaches by activity are not shown: the backend measures SLA per case and exposes no time series.</p>
          <Button asChild size="sm" variant="outline">
            <Link to="/p/$processKey/cases" params={{ processKey }} search={{ minDurationMs: breachedMinDurationMs(data.thresholdMs) }}>
              All breached cases
            </Link>
          </Button>
        </div>
      </Panel>
    </>
  );
}
