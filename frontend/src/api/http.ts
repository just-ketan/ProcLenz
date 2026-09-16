import { apiRequest, type QueryParams, type RequestTarget } from "./client";
import type { ProclenzApi } from "./contract";
import type { PageResponse, ProcessDefinition } from "./types";

const segment = encodeURIComponent;

async function get<T>(path: string, query?: QueryParams, target: RequestTarget = "api"): Promise<T> {
  return (await apiRequest<T>("GET", path, { query, target })).data;
}

const processPath = (processKey: string, view: string) => `/api/v1/processes/${segment(processKey)}/${view}`;

/** Talks to the real Spring Boot backend. Paths and parameters follow the v1 contract exactly. */
export const httpApi: ProclenzApi = {
  getSummary: (processKey, params) => get(processPath(processKey, "summary"), { sla: params?.sla }),
  getVariants: (processKey, params) =>
    get(processPath(processKey, "variants"), { sla: params?.sla, page: params?.page, size: params?.size }),
  getRework: (processKey, params) => get(processPath(processKey, "rework"), { loops: params?.loops }),
  getBottlenecks: (processKey, params) => get(processPath(processKey, "bottlenecks"), { limit: params?.limit }),
  getSla: (processKey, params) =>
    get(processPath(processKey, "sla"), { threshold: params?.threshold, worst: params?.worst }),
  getGraph: (processKey) => get(processPath(processKey, "graph")),
  getInsights: (processKey, params) => get(processPath(processKey, "insights"), { sla: params?.sla }),

  listCases: (processKey, query) =>
    get(processPath(processKey, "cases"), {
      page: query?.page,
      size: query?.size,
      sort: query?.sort,
      direction: query?.direction,
      minDurationMs: query?.minDurationMs,
      variantId: query?.variantId,
    }),
  getCaseTimeline: (processKey, caseId) => get(`/api/v1/cases/${segment(caseId)}/timeline`, { processKey }),

  ingestEvent: async (event) => {
    const response = await apiRequest<import("./types").EventIngestionResult>("POST", "/api/v1/events", { body: event });
    return { httpStatus: response.status, result: response.data, location: response.headers.get("Location") ?? undefined };
  },
  ingestBatch: async (batch) =>
    (await apiRequest<import("./types").BatchIngestionResult>("POST", "/api/v1/events/batch", {
      body: batch.body,
      contentType: batch.contentType,
    })).data,
  getEvent: (eventId) => get(`/api/v1/events/${segment(eventId)}`),

  getHealth: (group) => get(group ? `/health/${group}` : "/health", undefined, "actuator"),
  listMetricNames: async () => (await get<{ names: string[] }>("/metrics", undefined, "actuator")).names,
  getMetric: (name, tags) =>
    get(`/metrics/${segment(name)}`, { tag: Object.entries(tags ?? {}).map(([key, value]) => `${key}:${value}`) }, "actuator"),

  listProcesses: async () => {
    const payload = await get<ProcessDefinition[] | PageResponse<ProcessDefinition>>("/api/v1/processes");
    return Array.isArray(payload) ? payload : payload.content;
  },
  listDatasets: (params) => get("/api/v1/datasets", { page: params?.page, size: params?.size }),
  listMigrations: () => get("/api/v1/migrations"),
};
