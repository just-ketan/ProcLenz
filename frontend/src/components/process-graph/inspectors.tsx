import { Link } from "@tanstack/react-router";
import { MousePointerClick } from "lucide-react";
import type { Bottleneck, BottleneckAnalysis, GraphEdge, GraphNode, InsightReport, ProcessGraph, ReworkAnalysis, Variant } from "@/api/types";
import { DefinitionList, SeverityBadge } from "@/components/proclenz/ui";
import { evidenceChips } from "@/components/proclenz/insights";
import { Button } from "@/components/ui/button";
import { transitionKey } from "@/domain/derived";
import { formatCount, formatDecimal, formatDuration, formatPercent } from "@/domain/format";
import { END_NODE, START_NODE } from "@/domain/graph";

function nodeLabel(id: string): string {
  if (id === START_NODE) return "Start";
  if (id === END_NODE) return "End";
  return id;
}

export function NodeInspector({
  node,
  graph,
  bottlenecks,
  rework,
  insights,
  processKey,
  onSelectEdge,
}: {
  node: GraphNode;
  graph: ProcessGraph;
  bottlenecks: BottleneckAnalysis | undefined;
  rework: ReworkAnalysis | undefined;
  insights: InsightReport | undefined;
  processKey: string;
  onSelectEdge: (edgeId: string) => void;
}) {
  const incoming = graph.edges.filter((edge) => edge.target === node.id).sort((a, b) => b.count - a.count);
  const outgoing = graph.edges.filter((edge) => edge.source === node.id).sort((a, b) => b.count - a.count);
  const reworkStats = rework?.activities.find((activity) => activity.activity === node.id);
  const related = insights?.insights.filter((insight) =>
    [insight.evidence["activity"], insight.evidence["fromActivity"], insight.evidence["toActivity"]].includes(node.id),
  );
  const involved = bottlenecks?.bottlenecks.filter((bottleneck) => bottleneck.toActivity === node.id || bottleneck.fromActivity === node.id);

  if (node.type !== "ACTIVITY") {
    return (
      <div className="inspector-section">
        <div className="eyebrow">{node.type === "START" ? "CASE ENTRY" : "CASE EXIT"}</div>
        <h3 className="mt-1 text-base font-semibold">{nodeLabel(node.id)}</h3>
        <p className="muted mt-2 text-xs">
          {formatCount(node.caseCount)} cases {node.type === "START" ? "start" : "end"} here. The transitions below show which activities cases{" "}
          {node.type === "START" ? "begin" : "finish"} with.
        </p>
        <EdgeTable title={node.type === "START" ? "First activities" : "Last activities"} edges={node.type === "START" ? outgoing : incoming} direction={node.type === "START" ? "out" : "in"} onSelectEdge={onSelectEdge} />
      </div>
    );
  }

  return (
    <>
      <div className="inspector-section">
        <div className="eyebrow">ACTIVITY</div>
        <div className="inspector-heading">
          <h3>{node.label}</h3>
        </div>
        <DefinitionList
          items={[
            { label: "Executions", value: formatCount(node.frequency) },
            { label: "Cases", value: `${formatCount(node.caseCount)} (${formatPercent(node.caseCoveragePercent)})` },
            { label: "Avg waiting time before", value: node.avgTimeToActivityMs > 0 ? formatDuration(node.avgTimeToActivityMs) : "—", info: "Average gap between the preceding event and this activity." },
            { label: "Repeat executions", value: formatCount(node.repeatOccurrences) },
          ]}
        />
        <p className="muted mt-2 text-[10px] leading-relaxed">Execution time is not available: events record completion time only, so Proclenz measures waiting time between events.</p>
      </div>
      {reworkStats ? (
        <div className="inspector-section">
          <div className="inspector-title">Rework</div>
          <DefinitionList
            items={[
              { label: "Cases repeating it", value: `${formatCount(reworkStats.affectedCases)} (${formatPercent(reworkStats.affectedCasePercent)})` },
              { label: "Avg repeats per case", value: formatDecimal(reworkStats.avgRepeatsPerAffectedCase, 2) },
              { label: "Time lost per case", value: formatDuration(reworkStats.avgReworkTimePerAffectedCaseMs) },
            ]}
          />
          <Button asChild variant="link" size="sm" className="px-0">
            <Link to="/p/$processKey/rework" params={{ processKey }} search={{ activity: node.id }}>
              Open rework analysis
            </Link>
          </Button>
        </div>
      ) : null}
      {involved && involved.length > 0 ? (
        <div className="inspector-section">
          <div className="inspector-title">Ranked bottleneck transitions</div>
          {involved.map((bottleneck) => (
            <BottleneckRow key={transitionKey(bottleneck.fromActivity, bottleneck.toActivity)} bottleneck={bottleneck} onSelect={() => onSelectEdge(transitionKey(bottleneck.fromActivity, bottleneck.toActivity))} />
          ))}
        </div>
      ) : null}
      {related && related.length > 0 ? (
        <div className="inspector-section">
          <div className="inspector-title">Related insights</div>
          {related.map((insight) => (
            <div key={insight.title} className="mb-2">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={insight.severity} />
                <strong className="text-[11px]">{insight.title}</strong>
              </div>
              <div className="evidence-row mt-1">
                {evidenceChips(insight).map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="inspector-section">
        <EdgeTable title="Incoming transitions" edges={incoming} direction="in" onSelectEdge={onSelectEdge} />
      </div>
      <div className="inspector-section">
        <EdgeTable title="Outgoing transitions" edges={outgoing} direction="out" onSelectEdge={onSelectEdge} />
      </div>
    </>
  );
}

function EdgeTable({ title, edges, direction, onSelectEdge }: { title: string; edges: GraphEdge[]; direction: "in" | "out"; onSelectEdge: (edgeId: string) => void }) {
  return (
    <>
      <div className="inspector-title mt-3">{title}</div>
      {edges.length === 0 ? (
        <p className="muted text-[11px]">None</p>
      ) : (
        <table className="mini-table">
          <thead>
            <tr>
              <th>{direction === "in" ? "From" : "To"}</th>
              <th className="numeric">Count</th>
              <th className="numeric">{direction === "in" ? "Avg wait" : "% of flow"}</th>
            </tr>
          </thead>
          <tbody>
            {edges.map((edge) => (
              <tr key={edge.id} className="row-clickable" onClick={() => onSelectEdge(edge.id)}>
                <td>{nodeLabel(direction === "in" ? edge.source : edge.target)}</td>
                <td className="numeric mono">{formatCount(edge.count)}</td>
                <td className="numeric mono">{direction === "in" ? formatDuration(edge.avgDurationMs) : formatPercent(edge.percentOfSourceOutgoing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function EdgeInspector({
  edge,
  bottleneck,
  processKey,
  onSelectNode,
}: {
  edge: GraphEdge;
  bottleneck: Bottleneck | undefined;
  processKey: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const boundary = edge.source === START_NODE || edge.target === END_NODE;
  return (
    <>
      <div className="inspector-section">
        <div className="eyebrow">TRANSITION</div>
        <div className="inspector-heading">
          <h3>
            <button type="button" className="link-button text-[15px]" onClick={() => onSelectNode(edge.source)}>
              {nodeLabel(edge.source)}
            </button>{" "}
            →{" "}
            <button type="button" className="link-button text-[15px]" onClick={() => onSelectNode(edge.target)}>
              {nodeLabel(edge.target)}
            </button>
          </h3>
        </div>
        <DefinitionList
          items={[
            { label: "Transitions", value: formatCount(edge.count) },
            { label: "Cases", value: `${formatCount(edge.caseCount)} (${formatPercent(edge.casePercent)})` },
            { label: "Share of outgoing flow", value: formatPercent(edge.percentOfSourceOutgoing), info: `Of everything leaving ${nodeLabel(edge.source)}, this share continues to ${nodeLabel(edge.target)}.` },
            ...(boundary
              ? []
              : [
                  { label: "Avg wait", value: formatDuration(edge.avgDurationMs) },
                  { label: "Median wait", value: formatDuration(edge.medianDurationMs) },
                  { label: "P95 wait", value: formatDuration(edge.p95DurationMs) },
                  { label: "Rework transitions", value: formatCount(edge.reworkCount), info: "Times this transition led back to an activity already executed in the case." },
                ]),
          ]}
        />
      </div>
      {bottleneck ? (
        <div className="inspector-section">
          <div className="inspector-title">Bottleneck ranking</div>
          <DefinitionList
            items={[
              { label: "Rank", value: `#${bottleneck.rank}` },
              { label: "Severity", value: <SeverityBadge severity={bottleneck.severity} /> },
              { label: "Score", value: formatDecimal(bottleneck.score, 1) },
              { label: "Share of all waiting", value: formatPercent(bottleneck.waitSharePercent) },
              { label: "Tail volatility", value: formatDecimal(bottleneck.tailVolatility, 2) },
            ]}
          />
          <Button asChild variant="link" size="sm" className="px-0">
            <Link to="/p/$processKey/bottlenecks" params={{ processKey }} search={{ selected: transitionKey(bottleneck.fromActivity, bottleneck.toActivity) }}>
              Open bottleneck analysis
            </Link>
          </Button>
        </div>
      ) : null}
    </>
  );
}

function BottleneckRow({ bottleneck, onSelect }: { bottleneck: Bottleneck; onSelect: () => void }) {
  return (
    <button type="button" className="flex w-full items-center justify-between gap-2 rounded px-1 py-1.5 text-left text-[11px] hover:bg-muted" onClick={onSelect}>
      <span className="flex min-w-0 items-center gap-2">
        <SeverityBadge severity={bottleneck.severity} />
        <span className="truncate">
          {bottleneck.fromActivity} → {bottleneck.toActivity}
        </span>
      </span>
      <span className="mono shrink-0">{formatPercent(bottleneck.waitSharePercent)}</span>
    </button>
  );
}

export function ExplorerSummary({
  graph,
  bottlenecks,
  rework,
  selectedVariant,
  onSelectEdge,
  onHighlightLoop,
}: {
  graph: ProcessGraph;
  bottlenecks: BottleneckAnalysis | undefined;
  rework: ReworkAnalysis | undefined;
  selectedVariant: Variant | undefined;
  onSelectEdge: (edgeId: string) => void;
  onHighlightLoop: (path: string[]) => void;
}) {
  const activities = graph.nodes.filter((node) => node.type === "ACTIVITY").length;
  const transitions = graph.edges.filter((edge) => edge.source !== START_NODE && edge.target !== END_NODE).length;
  return (
    <>
      <div className="inspector-section">
        <div className="eyebrow">DISCOVERED MODEL</div>
        <DefinitionList
          items={[
            { label: "Cases", value: formatCount(graph.caseCount) },
            { label: "Activities", value: formatCount(activities) },
            { label: "Transitions", value: formatCount(transitions) },
          ]}
        />
        <p className="muted mt-3 flex items-center gap-2 text-[11px]">
          <MousePointerClick className="h-3.5 w-3.5" /> Select an activity or transition to inspect it.
        </p>
      </div>
      {selectedVariant ? (
        <div className="inspector-section">
          <div className="inspector-title">Highlighted variant V{selectedVariant.rank}</div>
          <DefinitionList
            items={[
              { label: "Cases", value: `${formatCount(selectedVariant.caseCount)} (${formatPercent(selectedVariant.casePercent)})` },
              { label: "Avg duration", value: formatDuration(selectedVariant.avgDurationMs) },
              { label: "SLA violation rate", value: formatPercent(selectedVariant.slaViolationRatePercent) },
            ]}
          />
        </div>
      ) : null}
      {bottlenecks && bottlenecks.bottlenecks.length > 0 ? (
        <div className="inspector-section">
          <div className="inspector-title">Top bottlenecks</div>
          {bottlenecks.bottlenecks.slice(0, 6).map((bottleneck) => (
            <BottleneckRow key={transitionKey(bottleneck.fromActivity, bottleneck.toActivity)} bottleneck={bottleneck} onSelect={() => onSelectEdge(transitionKey(bottleneck.fromActivity, bottleneck.toActivity))} />
          ))}
        </div>
      ) : null}
      {rework && rework.loops.length > 0 ? (
        <div className="inspector-section">
          <div className="inspector-title">Rework loops</div>
          {rework.loops.slice(0, 6).map((loop) => (
            <button key={loop.path.join("→")} type="button" className="w-full rounded px-1 py-1.5 text-left text-[11px] hover:bg-muted" onClick={() => onHighlightLoop(loop.path)}>
              <span className="block truncate">{loop.path.join(" → ")}</span>
              <span className="muted mono">
                {formatCount(loop.occurrences)}× · avg {formatDuration(loop.avgLoopDurationMs)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
