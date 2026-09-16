import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock3, Database, Inbox, Lock, RefreshCw, SearchX, WifiOff } from "lucide-react";
import { isApiRequestError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/proclenz/ui";
import { cn } from "@/lib/utils";

export function LoadingState({ label = "Loading…", rows = 4, className }: { label?: string | undefined; rows?: number | undefined; className?: string | undefined }) {
  return (
    <div className={cn("loading-state", className)} role="status" aria-live="polite">
      <div className="loading-label">
        <RefreshCw className="spin" />
        {label}
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}

interface ErrorPresentation {
  title: string;
  icon: ReactNode;
  tone: "danger" | "info";
}

function present(code: string | undefined): ErrorPresentation {
  switch (code) {
    case "NETWORK_ERROR":
      return { title: "Backend unreachable", icon: <WifiOff />, tone: "danger" };
    case "TIMEOUT":
      return { title: "The request timed out", icon: <Clock3 />, tone: "danger" };
    case "SERVICE_UNAVAILABLE":
      return { title: "Temporarily unavailable", icon: <Clock3 />, tone: "danger" };
    case "CASE_NOT_FOUND":
    case "EVENT_NOT_FOUND":
    case "ROUTE_NOT_FOUND":
      return { title: "Not found", icon: <SearchX />, tone: "info" };
    case "VALIDATION_FAILED":
    case "MALFORMED_REQUEST":
      return { title: "The request was rejected", icon: <AlertTriangle />, tone: "danger" };
    case "INTERNAL_ERROR":
      return { title: "Unexpected server error", icon: <AlertTriangle />, tone: "danger" };
    case "UNEXPECTED_RESPONSE":
      return { title: "Unexpected response from the backend", icon: <AlertTriangle />, tone: "danger" };
    default:
      return { title: "Something went wrong", icon: <AlertTriangle />, tone: "danger" };
  }
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: (() => void) | undefined; className?: string | undefined }) {
  const apiError = isApiRequestError(error) ? error : undefined;

  if (apiError?.code === "PROCESS_NOT_FOUND") {
    return (
      <EmptyState
        className={className}
        icon={<Database />}
        title="No events ingested for this process yet"
        description={apiError.message}
        action={
          <Button asChild size="sm">
            <Link to="/ingestion">Ingest events</Link>
          </Button>
        }
      />
    );
  }

  const presentation = present(apiError?.code);
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className={cn("state-block", className)} role="alert">
      <span className={cn("state-icon", presentation.tone)}>{presentation.icon}</span>
      <strong>{presentation.title}</strong>
      <span className="state-message">{message}</span>
      {apiError?.fieldErrors.length ? (
        <ul className="field-error-list">
          {apiError.fieldErrors.map((fieldError) => (
            <li key={`${fieldError.field}-${fieldError.message}`}>
              <code>{fieldError.field}</code> {fieldError.message}
            </li>
          ))}
        </ul>
      ) : null}
      {apiError?.traceId ? (
        <span className="trace-row">
          Trace ID <code className="trace-chip">{apiError.traceId}</code>
          <CopyButton value={apiError.traceId} label="Copy trace ID" />
        </span>
      ) : null}
      {apiError?.status === 503 ? <span className="state-hint">Retrying automatically…</span> : null}
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode | undefined;
  action?: ReactNode | undefined;
  icon?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn("state-block", className)}>
      <span className="state-icon info">{icon ?? <Inbox />}</span>
      <strong>{title}</strong>
      {description ? <span className="state-message">{description}</span> : null}
      {action}
    </div>
  );
}

export function CapabilityUnavailable({
  title,
  description,
  probe,
  action,
}: {
  title: string;
  description: ReactNode;
  probe: string;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="state-block capability-block">
      <span className="state-icon neutral">
        <Lock />
      </span>
      <strong>{title}</strong>
      <span className="state-message">{description}</span>
      <span className="state-hint">
        Not available on this backend yet (<code>{probe}</code> is not exposed). It will light up automatically when the backend ships it.
      </span>
      {action}
    </div>
  );
}

/** Renders loading, error or data for one query, so pages never forget a state. */
export function QueryView<T>({
  query,
  loadingLabel,
  rows,
  children,
}: {
  query: UseQueryResult<T>;
  loadingLabel?: string | undefined;
  rows?: number | undefined;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <LoadingState label={loadingLabel} rows={rows} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <>{children(query.data)}</>;
}
