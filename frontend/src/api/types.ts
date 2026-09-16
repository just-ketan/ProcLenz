// Contract types for the ProcLenz backend API v1. Each interface mirrors a Java response record
// field by field; keep them in sync with the backend (see docs/frontend-lovable-prompt.md).

// ---------- shared ----------
export type Severity = "HIGH" | "MEDIUM" | "LOW";
export type SlaSource = "REQUEST" | "PROCESS" | "DEFAULT";

export interface PageResponse<T> {
  content: T[];
  /** Zero-based. */
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiError {
  timestamp: string;
  status: number;
  code: string;
  message: string;
  path: string;
  traceId?: string;
  fieldErrors?: ApiFieldError[];
  details?: Record<string, unknown>;
}

// ---------- events ----------
export interface EventRequest {
  eventId?: string | undefined;
  processKey?: string | undefined;
  caseId: string;
  activity: string;
  timestamp: string;
  resource?: string | undefined;
}

export interface EventIngestionResult {
  /** For a duplicate: the ID of the event stored originally. */
  eventId: string | null;
  /** A reused producer ID arrives as an HTTP 409 error, never as a status here. */
  status: "ACCEPTED" | "DUPLICATE";
  eventIdentity: string;
}

export interface BatchRejection {
  /** Zero-based position of the item in the submitted batch. */
  index: number;
  code: string;
  message: string;
}

export interface BatchIngestionResult {
  batchId: string;
  received: number;
  accepted: number;
  duplicates: number;
  conflicts: number;
  rejected: number;
  durationMs: number;
  eventsPerSecond: number;
  rejections: BatchRejection[];
  rejectionsTruncated: boolean;
}

export interface EventResponse {
  eventId: string;
  processKey: string;
  caseId: string;
  activity: string;
  timestamp: string;
  resource: string | null;
  sourceEventId: string | null;
  eventIdentity: string;
  ingestedAt: string;
}

// ---------- cases ----------
export interface CaseSummaryView {
  caseId: string;
  eventCount: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  variantId: string;
}

export type CaseSortField = "durationMs" | "startedAt" | "caseId" | "eventCount";

export interface CaseListQuery {
  page?: number | undefined;
  size?: number | undefined;
  sort?: CaseSortField | undefined;
  direction?: "asc" | "desc" | undefined;
  minDurationMs?: number | undefined;
  variantId?: string | undefined;
}

export interface CaseTimelineEvent {
  sequence: number;
  eventId: string;
  activity: string;
  timestamp: string;
  resource: string | null;
  /** Waiting time since the previous event of the case (0 for the first event). */
  deltaFromPreviousMs: number;
  /** Time since the first event of the case. */
  elapsedMs: number;
  /** The activity already occurred earlier in this case. */
  rework: boolean;
}

export interface CaseTimeline {
  processKey: string;
  caseId: string;
  variantId: string;
  eventCount: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  reworkActivities: string[];
  events: CaseTimelineEvent[];
}

// ---------- analytics ----------
export interface ProcessSummary {
  processKey: string;
  caseCount: number;
  eventCount: number;
  activityCount: number;
  variantCount: number;
  firstEventAt: string;
  lastEventAt: string;
  avgEventsPerCase: number;
  avgCaseDurationMs: number;
  medianCaseDurationMs: number;
  p95CaseDurationMs: number;
  maxCaseDurationMs: number;
  topVariantCasePercent: number;
  casesWithRework: number;
  reworkRatePercent: number;
  sla: {
    thresholdMs: number;
    /** ISO-8601 in hour form (P7D arrives as "PT168H"); display from thresholdMs. */
    threshold: string;
    source: SlaSource;
    violatingCases: number;
    violationRatePercent: number;
  };
}

export interface Variant {
  rank: number;
  variantId: string;
  activities: string[];
  sequence: string;
  activityCount: number;
  containsRework: boolean;
  caseCount: number;
  casePercent: number;
  cumulativeCasePercent: number;
  avgDurationMs: number;
  medianDurationMs: number;
  p95DurationMs: number;
  slaViolations: number;
  slaViolationRatePercent: number;
}

export interface VariantAnalysis {
  processKey: string;
  totalCases: number;
  totalVariants: number;
  slaThresholdMs: number;
  page: number;
  size: number;
  totalPages: number;
  variants: Variant[];
}

export interface ActivityRework {
  activity: string;
  affectedCases: number;
  affectedCasePercent: number;
  repeatOccurrences: number;
  avgRepeatsPerAffectedCase: number;
  totalReworkTimeMs: number;
  avgReworkTimePerAffectedCaseMs: number;
}

export interface ReworkLoop {
  activity: string;
  path: string[];
  occurrences: number;
  avgLoopDurationMs: number;
  p95LoopDurationMs: number;
}

export interface ReworkAnalysis {
  processKey: string;
  totalCases: number;
  casesWithRework: number;
  reworkRatePercent: number;
  totalRepeatOccurrences: number;
  totalReworkTimeMs: number;
  activities: ActivityRework[];
  loops: ReworkLoop[];
}

/** A bottleneck is a transition between two activities, never a single activity. */
export interface Bottleneck {
  rank: number;
  fromActivity: string;
  toActivity: string;
  /** 0–100; the highest-impact transition scores 100. */
  score: number;
  severity: Severity;
  transitionCount: number;
  caseCount: number;
  caseCoveragePercent: number;
  avgWaitMs: number;
  medianWaitMs: number;
  p95WaitMs: number;
  totalWaitMs: number;
  waitSharePercent: number;
  /** 1 − median/p95. */
  tailVolatility: number;
}

export interface BottleneckAnalysis {
  processKey: string;
  scoringModel: string;
  totalWaitingTimeMs: number;
  transitionsAnalyzed: number;
  bottlenecks: Bottleneck[];
}

export interface SlaViolation {
  caseId: string;
  variantId: string;
  durationMs: number;
  overByMs: number;
  overByPercent: number;
}

export interface VariantCompliance {
  variantId: string;
  activities: string[];
  cases: number;
  violations: number;
  violationRatePercent: number;
}

export interface SlaAnalysis {
  processKey: string;
  thresholdMs: number;
  threshold: string;
  thresholdSource: SlaSource;
  totalCases: number;
  compliantCases: number;
  violatingCases: number;
  violationRatePercent: number;
  avgDurationMs: number;
  p95DurationMs: number;
  worstViolations: SlaViolation[];
  variantsByViolations: VariantCompliance[];
}

export type GraphNodeType = "START" | "ACTIVITY" | "END";

export interface GraphNode {
  /** Activity name; "__start__" and "__end__" for the boundary nodes. */
  id: string;
  label: string;
  type: GraphNodeType;
  frequency: number;
  caseCount: number;
  caseCoveragePercent: number;
  /** Average waiting time before this activity. */
  avgTimeToActivityMs: number;
  repeatOccurrences: number;
}

export interface GraphEdge {
  /** `${source}->${target}` */
  id: string;
  source: string;
  target: string;
  count: number;
  caseCount: number;
  percentOfSourceOutgoing: number;
  casePercent: number;
  avgDurationMs: number;
  medianDurationMs: number;
  p95DurationMs: number;
  reworkCount: number;
  reworkEdge: boolean;
}

export interface ProcessGraph {
  processKey: string;
  caseCount: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type InsightType = "BOTTLENECK" | "SLA_RISK" | "REWORK_HOTSPOT" | "SKIPPED_ACTIVITY" | "VARIANT_FRAGMENTATION";

export interface ProcessInsight {
  type: InsightType;
  severity: Severity;
  title: string;
  detail: string;
  evidence: Record<string, string | number | null>;
}

export interface InsightReport {
  processKey: string;
  caseCount: number;
  slaThresholdMs: number;
  insights: ProcessInsight[];
}

// ---------- actuator ----------
export type HealthStatus = "UP" | "DOWN" | "OUT_OF_SERVICE" | "UNKNOWN" | (string & {});

export interface HealthComponent {
  status: HealthStatus;
  details?: Record<string, unknown>;
  components?: Record<string, HealthComponent>;
}

export interface HealthResponse {
  status: HealthStatus;
  groups?: string[];
  components?: Record<string, HealthComponent>;
}

export interface MetricResponse {
  name: string;
  description?: string;
  baseUnit?: string;
  measurements: { statistic: string; value: number }[];
  availableTags: { tag: string; values: string[] }[];
}

// ---------- planned (capability-gated; shapes are provisional) ----------
export interface ProcessDefinition {
  processKey: string;
  displayName: string | null;
  slaThresholdMs: number | null;
  eventCount: number;
  caseCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
}

export type DatasetStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "INTERRUPTED";

export interface Dataset {
  id: string;
  name: string;
  processKey: string;
  status: DatasetStatus;
  rowsRead: number;
  acceptedEvents: number;
  duplicateEvents: number;
  invalidRows: number;
  startedAt: string | null;
  durationMs: number | null;
}

export interface MigrationJob {
  migrationId: string;
  sourceDataset: string;
  targetDataset: string;
  status: string;
  recordsExtracted: number;
  recordsTransferred: number;
  recordsValidated: number;
  failures: number;
  startedAt: string | null;
  completedAt: string | null;
}
