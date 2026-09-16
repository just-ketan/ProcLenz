import { config } from "@/api/config";
import { useHealth } from "@/hooks/queries";

/** Live backend reachability from the actuator health poll. */
export function ConnectionIndicator() {
  const health = useHealth();

  if (config.useMockData) {
    return (
      <div className="connected-state" title="VITE_USE_MOCK_DATA is on: screens show bundled fixtures">
        <span className="status-dot status-mock" />
        Mock data
      </div>
    );
  }
  if (health.isPending) {
    return (
      <div className="connected-state">
        <span className="status-dot status-unknown" />
        Checking backend…
      </div>
    );
  }
  if (health.isError) {
    return (
      <div className="connected-state" title={health.error.message}>
        <span className="status-dot status-down" />
        Backend unreachable
      </div>
    );
  }
  const up = health.data.health.status === "UP";
  return (
    <div className="connected-state" title="Actuator health, refreshed every 30 seconds">
      <span className={`status-dot ${up ? "" : "status-degraded"}`} />
      {up ? "Connected" : `Backend ${health.data.health.status}`}
      <span className="mono">{health.data.latencyMs}ms</span>
    </div>
  );
}
