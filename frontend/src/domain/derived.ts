// The only numbers the frontend derives itself. Each is a simple, documented formula over backend data;
// the UI shows the formula next to the value. Raw events are never aggregated in the browser.

import type { Bottleneck, BatchIngestionResult, GraphEdge, MetricResponse, Variant } from "@/api/types";

export type CaseSlaStatus = "BREACHED" | "AT_RISK" | "ON_TRACK";

export const AT_RISK_RATIO = 0.8;

export const FORMULAS = {
  compliance: "Compliant cases ÷ total cases. A case complies when its duration is at most the SLA threshold.",
  caseSlaStatus: "Breached: duration > threshold. At risk: duration ≥ 80% of threshold. On track: otherwise.",
  atRisk: "Cases lasting at least 80% of the threshold (case list filter) minus cases over the threshold.",
  margin: "SLA threshold − average case duration. Negative means the average case is over the SLA.",
  activeBottlenecks: "Transitions ranked by the backend with severity HIGH or MEDIUM (waiting-time share ≥ 10%).",
  abnormalWait: "The wait before this event is longer than the p95 wait of the same transition across all cases.",
  deviation: "Compared with the most common variant: missing activities are in that variant but not here; unexpected ones are here but not there.",
  rarePath: "Transition taken by fewer cases than the rare-path threshold.",
  requestRate: "Change in request count between two polls ÷ seconds between the polls.",
  meanLatency: "Change in total request time ÷ change in request count between two polls.",
  errorRate: "Change in server-error (5xx) requests ÷ change in all requests between two polls.",
  sessionThroughput: "Events received ÷ total processing time, over batches submitted in this browser session.",
  arrivalDelay: "Ingested at − event timestamp: how late the event reached ProcLenz.",
  variantsCovering: "Smallest number of top variants whose cumulative case share reaches 80%.",
} as const;

export function caseSlaStatus(durationMs: number, thresholdMs: number): CaseSlaStatus {
  if (durationMs > thresholdMs) return "BREACHED";
  return durationMs >= AT_RISK_RATIO * thresholdMs ? "AT_RISK" : "ON_TRACK";
}

export function compliancePercent(compliantCases: number, totalCases: number): number {
  return totalCases === 0 ? 100 : (compliantCases / totalCases) * 100;
}

/** minDurationMs for the case-list query whose total, minus breaches, is the at-risk count. */
export function atRiskMinDurationMs(thresholdMs: number): number {
  return Math.ceil(AT_RISK_RATIO * thresholdMs);
}

/** minDurationMs selecting exactly the breached cases (duration strictly greater than the threshold). */
export function breachedMinDurationMs(thresholdMs: number): number {
  return thresholdMs + 1;
}

export function slaMarginMs(thresholdMs: number, avgDurationMs: number): number {
  return thresholdMs - avgDurationMs;
}

export function activeBottleneckCount(bottlenecks: readonly Bottleneck[]): number {
  return bottlenecks.filter((bottleneck) => bottleneck.severity !== "LOW").length;
}

export function transitionKey(from: string, to: string): string {
  return `${from}->${to}`;
}

export function isAbnormalWait(waitMs: number, transitionP95Ms: number | undefined): boolean {
  return transitionP95Ms !== undefined && transitionP95Ms > 0 && waitMs > transitionP95Ms;
}

export function compareWithDominant(activities: readonly string[], dominant: readonly string[]): { missing: string[]; unexpected: string[] } {
  const present = new Set(activities);
  const expected = new Set(dominant);
  return {
    missing: [...expected].filter((activity) => !present.has(activity)),
    unexpected: [...present].filter((activity) => !expected.has(activity)),
  };
}

export function variantsContainingTransition(variants: readonly Variant[], from: string, to: string): Variant[] {
  return variants.filter((variant) =>
    variant.activities.some((activity, index) => activity === from && variant.activities[index + 1] === to),
  );
}

export function variantsCovering(variants: readonly Variant[], percent = 80): number | undefined {
  return variants.find((variant) => variant.cumulativeCasePercent >= percent)?.rank;
}

export function isRarePath(edge: GraphEdge, thresholdPercent: number): boolean {
  return edge.casePercent < thresholdPercent;
}

/** Edge IDs along a variant's path, including the synthetic start and end transitions. */
export function variantPathEdges(activities: readonly string[]): Set<string> {
  const path = ["__start__", ...activities, "__end__"];
  const edges = new Set<string>();
  for (let index = 1; index < path.length; index++) {
    edges.add(transitionKey(path[index - 1] as string, path[index] as string));
  }
  return edges;
}

export function measurement(metric: MetricResponse | undefined, statistic: string): number | undefined {
  return metric?.measurements.find((entry) => entry.statistic === statistic)?.value;
}

export interface RequestSample {
  at: number;
  count: number;
  totalTimeSeconds: number;
  serverErrors: number;
}

export interface RequestRates {
  requestsPerSecond: number;
  meanLatencyMs: number | undefined;
  errorRatePercent: number | undefined;
}

export function requestRates(previous: RequestSample, current: RequestSample): RequestRates | undefined {
  const seconds = (current.at - previous.at) / 1_000;
  const requests = current.count - previous.count;
  if (seconds <= 0 || requests < 0) return undefined;
  return {
    requestsPerSecond: requests / seconds,
    meanLatencyMs: requests > 0 ? ((current.totalTimeSeconds - previous.totalTimeSeconds) / requests) * 1_000 : undefined,
    errorRatePercent: requests > 0 ? ((current.serverErrors - previous.serverErrors) / requests) * 100 : undefined,
  };
}

export function sessionThroughput(batches: readonly Pick<BatchIngestionResult, "received" | "durationMs">[]): number | undefined {
  const received = batches.reduce((sum, batch) => sum + batch.received, 0);
  const durationMs = batches.reduce((sum, batch) => sum + batch.durationMs, 0);
  return durationMs > 0 ? (received / durationMs) * 1_000 : undefined;
}

export function arrivalDelayMs(timestamp: string, ingestedAt: string): number {
  return new Date(ingestedAt).getTime() - new Date(timestamp).getTime();
}
