import { useSyncExternalStore } from "react";
import { config, describeBackend } from "@/api/config";
import { getApiCalls, getServerApiCalls, subscribeToApiCalls } from "@/api/diagnostics";
import { CopyButton } from "@/components/proclenz/ui";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

function useApiCalls() {
  return useSyncExternalStore(subscribeToApiCalls, getApiCalls, getServerApiCalls);
}

function displayPath(url: string): string {
  try {
    const parsed = new URL(url, typeof window === "undefined" ? "http://localhost" : window.location.origin);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function ApiCallList() {
  const calls = useApiCalls();
  if (calls.length === 0) return <p className="muted">No API calls recorded in this tab yet.</p>;
  return (
    <div className="diagnostics-list">
      {calls.map((call) => (
        <div key={call.id} className="diagnostics-row" title={`${call.at} · ${call.correlationId}`}>
          <span className={call.status >= 200 && call.status < 400 ? "status-code-ok" : "status-code-error"}>{call.status || call.code}</span>
          <span className="mono">{call.method}</span>
          <code>{displayPath(call.url)}</code>
          <span className="inline-form mono">
            {call.durationMs}ms
            <CopyButton value={call.correlationId} label="Copy correlation ID" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function DiagnosticsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle>API diagnostics</SheetTitle>
          <SheetDescription>
            Last 50 calls from this tab. Every request sends an <code>X-Correlation-Id</code>; search the backend logs for it to follow a request end to end.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 mb-4 text-xs text-muted-foreground">
          Mode: <strong className="text-foreground">{config.useMockData ? "mock data" : "live backend"}</strong> · API: <code>{describeBackend()}</code> · Actuator:{" "}
          <code>{config.actuatorBaseUrl || "/actuator"}</code>
        </div>
        <ApiCallList />
      </SheetContent>
    </Sheet>
  );
}
