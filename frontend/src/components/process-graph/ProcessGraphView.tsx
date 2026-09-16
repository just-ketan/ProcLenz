import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  getNodesBounds,
  useNodesInitialized,
  useReactFlow,
  type EdgeProps,
  type NodeProps,
} from "@xyflow/react";
import { AlertTriangle, CheckCircle2, Play } from "lucide-react";
import type { ProcessGraph } from "@/api/types";
import { buildProcessGraph, type BuildGraphOptions, type ProcessEdgeType, type ProcessNodeType } from "@/domain/graph";
import { formatCount, formatDuration, formatPercent } from "@/domain/format";
import { cn } from "@/lib/utils";

/** Below this zoom node text is unreadable, so the view anchors on the start of the process instead of fitting everything. */
const MIN_READABLE_ZOOM = 0.6;
const FIT_PADDING = 24;

function ActivityNode({ data, selected }: NodeProps<ProcessNodeType>) {
  const { node, mode, severity, skippedPercent, showRework, dimmed, direction } = data;
  const vertical = direction === "TB";
  return (
    <div
      className={cn(
        "graph-node",
        severity && `graph-node-${severity.toLowerCase()}`,
        selected && "graph-node-selected",
        dimmed && "graph-node-dimmed",
      )}
    >
      <Handle type="target" position={vertical ? Position.Top : Position.Left} className="graph-handle" isConnectable={false} />
      <div className="graph-node-head">
        <strong title={node.label}>{node.label}</strong>
        {severity ? (
          <span className="graph-node-flag" title={`${severity} bottleneck into this activity`}>
            <AlertTriangle />
          </span>
        ) : null}
      </div>
      <div className="graph-node-line">
        {formatCount(node.frequency)} executions · {formatPercent(node.caseCoveragePercent)} of cases
      </div>
      <div className="graph-node-line">
        {mode === "duration"
          ? `avg wait before: ${node.avgTimeToActivityMs > 0 ? formatDuration(node.avgTimeToActivityMs) : "—"}`
          : `${formatCount(node.caseCount)} cases`}
      </div>
      {(showRework && node.repeatOccurrences > 0) || skippedPercent !== undefined ? (
        <div className="graph-node-badges">
          {showRework && node.repeatOccurrences > 0 ? <span className="chip chip-rework">↻ {formatCount(node.repeatOccurrences)} repeats</span> : null}
          {skippedPercent !== undefined ? <span className="chip chip-warning">skipped {formatPercent(skippedPercent)}</span> : null}
        </div>
      ) : null}
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} className="graph-handle" isConnectable={false} />
    </div>
  );
}

function BoundaryNode({ data, selected }: NodeProps<ProcessNodeType>) {
  const { node, dimmed, direction } = data;
  const start = node.type === "START";
  const vertical = direction === "TB";
  return (
    <div className={cn("graph-boundary", start ? "graph-boundary-start" : "graph-boundary-end", selected && "graph-node-selected", dimmed && "graph-node-dimmed")}>
      {start ? null : <Handle type="target" position={vertical ? Position.Top : Position.Left} className="graph-handle" isConnectable={false} />}
      {start ? <Play /> : <CheckCircle2 />}
      <span>
        {start ? "Start" : "End"} · {formatCount(node.caseCount)} cases
      </span>
      {start ? <Handle type="source" position={vertical ? Position.Bottom : Position.Right} className="graph-handle" isConnectable={false} /> : null}
    </div>
  );
}

function selfLoopPath(sourceX: number, sourceY: number, targetX: number, targetY: number): [string, number, number] {
  const top = Math.min(sourceY, targetY) - 76;
  return [`M ${sourceX} ${sourceY} C ${sourceX + 70} ${top}, ${targetX - 70} ${top}, ${targetX} ${targetY}`, (sourceX + targetX) / 2, top + 20];
}

function ProcessEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected }: EdgeProps<ProcessEdgeType>) {
  if (!data) return null;
  const [path, labelX, labelY] =
    data.edge.source === data.edge.target
      ? selfLoopPath(sourceX, sourceY, targetX, targetY)
      : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        {...(markerEnd ? { markerEnd } : {})}
        interactionWidth={18}
        style={{
          stroke: data.color,
          strokeWidth: selected ? data.width + 2 : data.width,
          opacity: data.opacity,
          ...(data.dash ? { strokeDasharray: data.dash } : {}),
        }}
      />
      {data.label ? (
        <EdgeLabelRenderer>
          <div
            className={cn("graph-edge-label", selected && "graph-edge-label-selected")}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, opacity: Math.max(data.opacity, 0.3) }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const nodeTypes = { activity: ActivityNode, boundary: BoundaryNode };
const edgeTypes = { process: ProcessEdge };

export interface ProcessGraphViewProps {
  graph: ProcessGraph;
  options: BuildGraphOptions;
  height: number | string;
  selectedNodeId?: string | undefined;
  selectedEdgeId?: string | undefined;
  onSelectNode?: ((nodeId: string | undefined) => void) | undefined;
  onSelectEdge?: ((edgeId: string | undefined) => void) | undefined;
  showMinimap?: boolean | undefined;
  onHiddenEdgeCount?: ((count: number) => void) | undefined;
}

export function ProcessGraphView(props: ProcessGraphViewProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvas({ graph, options, height, selectedNodeId, selectedEdgeId, onSelectNode, onSelectEdge, showMinimap, onHiddenEdgeCount }: ProcessGraphViewProps) {
  const { fitView, getNodes, setViewport } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const containerRef = useRef<HTMLDivElement>(null);
  const built = useMemo(() => buildProcessGraph(graph, options), [graph, options]);
  const nodes = useMemo(() => built.nodes.map((node) => ({ ...node, selected: node.id === selectedNodeId })), [built, selectedNodeId]);
  const edges = useMemo(() => built.edges.map((edge) => ({ ...edge, selected: edge.id === selectedEdgeId })), [built, selectedEdgeId]);

  useEffect(() => {
    onHiddenEdgeCount?.(built.hiddenEdgeCount);
  }, [built, onHiddenEdgeCount]);

  // Re-frame when the layout changes: fit everything if it stays readable, otherwise start at the process entry.
  useEffect(() => {
    const container = containerRef.current;
    if (!nodesInitialized || !container) return;
    const frame = requestAnimationFrame(() => {
      const bounds = getNodesBounds(getNodes());
      const width = container.clientWidth;
      const containerHeight = container.clientHeight;
      if (bounds.width === 0 || bounds.height === 0) return;
      const fitZoom = Math.min((width - 2 * FIT_PADDING) / bounds.width, (containerHeight - 2 * FIT_PADDING) / bounds.height);
      if (fitZoom >= MIN_READABLE_ZOOM) {
        void fitView({ padding: 0.1, maxZoom: 1.1, duration: 200 });
        return;
      }
      const zoom = MIN_READABLE_ZOOM;
      const leftToRight = options.direction === "LR";
      void setViewport(
        {
          zoom,
          x: leftToRight ? FIT_PADDING - bounds.x * zoom : (width - bounds.width * zoom) / 2 - bounds.x * zoom,
          y: leftToRight ? (containerHeight - bounds.height * zoom) / 2 - bounds.y * zoom : FIT_PADDING - bounds.y * zoom,
        },
        { duration: 200 },
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [built, nodesInitialized, fitView, getNodes, setViewport, options.direction]);

  return (
    <div
      ref={containerRef}
      className="graph-canvas"
      style={{ height }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onSelectNode?.(undefined);
          onSelectEdge?.(undefined);
        }
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) => {
          onSelectEdge?.(undefined);
          onSelectNode?.(node.id);
        }}
        onEdgeClick={(_, edge) => {
          onSelectNode?.(undefined);
          onSelectEdge?.(edge.id);
        }}
        onPaneClick={() => {
          onSelectNode?.(undefined);
          onSelectEdge?.(undefined);
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={0.1}
        maxZoom={2.5}
      >
        <Background gap={24} color="#dfe5ee" />
        <Controls showInteractive={false} position="bottom-right" />
        {showMinimap ? <MiniMap pannable zoomable position="bottom-left" nodeColor="#c9d4e4" maskColor="rgba(240, 243, 248, 0.6)" /> : null}
      </ReactFlow>
      <div className="graph-hint">Scroll to zoom · drag to pan · fit with ⤢</div>
    </div>
  );
}
