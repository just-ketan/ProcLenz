// Converts the backend's ProcessGraph into positioned React Flow elements. Pure and data-driven:
// nothing here knows any activity name, so any process renders.

import * as dagreModule from "@dagrejs/dagre";
import { MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import type { Bottleneck, GraphEdge, GraphNode, ProcessGraph, Severity } from "@/api/types";
import { isRarePath, transitionKey } from "./derived";
import { formatCount, formatDuration, formatPercent } from "./format";

// The package is CommonJS; bundlers expose it either as the namespace or under `default`.
const dagre = (dagreModule as unknown as { default?: typeof dagreModule }).default ?? dagreModule;

export const START_NODE = "__start__";
export const END_NODE = "__end__";

export type GraphMode = "frequency" | "duration";
export type LayoutDirection = "LR" | "TB";

export interface GraphOverlays {
  bottlenecks: boolean;
  rework: boolean;
  deviations: boolean;
}

/** SVG markers cannot resolve CSS variables, so the palette mirrors the design tokens as literal colours. */
export const GRAPH_COLORS = {
  path: "#2f67c4",
  high: "#c4473e",
  medium: "#c27d16",
  rework: "#b7791f",
  rare: "#9a7b1c",
  highlight: "#1d4f9e",
} as const;

export type ProcessNodeData = {
  node: GraphNode;
  mode: GraphMode;
  severity: Severity | undefined;
  skippedPercent: number | undefined;
  showRework: boolean;
  dimmed: boolean;
  direction: LayoutDirection;
};

export type ProcessNodeType = Node<ProcessNodeData, "activity" | "boundary">;

export type ProcessEdgeData = {
  edge: GraphEdge;
  bottleneck: Bottleneck | undefined;
  label: string | undefined;
  color: string;
  width: number;
  dash: string | undefined;
  opacity: number;
};

export type ProcessEdgeType = Edge<ProcessEdgeData, "process">;

export interface BuildGraphOptions {
  mode: GraphMode;
  overlays: GraphOverlays;
  direction: LayoutDirection;
  bottlenecks?: readonly Bottleneck[] | undefined;
  skippedActivities?: ReadonlyMap<string, number> | undefined;
  /** Edge IDs on the most common variant's path; other edges are muted by the deviations overlay. */
  dominantEdges?: ReadonlySet<string> | undefined;
  /** When set, only these edges (and their nodes) stay at full strength. */
  highlightEdges?: ReadonlySet<string> | undefined;
  hiddenActivities?: ReadonlySet<string> | undefined;
  minCasePercent?: number | undefined;
  rarePathPercent?: number | undefined;
  /** Only the most frequent edges get labels, to keep dense graphs readable. */
  maxLabels?: number | undefined;
}

export interface BuiltGraph {
  nodes: ProcessNodeType[];
  edges: ProcessEdgeType[];
  hiddenEdgeCount: number;
}

const ACTIVITY_SIZE = { width: 200, height: 86 };
const BOUNDARY_SIZE = { width: 140, height: 42 };
const SEVERITY_ORDER: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function isBoundaryNode(node: GraphNode): boolean {
  return node.type !== "ACTIVITY";
}

function isBoundaryEdge(edge: GraphEdge): boolean {
  return edge.source === START_NODE || edge.target === END_NODE;
}

function edgeLabel(edge: GraphEdge, mode: GraphMode): string | undefined {
  if (mode === "frequency") {
    return isBoundaryEdge(edge) ? formatCount(edge.count) : `${formatCount(edge.count)} · ${formatPercent(edge.percentOfSourceOutgoing, 0)}`;
  }
  return isBoundaryEdge(edge) ? undefined : formatDuration(edge.avgDurationMs);
}

function nodesOnEdges(edgeIds: ReadonlySet<string>, edges: readonly GraphEdge[]): Set<string> {
  const nodes = new Set<string>();
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) {
      nodes.add(edge.source);
      nodes.add(edge.target);
    }
  }
  return nodes;
}

export function buildProcessGraph(graph: ProcessGraph, options: BuildGraphOptions): BuiltGraph {
  const hidden = options.hiddenActivities ?? new Set<string>();
  const minCasePercent = options.minCasePercent ?? 0;
  const bottleneckByEdge = new Map((options.bottlenecks ?? []).map((bottleneck) => [transitionKey(bottleneck.fromActivity, bottleneck.toActivity), bottleneck]));
  const visibleNodeIds = new Set(graph.nodes.filter((node) => isBoundaryNode(node) || !hidden.has(node.id)).map((node) => node.id));

  const visibleEdges = graph.edges.filter(
    (edge) =>
      visibleNodeIds.has(edge.source) &&
      visibleNodeIds.has(edge.target) &&
      (isBoundaryEdge(edge) || edge.casePercent >= minCasePercent),
  );
  const maxCount = Math.max(1, ...visibleEdges.map((edge) => edge.count));
  const labelled = new Set(
    [...visibleEdges]
      .sort((a, b) => b.count - a.count)
      .slice(0, options.maxLabels ?? visibleEdges.length)
      .map((edge) => edge.id),
  );
  const highlight = options.highlightEdges;
  const highlightNodes = highlight ? nodesOnEdges(highlight, visibleEdges) : undefined;

  const edges: ProcessEdgeType[] = visibleEdges.map((edge) => {
    const bottleneck = bottleneckByEdge.get(edge.id);
    const boundary = isBoundaryEdge(edge);
    let color: string = GRAPH_COLORS.path;
    let dash: string | undefined;
    let opacity = boundary ? 0.45 : 0.8;

    if (options.overlays.deviations && !boundary && isRarePath(edge, options.rarePathPercent ?? 5)) {
      color = GRAPH_COLORS.rare;
      dash = "2 4";
    }
    if (options.overlays.deviations && options.dominantEdges && !options.dominantEdges.has(edge.id)) {
      opacity = Math.min(opacity, 0.4);
    }
    if (options.overlays.rework && edge.reworkEdge) {
      color = GRAPH_COLORS.rework;
      dash = "6 4";
      opacity = 0.95;
    }
    if (options.overlays.bottlenecks && bottleneck && bottleneck.severity !== "LOW") {
      color = bottleneck.severity === "HIGH" ? GRAPH_COLORS.high : GRAPH_COLORS.medium;
      opacity = 1;
    }
    if (highlight) {
      opacity = highlight.has(edge.id) ? 1 : 0.1;
      if (highlight.has(edge.id)) color = GRAPH_COLORS.highlight;
    }

    const showLabel = labelled.has(edge.id) || (options.overlays.bottlenecks && bottleneck !== undefined && bottleneck.severity !== "LOW");
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "process",
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16, markerUnits: "userSpaceOnUse" },
      data: {
        edge,
        bottleneck,
        label: showLabel ? edgeLabel(edge, options.mode) : undefined,
        color,
        width: 1.25 + 6 * Math.sqrt(edge.count / maxCount),
        dash,
        opacity,
      },
    };
  });

  const nodeSeverity = new Map<string, Severity>();
  if (options.overlays.bottlenecks) {
    for (const bottleneck of options.bottlenecks ?? []) {
      if (bottleneck.severity === "LOW") continue;
      const current = nodeSeverity.get(bottleneck.toActivity);
      if (!current || SEVERITY_ORDER[bottleneck.severity] < SEVERITY_ORDER[current]) {
        nodeSeverity.set(bottleneck.toActivity, bottleneck.severity);
      }
    }
  }

  const nodes: ProcessNodeType[] = graph.nodes
    .filter((node) => visibleNodeIds.has(node.id))
    .map((node) => {
      const type: "activity" | "boundary" = isBoundaryNode(node) ? "boundary" : "activity";
      return {
        id: node.id,
        type,
        position: { x: 0, y: 0 },
        data: {
          node,
          mode: options.mode,
          severity: nodeSeverity.get(node.id),
          skippedPercent: options.overlays.deviations ? options.skippedActivities?.get(node.id) : undefined,
          showRework: options.overlays.rework,
          dimmed: highlightNodes ? !highlightNodes.has(node.id) : false,
          direction: options.direction,
        },
      };
    });

  return {
    nodes: layout(nodes, edges, options.direction),
    edges,
    hiddenEdgeCount: graph.edges.length - visibleEdges.length,
  };
}

function nodeSize(node: ProcessNodeType) {
  return node.type === "boundary" ? BOUNDARY_SIZE : ACTIVITY_SIZE;
}

/** Layered layout; `acyclicer: greedy` stops rework cycles from breaking the ranking. */
function layout(nodes: ProcessNodeType[], edges: ProcessEdgeType[], direction: LayoutDirection): ProcessNodeType[] {
  const layoutGraph = new dagre.graphlib.Graph();
  layoutGraph.setGraph({
    rankdir: direction,
    nodesep: direction === "LR" ? 30 : 48,
    ranksep: direction === "LR" ? 84 : 64,
    marginx: 24,
    marginy: 24,
    acyclicer: "greedy",
    ranker: "network-simplex",
  });
  layoutGraph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) layoutGraph.setNode(node.id, { ...nodeSize(node) });
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    // Frequent transitions get more weight so the main path stays straight.
    layoutGraph.setEdge(edge.source, edge.target, { weight: Math.max(1, Math.round(Math.log2((edge.data?.edge.count ?? 0) + 1))) });
  }
  dagre.layout(layoutGraph);

  return nodes.map((node) => {
    const { x, y } = layoutGraph.node(node.id);
    const size = nodeSize(node);
    return {
      ...node,
      position: { x: x - size.width / 2, y: y - size.height / 2 },
      sourcePosition: direction === "LR" ? Position.Right : Position.Bottom,
      targetPosition: direction === "LR" ? Position.Left : Position.Top,
    };
  });
}
