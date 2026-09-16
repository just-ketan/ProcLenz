import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { CAPABILITIES, type Capability } from "@/api/capabilities";
import { config } from "@/api/config";
import { usePreferences } from "@/app/preferences";
import { QueryView } from "@/components/feedback/states";
import { ApiCallList } from "@/components/layout/DiagnosticsSheet";
import { DefinitionList, PageHeader, Panel } from "@/components/proclenz/ui";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/domain/format";
import { useCapabilities } from "@/hooks/queries";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · Proclenz" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const capabilities = useCapabilities();
  const queryClient = useQueryClient();
  const { timeDisplay, setTimeDisplay, sla, setSla, processKeys, lastProcessKey } = usePreferences();

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Workspace" title="Settings" description="Backend connection, detected capabilities, preferences and API diagnostics." />
      <div className="two-column">
        <Panel eyebrow="BUILD-TIME ENVIRONMENT" title="Backend connection">
          <div className="panel-body">
            <DefinitionList
              items={[
                { label: "Data source", value: config.useMockData ? "Mock fixtures" : "Live backend" },
                { label: "API base URL", value: config.apiBaseUrl || "same origin", info: "VITE_API_BASE_URL" },
                { label: "Actuator base URL", value: config.actuatorBaseUrl || "/actuator", info: "VITE_ACTUATOR_BASE_URL" },
                { label: "Default process key", value: config.defaultProcessKey, info: "VITE_DEFAULT_PROCESS_KEY" },
                { label: "Request timeout", value: formatDuration(config.requestTimeoutMs), info: "VITE_REQUEST_TIMEOUT_MS" },
              ]}
            />
            <p className="muted mt-3 text-[10px] leading-relaxed">
              These are fixed when the frontend is built: locally in <code>.env.local</code>, on Vercel under Project Settings → Environment Variables (redeploy after changing them).
            </p>
          </div>
        </Panel>
        <Panel
          eyebrow="PROBED ONCE PER SESSION"
          title="Backend capabilities"
          action={
            <Button variant="ghost" size="sm" onClick={() => void queryClient.invalidateQueries({ queryKey: ["capabilities"] })}>
              <RefreshCw />
              Re-check
            </Button>
          }
        >
          <QueryView query={capabilities} loadingLabel="Probing the backend…">
            {(state) => (
              <div className="table-wrap">
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Capability</th>
                      <th>Probe</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(CAPABILITIES) as Capability[]).map((key) => (
                      <tr key={key}>
                        <td>{CAPABILITIES[key].label}</td>
                        <td className="mono-value">{CAPABILITIES[key].probe}</td>
                        <td>{state[key] ? <span className="status-pill healthy">AVAILABLE</span> : <span className="status-pill neutral">NOT YET</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted mt-2 text-[10px]">Probes of endpoints that do not exist yet show up as 404s in the diagnostics list below; that is expected.</p>
              </div>
            )}
          </QueryView>
        </Panel>
      </div>

      <Panel eyebrow="THIS BROWSER" title="Preferences">
        <div className="panel-body form-grid">
          <label className="field">
            <span className="field-label">Time display</span>
            <select value={timeDisplay} onChange={(event) => setTimeDisplay(event.target.value === "utc" ? "utc" : "local")}>
              <option value="local">Local time</option>
              <option value="utc">UTC</option>
            </select>
          </label>
          <div className="field">
            <span className="field-label">SLA threshold for analytics</span>
            <span className="mono-value">{sla ?? "Backend default"}</span>
            {sla ? (
              <button type="button" className="link-button text-left" onClick={() => setSla(undefined)}>
                Reset to backend default
              </button>
            ) : null}
          </div>
          <div className="field">
            <span className="field-label">Known process keys</span>
            <span className="mono-value">{processKeys.join(", ")}</span>
          </div>
          <div className="field">
            <span className="field-label">Last opened process</span>
            <span className="mono-value">{lastProcessKey}</span>
          </div>
        </div>
      </Panel>

      <Panel eyebrow="THIS TAB" title="API diagnostics">
        <div className="panel-body">
          <ApiCallList />
        </div>
      </Panel>
    </div>
  );
}
