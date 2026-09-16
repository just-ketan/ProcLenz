import type { ProclenzApi } from "./contract";

/** Backend features that are designed but not shipped everywhere. The UI adapts instead of assuming. */
export type Capability = "processRegistry" | "datasets" | "migrations" | "healthComponents" | "customMetrics" | "kafkaMetrics";

export type CapabilityState = Record<Capability, boolean>;

export const CAPABILITIES: Record<Capability, { label: string; probe: string }> = {
  processRegistry: { label: "Process registry and SLA configuration", probe: "GET /api/v1/processes" },
  datasets: { label: "Server-side CSV datasets", probe: "GET /api/v1/datasets" },
  migrations: { label: "On-prem to cloud migration jobs", probe: "GET /api/v1/migrations" },
  healthComponents: { label: "Health component statuses", probe: "GET /actuator/health → components" },
  customMetrics: { label: "ProcLenz ingestion and analytics meters", probe: "metric proclenz.events.ingested" },
  kafkaMetrics: { label: "Kafka consumer lag", probe: "metric kafka.consumer.fetch.manager.records.lag.max" },
};

export const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];

async function succeeds(call: () => Promise<unknown>): Promise<boolean> {
  try {
    await call();
    return true;
  } catch {
    return false;
  }
}

async function metricExists(api: ProclenzApi, name: string): Promise<boolean> {
  try {
    return (await api.listMetricNames()).includes(name);
  } catch {
    return false;
  }
}

/** A 404 ROUTE_NOT_FOUND simply means the capability is not available yet. */
export function probeCapability(api: ProclenzApi, capability: Capability): Promise<boolean> {
  switch (capability) {
    case "processRegistry":
      return succeeds(() => api.listProcesses());
    case "datasets":
      return succeeds(() => api.listDatasets({ size: 1 }));
    case "migrations":
      return succeeds(() => api.listMigrations());
    case "healthComponents":
      return api.getHealth().then(
        (health) => Boolean(health.components),
        () => false,
      );
    case "customMetrics":
      return metricExists(api, "proclenz.events.ingested");
    case "kafkaMetrics":
      return metricExists(api, "kafka.consumer.fetch.manager.records.lag.max");
  }
}

/** Probes only the requested capabilities (pages ask for what they need); the rest report false. */
export async function detectCapabilities(api: ProclenzApi, capabilities: readonly Capability[] = ALL_CAPABILITIES): Promise<CapabilityState> {
  const state: CapabilityState = { processRegistry: false, datasets: false, migrations: false, healthComponents: false, customMetrics: false, kafkaMetrics: false };
  const results = await Promise.all(capabilities.map(async (capability) => [capability, await probeCapability(api, capability)] as const));
  for (const [capability, available] of results) state[capability] = available;
  return state;
}
