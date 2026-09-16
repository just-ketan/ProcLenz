import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, RotateCcw, Search } from "lucide-react";
import type { CaseSortField } from "@/api/types";
import { usePreferences } from "@/app/preferences";
import { intParam, oneOf, stringParam } from "@/app/search";
import { EmptyState, QueryView } from "@/components/feedback/states";
import { ProcessControls } from "@/components/layout/ProcessControls";
import { Bar, InfoTip, PageHeader, Pager, Panel, SlaStatusBadge } from "@/components/proclenz/ui";
import { Button } from "@/components/ui/button";
import { breachedMinDurationMs, caseSlaStatus, FORMULAS } from "@/domain/derived";
import { formatCount, formatDateTime, formatDuration, formatPercent, shortId } from "@/domain/format";
import { useCases, useProcessSummary, useVariants } from "@/hooks/queries";

const SORT_FIELDS = ["durationMs", "startedAt", "caseId", "eventCount"] as const;
const DIRECTIONS = ["asc", "desc"] as const;
const PAGE_SIZES = [20, 50, 100, 200];
const HOUR_MS = 3_600_000;

type CasesSearch = {
  page?: number | undefined;
  size?: number | undefined;
  sort?: CaseSortField | undefined;
  direction?: "asc" | "desc" | undefined;
  minDurationMs?: number | undefined;
  variantId?: string | undefined;
};

export const Route = createFileRoute("/p/$processKey/cases/")({
  validateSearch: (search: Record<string, unknown>): CasesSearch => ({
    page: intParam(search["page"], 0),
    size: intParam(search["size"], 1, 200),
    sort: oneOf(search["sort"], SORT_FIELDS),
    direction: oneOf(search["direction"], DIRECTIONS),
    minDurationMs: intParam(search["minDurationMs"], 0),
    variantId: stringParam(search["variantId"]),
  }),
  head: () => ({ meta: [{ title: "Cases · Proclenz" }] }),
  component: CasesPage,
});

function CasesPage() {
  const { processKey } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { sla, timeDisplay } = usePreferences();
  const page = search.page ?? 0;
  const size = search.size ?? 20;
  const sort = search.sort ?? "durationMs";
  const direction = search.direction ?? "desc";

  const summary = useProcessSummary(processKey, sla);
  const variants = useVariants(processKey, { sla, page: 0, size: 200 });
  const cases = useCases(processKey, { page, size, sort, direction, minDurationMs: search.minDurationMs, variantId: search.variantId });

  const thresholdMs = summary.data?.sla.thresholdMs;
  const rankByVariant = useMemo(() => new Map((variants.data?.variants ?? []).map((variant) => [variant.variantId, variant.rank])), [variants.data]);
  const [goToCase, setGoToCase] = useState("");
  const [minHours, setMinHours] = useState(search.minDurationMs !== undefined ? String(Math.round((search.minDurationMs / HOUR_MS) * 10) / 10) : "");

  const update = (patch: CasesSearch) => void navigate({ search: (previous) => ({ ...previous, page: 0, ...patch }) });
  const breachedOnly = thresholdMs !== undefined && search.minDurationMs === breachedMinDurationMs(thresholdMs);
  const filtersActive = search.minDurationMs !== undefined || search.variantId !== undefined;

  const openCase = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const caseId = goToCase.trim();
    if (caseId) void navigate({ to: "/p/$processKey/cases/$caseId", params: { processKey, caseId } });
  };

  const applyMinDuration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const hours = Number(minHours);
    update({ minDurationMs: minHours.trim() === "" || !Number.isFinite(hours) || hours < 0 ? undefined : Math.round(hours * HOUR_MS) });
  };

  const onSort = (field: CaseSortField) => {
    update({ sort: field, direction: sort === field && direction === "desc" ? "asc" : "desc" });
  };

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Case explorer" title="Cases" description="Every case reconstructed from its events. Filters, sorting and paging run on the backend." />
      <ProcessControls processKey={processKey} summary={summary.data} />

      <Panel className="overflow-hidden">
        <div className="toolbar">
          <form className="field" onSubmit={openCase}>
            <span className="field-label">Go to case</span>
            <div className="inline-form">
              <input value={goToCase} onChange={(event) => setGoToCase(event.target.value)} placeholder="Exact case ID, e.g. ORD-1001" aria-label="Case ID" />
              <Button type="submit" size="sm" variant="outline" disabled={!goToCase.trim()}>
                <Search />
                Open
              </Button>
            </div>
          </form>
          <label className="checkbox-field" title={FORMULAS.caseSlaStatus}>
            <input
              type="checkbox"
              checked={breachedOnly}
              disabled={thresholdMs === undefined}
              onChange={(event) => update({ minDurationMs: event.target.checked && thresholdMs !== undefined ? breachedMinDurationMs(thresholdMs) : undefined })}
            />
            Breached SLA only {thresholdMs !== undefined ? `(> ${formatDuration(thresholdMs)})` : ""}
          </label>
          <form className="field" onSubmit={applyMinDuration}>
            <span className="field-label">Min duration (hours)</span>
            <div className="inline-form">
              <input type="number" min={0} step="0.5" value={minHours} onChange={(event) => setMinHours(event.target.value)} className="w-24" aria-label="Minimum duration in hours" />
              <Button type="submit" size="sm" variant="outline">
                Apply
              </Button>
            </div>
          </form>
          <label className="field">
            <span className="field-label">Variant</span>
            <select value={search.variantId ?? ""} onChange={(event) => update({ variantId: event.target.value || undefined })} className="max-w-[260px]">
              <option value="">All variants</option>
              {search.variantId && !rankByVariant.has(search.variantId) ? <option value={search.variantId}>{shortId(search.variantId)}</option> : null}
              {(variants.data?.variants ?? []).map((variant) => (
                <option key={variant.variantId} value={variant.variantId}>
                  V{variant.rank} · {formatPercent(variant.casePercent)} · {variant.activityCount} steps
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Page size</span>
            <select value={size} onChange={(event) => update({ size: Number(event.target.value) })}>
              {PAGE_SIZES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <div className="toolbar-spacer" />
          {filtersActive ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMinHours("");
                update({ minDurationMs: undefined, variantId: undefined });
              }}
            >
              <RotateCcw />
              Reset filters
            </Button>
          ) : null}
        </div>

        <QueryView query={cases} loadingLabel="Loading cases…" rows={8}>
          {(data) =>
            data.content.length === 0 ? (
              <EmptyState
                title={filtersActive ? "No cases match these filters" : "No cases in this process yet"}
                description={filtersActive ? "Relax the duration or variant filter." : "Ingest events to reconstruct cases."}
              />
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <SortHeader field="caseId" label="Case ID" sort={sort} direction={direction} onSort={onSort} />
                        <SortHeader field="startedAt" label="Started" sort={sort} direction={direction} onSort={onSort} />
                        <th>Ended</th>
                        <SortHeader field="durationMs" label="Duration" sort={sort} direction={direction} onSort={onSort} numeric />
                        <SortHeader field="eventCount" label="Events" sort={sort} direction={direction} onSort={onSort} numeric />
                        <th>Variant</th>
                        <th>
                          <span className="inline-flex items-center gap-1">
                            SLA status
                            <InfoTip text={FORMULAS.caseSlaStatus} />
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.content.map((row) => {
                        const status = thresholdMs === undefined ? undefined : caseSlaStatus(row.durationMs, thresholdMs);
                        const rank = rankByVariant.get(row.variantId);
                        return (
                          <tr
                            key={row.caseId}
                            className="row-clickable"
                            onClick={() => void navigate({ to: "/p/$processKey/cases/$caseId", params: { processKey, caseId: row.caseId } })}
                          >
                            <td>
                              <Link to="/p/$processKey/cases/$caseId" params={{ processKey, caseId: row.caseId }} className="link mono-value" onClick={(event) => event.stopPropagation()}>
                                {row.caseId}
                              </Link>
                            </td>
                            <td className="nowrap">{formatDateTime(row.startedAt, timeDisplay)}</td>
                            <td className="nowrap">{formatDateTime(row.endedAt, timeDisplay)}</td>
                            <td className="numeric">
                              <span className="inline-flex items-center justify-end gap-2">
                                <span className="mono-value">{formatDuration(row.durationMs)}</span>
                                {thresholdMs !== undefined ? (
                                  <Bar value={row.durationMs} max={thresholdMs * 1.5} tone={status === "BREACHED" ? "danger" : status === "AT_RISK" ? "warning" : "good"} />
                                ) : null}
                              </span>
                            </td>
                            <td className="numeric mono-value">{formatCount(row.eventCount)}</td>
                            <td>
                              <Link
                                to="/p/$processKey/variants"
                                params={{ processKey }}
                                search={{ selected: row.variantId }}
                                onClick={(event) => event.stopPropagation()}
                                title={row.variantId}
                              >
                                <span className="chip chip-blue">{rank === undefined ? shortId(row.variantId) : `V${rank}`}</span>
                              </Link>
                            </td>
                            <td>{status ? <SlaStatusBadge status={status} /> : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pager page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} itemLabel="cases" onPage={(next) => void navigate({ search: (previous) => ({ ...previous, page: next }) })} />
              </>
            )
          }
        </QueryView>
      </Panel>
    </div>
  );
}

function SortHeader({
  field,
  label,
  sort,
  direction,
  onSort,
  numeric,
}: {
  field: CaseSortField;
  label: string;
  sort: CaseSortField;
  direction: "asc" | "desc";
  onSort: (field: CaseSortField) => void;
  numeric?: boolean | undefined;
}) {
  const active = sort === field;
  return (
    <th className={numeric ? "numeric" : undefined} aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={`sort-button ${active ? "sort-active" : ""}`} onClick={() => onSort(field)}>
        {label}
        {active ? direction === "desc" ? <ArrowDown /> : <ArrowUp /> : <ArrowUpDown />}
      </button>
    </th>
  );
}
