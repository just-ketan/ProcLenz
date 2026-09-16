import type {
  BatchIngestionResult,
  BottleneckAnalysis,
  CaseListQuery,
  CaseSummaryView,
  CaseTimeline,
  Dataset,
  EventIngestionResult,
  EventRequest,
  EventResponse,
  HealthResponse,
  InsightReport,
  MetricResponse,
  MigrationJob,
  PageResponse,
  ProcessDefinition,
  ProcessGraph,
  ProcessSummary,
  ReworkAnalysis,
  SlaAnalysis,
  VariantAnalysis,
} from "./types";

export interface SingleIngestionResponse {
  httpStatus: number;
  result: EventIngestionResult;
  location: string | undefined;
}

export interface BatchPayload {
  contentType: "application/json" | "application/x-ndjson";
  body: string | Blob;
}

/** Everything the UI can ask of the backend. The HTTP and mock implementations both satisfy it. */
export interface ProclenzApi {
  getSummary(processKey: string, params?: { sla?: string | undefined }): Promise<ProcessSummary>;
  getVariants(processKey: string, params?: { sla?: string | undefined; page?: number | undefined; size?: number | undefined }): Promise<VariantAnalysis>;
  getRework(processKey: string, params?: { loops?: number | undefined }): Promise<ReworkAnalysis>;
  getBottlenecks(processKey: string, params?: { limit?: number | undefined }): Promise<BottleneckAnalysis>;
  getSla(processKey: string, params?: { threshold?: string | undefined; worst?: number | undefined }): Promise<SlaAnalysis>;
  getGraph(processKey: string): Promise<ProcessGraph>;
  getInsights(processKey: string, params?: { sla?: string | undefined }): Promise<InsightReport>;

  listCases(processKey: string, query?: CaseListQuery): Promise<PageResponse<CaseSummaryView>>;
  getCaseTimeline(processKey: string, caseId: string): Promise<CaseTimeline>;

  ingestEvent(event: EventRequest): Promise<SingleIngestionResponse>;
  ingestBatch(batch: BatchPayload): Promise<BatchIngestionResult>;
  getEvent(eventId: string): Promise<EventResponse>;

  getHealth(group?: "liveness" | "readiness"): Promise<HealthResponse>;
  listMetricNames(): Promise<string[]>;
  getMetric(name: string, tags?: Record<string, string>): Promise<MetricResponse>;

  // Planned endpoints: only called when their capability probe succeeds.
  listProcesses(): Promise<ProcessDefinition[]>;
  listDatasets(params?: { page?: number | undefined; size?: number | undefined }): Promise<PageResponse<Dataset>>;
  listMigrations(): Promise<MigrationJob[]>;
}
