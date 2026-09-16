import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/api";
import { ALL_CAPABILITIES, detectCapabilities, type Capability } from "@/api/capabilities";
import type { CaseListQuery } from "@/api/types";

/**
 * Every analytics call re-mines the whole process on the backend (there is no server cache yet), so
 * results are reused for a minute and never polled.
 */
const ANALYTICS_STALE_MS = 60_000;

export function useProcessSummary(processKey: string, sla: string | undefined) {
  return useQuery({
    queryKey: ["process", processKey, "summary", sla ?? null],
    queryFn: () => api.getSummary(processKey, { sla }),
    staleTime: ANALYTICS_STALE_MS,
  });
}

export function useProcessGraph(processKey: string, enabled = true) {
  return useQuery({
    queryKey: ["process", processKey, "graph"],
    queryFn: () => api.getGraph(processKey),
    staleTime: ANALYTICS_STALE_MS,
    enabled,
  });
}

export function useVariants(processKey: string, params: { sla: string | undefined; page: number; size: number }, enabled = true) {
  return useQuery({
    queryKey: ["process", processKey, "variants", params.sla ?? null, params.page, params.size],
    queryFn: () => api.getVariants(processKey, params),
    staleTime: ANALYTICS_STALE_MS,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useRework(processKey: string, loops = 20, enabled = true) {
  return useQuery({
    queryKey: ["process", processKey, "rework", loops],
    queryFn: () => api.getRework(processKey, { loops }),
    staleTime: ANALYTICS_STALE_MS,
    enabled,
  });
}

export const BOTTLENECK_LIMIT = 100;

export function useBottlenecks(processKey: string, limit = BOTTLENECK_LIMIT, enabled = true) {
  return useQuery({
    queryKey: ["process", processKey, "bottlenecks", limit],
    queryFn: () => api.getBottlenecks(processKey, { limit }),
    staleTime: ANALYTICS_STALE_MS,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useSlaAnalysis(processKey: string, threshold: string | undefined, worst: number) {
  return useQuery({
    queryKey: ["process", processKey, "sla", threshold ?? null, worst],
    queryFn: () => api.getSla(processKey, { threshold, worst }),
    staleTime: ANALYTICS_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useInsights(processKey: string, sla: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["process", processKey, "insights", sla ?? null],
    queryFn: () => api.getInsights(processKey, { sla }),
    staleTime: ANALYTICS_STALE_MS,
    enabled,
  });
}

export function useCases(processKey: string, query: CaseListQuery, enabled = true) {
  return useQuery({
    queryKey: ["process", processKey, "cases", query],
    queryFn: () => api.listCases(processKey, query),
    staleTime: ANALYTICS_STALE_MS,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCaseTimeline(processKey: string, caseId: string) {
  return useQuery({
    queryKey: ["process", processKey, "timeline", caseId],
    queryFn: () => api.getCaseTimeline(processKey, caseId),
    staleTime: ANALYTICS_STALE_MS,
  });
}

export function useEvent(eventId: string) {
  return useQuery({ queryKey: ["event", eventId], queryFn: () => api.getEvent(eventId), staleTime: Infinity });
}

export function useHealth(group?: "liveness" | "readiness", refetchInterval = 30_000) {
  return useQuery({
    queryKey: ["actuator", "health", group ?? "overall"],
    queryFn: async () => {
      const startedAt = performance.now();
      const health = await api.getHealth(group);
      return { health, latencyMs: Math.round(performance.now() - startedAt), checkedAt: Date.now() };
    },
    refetchInterval,
    retry: false,
  });
}

export function useMetric(name: string, tags?: Record<string, string>, options: { refetchInterval?: number; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["actuator", "metric", name, tags ?? {}],
    queryFn: () => api.getMetric(name, tags),
    refetchInterval: options.refetchInterval ?? false,
    enabled: options.enabled ?? true,
    retry: false,
  });
}

/** Probes endpoints that may not exist yet, so only ask for the capabilities a page actually needs. */
export function useCapabilities(only: readonly Capability[] = ALL_CAPABILITIES) {
  return useQuery({
    queryKey: ["capabilities", ...only],
    queryFn: () => detectCapabilities(api, only),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
