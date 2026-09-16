import { useCallback, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowDownUp, BarChart3, Clock3, Filter, GitBranch, RefreshCw, X } from "lucide-react";
import { oneOf, stringParam } from "@/app/search";
import { usePreferences } from "@/app/preferences";
import { QueryView } from "@/components/feedback/states";
import { ProcessControls } from "@/components/layout/ProcessControls";
import { EdgeInspector, ExplorerSummary, NodeInspector } from "@/components/process-graph/inspectors";
import { ProcessGraphView } from "@/components/process-graph/ProcessGraphView";
import { PageHeader, Panel } from "@/components/proclenz/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { FORMULAS, transitionKey, variantPathEdges } from "@/domain/derived";
import { formatCount, formatDuration, formatPercent } from "@/domain/format";
import { GRAPH_COLORS, type BuildGraphOptions, type GraphMode, type GraphOverlays, type LayoutDirection } from "@/domain/graph";
import { BOTTLENECK_LIMIT, useBottlenecks, useInsights, useProcessGraph, useProcessSummary, useRework, useVariants } from "@/hooks/queries";

const OVERLAYS = ["bottlenecks", "rework", "deviations"] as const;

type ExplorerSearch = {
  node?: string | undefined;
  edge?: string | undefined;
  overlay?: (typeof OVERLAYS)[number] | undefined;
  variant?: string | undefined;
};

export const Route = createFileRoute("/p/$processKey/explorer")({
  validateSearch: (search: Record<string, unknown>): ExplorerSearch => ({
    node: stringParam(search["node"]),
    edge: stringParam(search["edge"]),
    overlay: oneOf(search["overlay"], OVERLAYS),
    variant: stringParam(search["variant"]),
  }),
  head: () => ({ meta: [{ title: "Process Explorer · Proclenz" }] }),
  component: ExplorerPage,
});

const RARE_PATH_PERCENT = 5;

function loopEdges(path: readonly string[]): Set<string> {
  const edges = new Set<string>();
  for (let index = 1; index < path.length; index++) edges.add(transitionKey(path[index - 1] as string, path[index] as string));
  return edges;
}

function ExplorerPage() {
  const { processKey } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { sla } = usePreferences();

  const [mode, setMode] = useState<GraphMode>("frequency");
  const [direction, setDirection] = useState<LayoutDirection>("LR");
  const [overlays, setOverlays] = useState<GraphOverlays>(() => ({
    bottlenecks: search.overlay === undefined || search.overlay === "bottlenecks",
    rework: search.overlay === "rework",
    deviations: search.overlay === "deviations",
  }));
  const [hiddenActivities, setHiddenActivities] = useState<ReadonlySet<string>>(new Set());
  const [minCasePercent, setMinCasePercent] = useState(0);
  const [loopPath, setLoopPath] = useState<string[] | undefined>(undefined);
  const [variantsRequested, setVariantsRequested] = useState(false);
  const [hiddenEdgeCount, setHiddenEdgeCount] = useState(0);

  const summary = useProcessSummary(processKey, sla);
  const graph = useProcessGraph(processKey);
  const bottlenecks = useBottlenecks(processKey, BOTTLENECK_LIMIT, overlays.bottlenecks || search.edge !== undefined);
  const rework = useRework(processKey, 20, overlays.rework || search.node !== undefined);
  const insights = useInsights(processKey, sla, overlays.deviations || search.node !== undefined);
  const variants = useVariants(processKey, { sla, page: 0, size: 50 }, overlays.deviations || variantsRequested || search.variant !== undefined);

  const selectedVariant = variants.data?.variants.find((variant) => variant.variantId === search.variant);
  const dominant = variants.data?.variants[0];

  const skippedActivities = useMemo(() => {
    const skipped = new Map<string, number>();
    for (const insight of insights.data?.insights ?? []) {
      const activity = insight.evidence["activity"];
      const percent = insight.evidence["skippedPercent"];
      if (insight.type === "SKIPPED_ACTIVITY" && typeof activity === "string" && typeof percent === "number") skipped.set(activity, percent);
    }
    return skipped;
  }, [insights.data]);

  const highlightEdges = useMemo(
    () => (loopPath ? loopEdges(loopPath) : selectedVariant ? variantPathEdges(selectedVariant.activities) : undefined),
    [loopPath, selectedVariant],
  );
  const dominantEdges = useMemo(() => (dominant ? variantPathEdges(dominant.activities) : undefined), [dominant]);

  const options = useMemo<BuildGraphOptions>(
    () => ({
      mode,
      overlays,
      direction,
      bottlenecks: bottlenecks.data?.bottlenecks,
      skippedActivities,
      dominantEdges,
      highlightEdges,
      hiddenActivities,
      minCasePercent,
      rarePathPercent: RARE_PATH_PERCENT,
      maxLabels: 40,
    }),
    [mode, overlays, direction, bottlenecks.data, skippedActivities, dominantEdges, highlightEdges, hiddenActivities, minCasePercent],
  );

  const selectNode = useCallback(
    (node: string | undefined) => void navigate({ search: (previous) => ({ ...previous, node, edge: undefined }), replace: true }),
    [navigate],
  );
  const selectEdge = useCallback(
    (edge: string | undefined) => void navigate({ search: (previous) => ({ ...previous, edge, node: undefined }), replace: true }),
    [navigate],
  );
  const toggleOverlay = (overlay: keyof GraphOverlays) => setOverlays((current) => ({ ...current, [overlay]: !current[overlay] }));

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Process explorer"
        title="Process Explorer"
        description="The discovered process as a directly-follows graph. Edge width is frequency; select activities and transitions for detail."
      />
      <ProcessControls processKey={processKey} summary={summary.data} />

      <div className="explorer-layout">
        <Panel className="overflow-hidden">
          <div className="explorer-toolbar">
            <div className="segmented" role="group" aria-label="Graph measure">
              <button type="button" className={mode === "frequency" ? "selected" : ""} onClick={() => setMode("frequency")}>
                <BarChart3 />
                Show frequency
              </button>
              <button type="button" className={mode === "duration" ? "selected" : ""} onClick={() => setMode("duration")}>
                <Clock3 />
                Show duration
              </button>
            </div>
            <span className="divider" />
            <button type="button" className="toggle-chip tone-danger" aria-pressed={overlays.bottlenecks} onClick={() => toggleOverlay("bottlenecks")}>
              <AlertTriangle />
              Show bottlenecks
            </button>
            <button type="button" className="toggle-chip tone-rework" aria-pressed={overlays.rework} onClick={() => toggleOverlay("rework")}>
              <RefreshCw />
              Show rework
            </button>
            <button type="button" className="toggle-chip" aria-pressed={overlays.deviations} onClick={() => toggleOverlay("deviations")} title={FORMULAS.deviation}>
              <GitBranch />
              Show deviations
            </button>
            <span className="divider" />
            <select
              className="toggle-chip"
              value={search.variant ?? ""}
              onFocus={() => setVariantsRequested(true)}
              onMouseDown={() => setVariantsRequested(true)}
              onChange={(event) => {
                setLoopPath(undefined);
                void navigate({ search: (previous) => ({ ...previous, variant: event.target.value || undefined }), replace: true });
              }}
              aria-label="Highlight variant"
            >
              <option value="">{variants.isFetching ? "Loading variants…" : "Highlight variant…"}</option>
              {variants.data?.variants.map((variant) => (
                <option key={variant.variantId} value={variant.variantId}>
                  V{variant.rank} · {formatPercent(variant.casePercent)} · {variant.activityCount} steps
                </option>
              ))}
            </select>
            <ActivityFilter
              activities={graph.data?.nodes.filter((node) => node.type === "ACTIVITY").map((node) => node.id) ?? []}
              hidden={hiddenActivities}
              onChange={setHiddenActivities}
            />
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground" title="Hide transitions taken by fewer cases than this share">
              Paths ≥ {minCasePercent}%
              <Slider className="w-24" min={0} max={30} step={1} value={[minCasePercent]} onValueChange={(value) => setMinCasePercent(value[0] ?? 0)} aria-label="Minimum case share of visible transitions" />
            </div>
            <button type="button" className="toggle-chip" onClick={() => setDirection((current) => (current === "LR" ? "TB" : "LR"))} title="Switch layout direction">
              <ArrowDownUp />
              {direction === "LR" ? "Left → right" : "Top → bottom"}
            </button>
            {highlightEdges ? (
              <button
                type="button"
                className="toggle-chip"
                aria-pressed
                onClick={() => {
                  setLoopPath(undefined);
                  void navigate({ search: (previous) => ({ ...previous, variant: undefined }), replace: true });
                }}
              >
                <X />
                Clear highlight
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
            <div className="graph-legend">
              <span>
                <i className="legend-swatch" style={{ background: GRAPH_COLORS.path }} />
                Transition
              </span>
              {overlays.bottlenecks ? (
                <>
                  <span>
                    <i className="legend-swatch" style={{ background: GRAPH_COLORS.high }} />
                    HIGH bottleneck
                  </span>
                  <span>
                    <i className="legend-swatch" style={{ background: GRAPH_COLORS.medium }} />
                    MEDIUM bottleneck
                  </span>
                </>
              ) : null}
              {overlays.rework ? (
                <span style={{ color: GRAPH_COLORS.rework }}>
                  <i className="legend-swatch dashed" />
                  Back to an earlier activity
                </span>
              ) : null}
              {overlays.deviations ? (
                <span style={{ color: GRAPH_COLORS.rare }} title={FORMULAS.rarePath}>
                  <i className="legend-swatch dashed" />
                  Rare path (&lt; {RARE_PATH_PERCENT}% of cases); faded = off the most common variant
                </span>
              ) : null}
            </div>
            {hiddenEdgeCount > 0 ? <span className="text-[10px] text-muted-foreground">{formatCount(hiddenEdgeCount)} transitions hidden by filters</span> : null}
          </div>
          <QueryView query={graph} loadingLabel="Computing process model…" rows={10}>
            {(data) => (
              <ProcessGraphView
                graph={data}
                options={options}
                height={640}
                selectedNodeId={search.node}
                selectedEdgeId={search.edge}
                onSelectNode={selectNode}
                onSelectEdge={selectEdge}
                onHiddenEdgeCount={setHiddenEdgeCount}
                showMinimap
              />
            )}
          </QueryView>
        </Panel>

        <Panel className="inspector">
          {graph.data ? (
            (() => {
              const node = search.node ? graph.data.nodes.find((candidate) => candidate.id === search.node) : undefined;
              const edge = search.edge ? graph.data.edges.find((candidate) => candidate.id === search.edge) : undefined;
              if (node) {
                return (
                  <NodeInspector
                    node={node}
                    graph={graph.data}
                    bottlenecks={bottlenecks.data}
                    rework={rework.data}
                    insights={insights.data}
                    processKey={processKey}
                    onSelectEdge={selectEdge}
                  />
                );
              }
              if (edge) {
                return (
                  <EdgeInspector
                    edge={edge}
                    bottleneck={bottlenecks.data?.bottlenecks.find((candidate) => transitionKey(candidate.fromActivity, candidate.toActivity) === edge.id)}
                    processKey={processKey}
                    onSelectNode={selectNode}
                  />
                );
              }
              return (
                <ExplorerSummary
                  graph={graph.data}
                  bottlenecks={overlays.bottlenecks ? bottlenecks.data : undefined}
                  rework={overlays.rework ? rework.data : undefined}
                  selectedVariant={selectedVariant}
                  onSelectEdge={selectEdge}
                  onHighlightLoop={(path) => {
                    setLoopPath(path);
                    setOverlays((current) => ({ ...current, rework: true }));
                  }}
                />
              );
            })()
          ) : (
            <div className="inspector-section muted text-[11px]">The inspector fills in once the graph loads.</div>
          )}
          {loopPath ? (
            <div className="inspector-section">
              <div className="inspector-title">Highlighted loop</div>
              <p className="text-[11px]">{loopPath.join(" → ")}</p>
            </div>
          ) : null}
          {selectedVariant ? (
            <div className="inspector-section">
              <div className="inspector-title">Variant V{selectedVariant.rank} path</div>
              <p className="text-[11px] leading-relaxed">{selectedVariant.sequence}</p>
              <p className="muted mt-1 text-[10px]">
                {formatCount(selectedVariant.caseCount)} cases · avg {formatDuration(selectedVariant.avgDurationMs)}
              </p>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

function ActivityFilter({ activities, hidden, onChange }: { activities: string[]; hidden: ReadonlySet<string>; onChange: (hidden: ReadonlySet<string>) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="toggle-chip" aria-pressed={hidden.size > 0}>
          <Filter />
          Activities{hidden.size > 0 ? ` (${hidden.size} hidden)` : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="mb-2 flex items-center justify-between text-xs">
          <strong>Show activities</strong>
          <button type="button" className="link-button" onClick={() => onChange(new Set())}>
            Show all
          </button>
        </div>
        <div className="filter-list">
          {[...activities].sort().map((activity) => (
            <label key={activity}>
              <Checkbox
                checked={!hidden.has(activity)}
                onCheckedChange={(checked) => {
                  const next = new Set(hidden);
                  if (checked) next.delete(activity);
                  else next.add(activity);
                  onChange(next);
                }}
              />
              {activity}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
