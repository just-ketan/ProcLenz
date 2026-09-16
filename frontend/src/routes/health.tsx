import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, YAxis } from "recharts";
import { isApiRequestError } from "@/api/errors";
import type { HealthResponse } from "@/api/types";
import { config } from "@/api/config";
import { InfoTip, PageHeader, Panel, Stat } from "@/components/proclenz/ui";
import { FORMULAS, measurement, requestRates, type RequestSample } from "@/domain/derived";
import { formatCount, formatDecimal, formatDuration, formatPercent } from "@/domain/format";
import { useHealth, useMetric } from "@/hooks/queries";

export const Route = createFileRoute("/health")({
  head: () => ({ meta: [{ title: "System Health · Proclenz" }] }),
  component: HealthPage,
});

const POLL_MS = 15_000;
const MB = 1024 * 1024;

type Tone = "healthy" | "degraded" | "unavailable" | "neutral";

function toneFor(status: string | undefined): Tone {
  if (status === "UP") return "healthy";
  if (status === "DOWN" || status === "OUT_OF_SERVICE") return "unavailable";
  return "neutral";
}

const TONE_LABEL: Record<Tone, string> = { healthy: "HEALTHY", degraded: "DEGRADED", unavailable: "UNAVAILABLE", neutral: "NOT REPORTED" };

function HealthPage() {
  const overall = useHealth(undefined, POLL_MS);
  const liveness = useHealth("liveness", POLL_MS);
  const readiness = useHealth("readiness", POLL_MS);
  const poll = { refetchInterval: POLL_MS };
  const requests = useMetric("http.server.requests", undefined, poll);
  const serverErrors = useMetric("http.server.requests", { outcome: "SERVER_ERROR" }, poll);
  const poolActive = useMetric("hikaricp.connections.active", undefined, poll);
  const poolIdle = useMetric("hikaricp.connections.idle", undefined, poll);
  const poolPending = useMetric("hikaricp.connections.pending", undefined, poll);
  const poolMax = useMetric("hikaricp.connections.max", undefined, poll);
  const heapUsed = useMetric("jvm.memory.used", { area: "heap" }, poll);
  const heapMax = useMetric("jvm.memory.max", { area: "heap" }, poll);
  const cpu = useMetric("process.cpu.usage", undefined, poll);
  const uptime = useMetric("process.uptime", undefined, poll);
  const threads = useMetric("jvm.threads.live", undefined, poll);

  const [samples, setSamples] = useState<RequestSample[]>([]);
  useEffect(() => {
    if (!requests.data) return;
    const sample: RequestSample = {
      at: requests.dataUpdatedAt,
      count: measurement(requests.data, "COUNT") ?? 0,
      totalTimeSeconds: measurement(requests.data, "TOTAL_TIME") ?? 0,
      // A 404 means no 5xx has ever been recorded, which is zero, not unknown.
      serverErrors: serverErrors.data ? (measurement(serverErrors.data, "COUNT") ?? 0) : 0,
    };
    setSamples((current) => [...current, sample].slice(-40));
  }, [requests.data, requests.dataUpdatedAt, serverErrors.data]);

  const rateSeries = samples.slice(1).flatMap((sample, index) => {
    const previous = samples[index];
    const rates = previous ? requestRates(previous, sample) : undefined;
    return rates ? [{ at: sample.at, rps: rates.requestsPerSecond, latency: rates.meanLatencyMs ?? 0, errors: rates.errorRatePercent ?? 0 }] : [];
  });
  const latest = rateSeries[rateSeries.length - 1];
  const pending = measurement(poolPending.data, "VALUE") ?? 0;
  const readinessStatus = readiness.data?.health.status;
  const components: HealthResponse["components"] = overall.data?.health.components;

  let overallTone: Tone = overall.isError ? "unavailable" : toneFor(overall.data?.health.status);
  const degradedReasons: string[] = [];
  if (overallTone === "healthy") {
    if (readinessStatus && readinessStatus !== "UP") degradedReasons.push(`readiness is ${readinessStatus}`);
    if (latest?.errors !== undefined && latest.errors > 5) degradedReasons.push(`server error rate ${formatPercent(latest.errors)}`);
    if (pending > 0) degradedReasons.push(`${formatCount(pending)} threads waiting for a database connection`);
    if (degradedReasons.length > 0) overallTone = "degraded";
  }

  const services: { name: string; tone: Tone; detail: string }[] = [
    {
      name: "API",
      tone: overall.isError ? "unavailable" : overall.data ? "healthy" : "neutral",
      detail: overall.isError ? overall.error.message : overall.data ? `Reachable · health check ${overall.data.latencyMs}ms` : "Checking…",
    },
    {
      name: "Database (PostgreSQL)",
      tone: components?.["db"] ? toneFor(components["db"].status) : "neutral",
      detail: components?.["db"] ? `Health component ${components["db"].status}` : "Not reported by /actuator/health; see connection pool metrics below",
    },
    {
      name: "Disk",
      tone: components?.["diskSpace"] ? toneFor(components["diskSpace"].status) : "neutral",
      detail: components?.["diskSpace"] ? `Health component ${components["diskSpace"].status}` : "Not reported",
    },
    {
      name: "Event processor",
      tone: overall.isError ? "unavailable" : overall.data ? "healthy" : "neutral",
      detail: "In-process in the modular monolith: follows API status",
    },
    {
      name: "Analytics engine",
      tone: overall.isError ? "unavailable" : overall.data ? "healthy" : "neutral",
      detail: "In-process in the modular monolith: follows API status",
    },
    { name: "Cache (Redis)", tone: components?.["redis"] ? toneFor(components["redis"].status) : "neutral", detail: components?.["redis"] ? `Health component ${components["redis"].status}` : "Not configured on this backend" },
    { name: "Message queue (Kafka)", tone: components?.["kafka"] ? toneFor(components["kafka"].status) : "neutral", detail: components?.["kafka"] ? `Health component ${components["kafka"].status}` : "Not configured on this backend" },
  ];

  const heapUsedBytes = measurement(heapUsed.data, "VALUE");
  const heapMaxBytes = measurement(heapMax.data, "VALUE");

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operate"
        title="System Health"
        description={`Live status from Spring Boot Actuator at ${config.actuatorBaseUrl || "/actuator"}, polled every ${POLL_MS / 1000} seconds.`}
      />

      <div className={`result-banner ${overallTone === "healthy" ? "good" : overallTone === "degraded" ? "warning" : overallTone === "unavailable" ? "danger" : "info"}`}>
        <span className={`status-dot ${overallTone === "healthy" ? "" : overallTone === "degraded" ? "status-degraded" : overallTone === "unavailable" ? "status-down" : "status-unknown"}`} />
        <div>
          <strong>
            {overallTone === "healthy" ? "All reported components healthy" : overallTone === "degraded" ? "Degraded" : overallTone === "unavailable" ? "Backend unavailable" : "Checking…"}
          </strong>
          <p>
            {overall.isError
              ? overall.error.message
              : degradedReasons.length
                ? `Up, but ${degradedReasons.join("; ")}.`
                : `Liveness ${liveness.data?.health.status ?? "…"} · readiness ${readinessStatus ?? "…"} · uptime ${formatDuration((measurement(uptime.data, "VALUE") ?? 0) * 1_000)}`}
          </p>
        </div>
      </div>

      <Panel eyebrow="SERVICES" title="Components">
        <div className="panel-body">
          <div className="health-grid">
            {services.map((service) => (
              <div key={service.name} className="health-card">
                <div className="health-card-head">
                  <strong>{service.name}</strong>
                  <span className={`status-pill ${service.tone}`}>{TONE_LABEL[service.tone]}</span>
                </div>
                <p>{service.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel eyebrow="TRAFFIC" title="HTTP requests">
        <div className="panel-body flex flex-col gap-4">
          <div className="stat-grid">
            <Stat label="Request rate" value={latest ? `${formatDecimal(latest.rps, 2)}/s` : "…"} hint="Between the last two polls" info={FORMULAS.requestRate} />
            <Stat label="Mean latency" value={latest?.latency ? formatDuration(latest.latency) : "—"} hint="Requests in the last interval" info={FORMULAS.meanLatency} />
            <Stat label="Max latency" value={formatDuration((measurement(requests.data, "MAX") ?? 0) * 1_000)} hint="Recent window (Micrometer MAX)" />
            <Stat
              label="Server error rate"
              value={latest?.errors !== undefined ? formatPercent(latest.errors) : "…"}
              hint={`${formatCount(serverErrors.data ? measurement(serverErrors.data, "COUNT") : 0)} 5xx since start`}
              tone={latest && latest.errors > 5 ? "danger" : undefined}
              info={FORMULAS.errorRate}
            />
            <Stat label="Requests since start" value={formatCount(measurement(requests.data, "COUNT"))} />
          </div>
          {rateSeries.length < 2 ? (
            <p className="muted text-[11px]">Collecting samples: trends appear after a few polls. {requests.isError && !(isApiRequestError(requests.error) && requests.error.status === 404) ? requests.error.message : ""}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <Sparkline title="Requests / s" data={rateSeries} dataKey="rps" format={(value) => `${formatDecimal(value, 2)}/s`} />
              <Sparkline title="Mean latency" data={rateSeries} dataKey="latency" format={(value) => formatDuration(value)} />
              <Sparkline title="Server error rate" data={rateSeries} dataKey="errors" format={(value) => formatPercent(value)} color="#c4473e" />
            </div>
          )}
        </div>
      </Panel>

      <div className="two-column">
        <Panel eyebrow="DATABASE" title="Connection pool (HikariCP)">
          <div className="panel-body">
            <div className="stat-grid">
              <Stat label="Active" value={formatCount(measurement(poolActive.data, "VALUE"))} />
              <Stat label="Idle" value={formatCount(measurement(poolIdle.data, "VALUE"))} />
              <Stat label="Pending" value={formatCount(measurement(poolPending.data, "VALUE"))} hint="Threads waiting for a connection" tone={pending > 0 ? "warning" : undefined} />
              <Stat label="Max" value={formatCount(measurement(poolMax.data, "VALUE"))} />
            </div>
          </div>
        </Panel>
        <Panel eyebrow="RUNTIME" title="JVM">
          <div className="panel-body">
            <div className="stat-grid">
              <Stat
                label="Heap used"
                value={heapUsedBytes !== undefined ? `${formatCount(Math.round(heapUsedBytes / MB))} MB` : "…"}
                hint={heapMaxBytes !== undefined && heapMaxBytes > 0 ? `of ${formatCount(Math.round(heapMaxBytes / MB))} MB` : undefined}
              />
              <Stat label="Process CPU" value={formatPercent((measurement(cpu.data, "VALUE") ?? 0) * 100)} />
              <Stat label="Live threads" value={formatCount(measurement(threads.data, "VALUE"))} />
              <Stat
                label="Uptime"
                value={formatDuration((measurement(uptime.data, "VALUE") ?? 0) * 1_000)}
                hint={
                  <span className="inline-flex items-center gap-1">
                    since last restart <InfoTip text="process.uptime from Micrometer" />
                  </span>
                }
              />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Sparkline({
  title,
  data,
  dataKey,
  format,
  color = "#2f67c4",
}: {
  title: string;
  data: Record<string, number>[];
  dataKey: string;
  format: (value: number) => string;
  color?: string | undefined;
}) {
  return (
    <div className="rounded border p-3">
      <div className="stat-label">{title}</div>
      <div className="sparkline">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <YAxis hide domain={[0, "auto"]} />
            <ChartTooltip formatter={(value) => [format(Number(value)), title]} labelFormatter={() => ""} />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.6} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
