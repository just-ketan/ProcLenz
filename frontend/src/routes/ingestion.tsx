import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, Info, RefreshCw, RotateCcw, Send, Upload } from "lucide-react";
import { api } from "@/api";
import { CAPABILITIES } from "@/api/capabilities";
import type { BatchPayload, SingleIngestionResponse } from "@/api/contract";
import { isApiRequestError } from "@/api/errors";
import type { BatchIngestionResult, EventRequest } from "@/api/types";
import { usePreferences } from "@/app/preferences";
import { CapabilityUnavailable } from "@/components/feedback/states";
import { DefinitionList, InfoTip, PageHeader, Panel, Stat } from "@/components/proclenz/ui";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { csvToNdjson, MAX_CSV_BYTES } from "@/domain/csv";
import { FORMULAS, measurement, sessionThroughput } from "@/domain/derived";
import { formatCount, formatDateTime, formatDecimal, formatDuration } from "@/domain/format";
import { useCapabilities, useMetric } from "@/hooks/queries";

export const Route = createFileRoute("/ingestion")({
  head: () => ({ meta: [{ title: "Ingestion · Proclenz" }] }),
  component: IngestionPage,
});

type Outcome = "COMPLETED" | "PARTIAL" | "INTERRUPTED" | "FAILED";

interface HistoryEntry {
  id: string;
  source: string;
  submittedAt: string;
  outcome: Outcome;
  httpStatus: number;
  result: BatchIngestionResult | undefined;
  interruptedCounts: Record<string, unknown> | undefined;
  message: string | undefined;
}

const HISTORY_KEY = "proclenz.ingestion.history.v1";

function useSessionHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored) as HistoryEntry[]);
    } catch {
      // Session storage unavailable: history lasts until the page is closed.
    }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
    } catch {
      // Ignore quota or privacy-mode failures.
    }
  }, [history]);
  return [history, setHistory] as const;
}

function IngestionPage() {
  const queryClient = useQueryClient();
  const capabilities = useCapabilities(["kafkaMetrics"]);
  const [history, setHistory] = useSessionHistory();

  const record = (entry: Omit<HistoryEntry, "id" | "submittedAt">) => {
    setHistory((current) => [{ ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, submittedAt: new Date().toISOString() }, ...current].slice(0, 50));
    // Newly ingested events change every analytics view; drop cached results.
    void queryClient.invalidateQueries({ queryKey: ["process"] });
  };

  const completedResults = history.flatMap((entry) => (entry.result ? [entry.result] : []));
  const throughput = sessionThroughput(completedResults);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Data"
        title="Ingestion"
        description="Submit events to the live backend. Ingestion is idempotent: resubmitting the same events stores nothing twice."
      />

      <div className="two-column">
        <Panel eyebrow="WRITE PATH" title="Submit events">
          <div className="panel-body">
            <Tabs defaultValue="batch">
              <TabsList>
                <TabsTrigger value="batch">Batch (JSON · NDJSON · CSV)</TabsTrigger>
                <TabsTrigger value="single">Single event</TabsTrigger>
              </TabsList>
              <TabsContent value="batch" className="pt-3">
                <BatchForm onRecorded={record} />
              </TabsContent>
              <TabsContent value="single" className="pt-3">
                <SingleEventForm onIngested={() => void queryClient.invalidateQueries({ queryKey: ["process"] })} />
              </TabsContent>
            </Tabs>
          </div>
        </Panel>

        <div className="page-stack">
          <Panel eyebrow="BACKEND METRICS" title="Ingestion endpoints">
            <div className="panel-body">
              <IngestionMetrics />
            </div>
          </Panel>
          <Panel eyebrow="THIS SESSION" title="Throughput">
            <div className="panel-body">
              <div className="stat-grid">
                <Stat label="Batches" value={formatCount(history.length)} />
                <Stat label="Events received" value={formatCount(completedResults.reduce((sum, result) => sum + result.received, 0))} />
                <Stat label="Events / second" value={throughput === undefined ? "—" : formatCount(Math.round(throughput))} info={FORMULAS.sessionThroughput} />
              </div>
            </div>
          </Panel>
          <Panel eyebrow="ASYNC PIPELINE" title="Streaming ingestion (Kafka)">
            {capabilities.data?.kafkaMetrics ? (
              <div className="panel-body text-[11px]">Kafka consumer metrics are available on this backend.</div>
            ) : (
              <CapabilityUnavailable
                title="Kafka consumer lag and dead-letter queue"
                probe={CAPABILITIES.kafkaMetrics.probe}
                description="Asynchronous ingestion through Kafka is not enabled on this backend, so there is no queue depth or consumer lag to show. Events are written synchronously."
              />
            )}
          </Panel>
        </div>
      </div>

      <Panel
        eyebrow="RECORDED IN THIS BROWSER SESSION"
        title="Batch history"
        action={
          history.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setHistory([])}>
              Clear
            </Button>
          ) : undefined
        }
      >
        {history.length === 0 ? (
          <p className="muted px-5 pb-5 pt-3 text-[11px]">No batches submitted in this session. The backend does not persist batch history yet, so only batches sent from this tab appear here.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Batch ID</th>
                  <th>Source</th>
                  <th className="numeric">Received</th>
                  <th className="numeric">Accepted</th>
                  <th className="numeric">Duplicates</th>
                  <th className="numeric">Conflicts</th>
                  <th className="numeric">Rejected</th>
                  <th className="numeric">Duration</th>
                  <th className="numeric">Events/s</th>
                  <th>Submitted</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id} title={entry.message}>
                    <td className="mono-value">{entry.result ? entry.result.batchId.slice(0, 8) : "—"}</td>
                    <td>{entry.source}</td>
                    <td className="numeric mono-value">{formatCount(entry.result?.received ?? countFrom(entry.interruptedCounts, "received"))}</td>
                    <td className="numeric mono-value">{formatCount(entry.result?.accepted ?? countFrom(entry.interruptedCounts, "accepted"))}</td>
                    <td className="numeric mono-value">{formatCount(entry.result?.duplicates ?? countFrom(entry.interruptedCounts, "duplicates"))}</td>
                    <td className="numeric mono-value">{formatCount(entry.result?.conflicts ?? countFrom(entry.interruptedCounts, "conflicts"))}</td>
                    <td className="numeric mono-value">{formatCount(entry.result?.rejected ?? countFrom(entry.interruptedCounts, "rejected"))}</td>
                    <td className="numeric mono-value">{entry.result ? formatDuration(entry.result.durationMs) : "—"}</td>
                    <td className="numeric mono-value">{entry.result ? formatCount(Math.round(entry.result.eventsPerSecond)) : "—"}</td>
                    <td className="nowrap">{formatDateTime(entry.submittedAt)}</td>
                    <td>
                      <span className={`sla-pill ${entry.outcome === "COMPLETED" ? "sla-good" : entry.outcome === "PARTIAL" ? "sla-risk" : "sla-breach"}`}>{entry.outcome}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function countFrom(counts: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = counts?.[key];
  return typeof value === "number" ? value : undefined;
}

// ---------------------------------------------------------------- batch

type BatchFormat = "ndjson" | "json" | "csv";

const SAMPLES: Record<BatchFormat, string> = {
  ndjson: [
    '{"processKey":"order-to-cash","caseId":"DEMO-1","activity":"Order Created","timestamp":"2026-03-02T09:00:00Z","resource":"web-shop"}',
    '{"processKey":"order-to-cash","caseId":"DEMO-1","activity":"Credit Check","timestamp":"2026-03-02T09:25:00Z","resource":"credit-team"}',
    '{"processKey":"order-to-cash","caseId":"DEMO-1","activity":"Credit Check","timestamp":"2026-03-02T09:25:00Z","resource":"credit-team"}',
    '{"processKey":"order-to-cash","caseId":" ","activity":"Order Approved","timestamp":"2026-03-02T10:00:00Z"}',
    '{"processKey":"order-to-cash","caseId":"DEMO-1","activity":"Order Approved","timestamp":"yesterday"}',
  ].join("\n"),
  json: JSON.stringify(
    [
      { processKey: "order-to-cash", caseId: "DEMO-2", activity: "Order Created", timestamp: "2026-03-03T08:00:00Z", resource: "web-shop" },
      { processKey: "order-to-cash", caseId: "DEMO-2", activity: "Order Approved", timestamp: "2026-03-03T08:40:00Z", resource: "approver-1" },
    ],
    null,
    2,
  ),
  csv: ["event_id,case_id,activity,timestamp,resource", "csv-1,DEMO-3,Order Created,2026-03-04T10:00:00Z,web-shop", "csv-2,DEMO-3,Order Approved,2026-03-04T11:30:00Z,approver-3"].join("\n"),
};

interface Submission {
  payload: BatchPayload;
  source: string;
}

function BatchForm({ onRecorded }: { onRecorded: (entry: Omit<HistoryEntry, "id" | "submittedAt">) => void }) {
  const { lastProcessKey } = usePreferences();
  const [format, setFormat] = useState<BatchFormat>("ndjson");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | undefined>(undefined);
  const [csvProcessKey, setCsvProcessKey] = useState(lastProcessKey);
  const [preparationError, setPreparationError] = useState<string | undefined>(undefined);
  const [lastSubmission, setLastSubmission] = useState<Submission | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (submission: Submission) => api.ingestBatch(submission.payload),
    onSuccess: (result, submission) =>
      onRecorded({
        source: submission.source,
        outcome: result.rejected > 0 || result.conflicts > 0 ? "PARTIAL" : "COMPLETED",
        httpStatus: 200,
        result,
        interruptedCounts: undefined,
        message: undefined,
      }),
    onError: (error, submission) =>
      onRecorded({
        source: submission.source,
        outcome: isApiRequestError(error) && Object.keys(error.details).length > 0 ? "INTERRUPTED" : "FAILED",
        httpStatus: isApiRequestError(error) ? error.status : 0,
        result: undefined,
        interruptedCounts: isApiRequestError(error) ? error.details : undefined,
        message: error.message,
      }),
  });

  const prepare = async (): Promise<Submission> => {
    if (format === "csv") {
      if (file && file.size > MAX_CSV_BYTES) throw new Error(`CSV files are converted in the browser; keep them under ${MAX_CSV_BYTES / 1024 / 1024} MB.`);
      const conversion = csvToNdjson(file ? await file.text() : text, csvProcessKey.trim() || "default");
      return { payload: { contentType: "application/x-ndjson", body: conversion.ndjson }, source: `${file ? file.name : "Pasted CSV"} (${formatCount(conversion.rows)} rows → NDJSON)` };
    }
    return {
      payload: { contentType: format === "json" ? "application/json" : "application/x-ndjson", body: file ?? text },
      source: file ? file.name : `Pasted ${format.toUpperCase()}`,
    };
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPreparationError(undefined);
    try {
      const submission = await prepare();
      setLastSubmission(submission);
      mutation.mutate(submission);
    } catch (error) {
      setPreparationError(error instanceof Error ? error.message : String(error));
    }
  };

  const canSubmit = (file !== undefined || text.trim() !== "") && !mutation.isPending;

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Format</span>
          <select value={format} onChange={(event) => setFormat(event.target.value as BatchFormat)}>
            <option value="ndjson">NDJSON (one event per line)</option>
            <option value="json">JSON array</option>
            <option value="csv">CSV (converted to NDJSON in the browser)</option>
          </select>
        </label>
        {format === "csv" ? (
          <label className="field">
            <span className="field-label">Process key for CSV rows</span>
            <input value={csvProcessKey} onChange={(event) => setCsvProcessKey(event.target.value)} />
          </label>
        ) : null}
        <label className="field">
          <span className="field-label">File (optional)</span>
          <input type="file" accept={format === "csv" ? ".csv,text/csv" : format === "json" ? ".json,application/json" : ".ndjson,.jsonl,.txt"} onChange={(event) => setFile(event.target.files?.[0] ?? undefined)} className="pt-1" />
        </label>
      </div>
      {!file ? (
        <label className="field">
          <span className="field-label flex items-center justify-between">
            Payload
            <button type="button" className="link-button" onClick={() => setText(SAMPLES[format])}>
              Insert sample
            </button>
          </span>
          <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={format === "csv" ? "event_id,case_id,activity,timestamp,resource" : '{"processKey":"order-to-cash","caseId":"ORD-1","activity":"Order Created","timestamp":"2026-09-15T09:00:00Z"}'} spellCheck={false} />
          {format === "ndjson" ? <span className="field-hint">The NDJSON sample includes a duplicate, a blank case ID and an invalid timestamp, to show per-item rejection.</span> : null}
        </label>
      ) : (
        <p className="text-[11px]">
          Sending <strong>{file.name}</strong> ({formatCount(Math.ceil(file.size / 1024))} KB).{" "}
          <button type="button" className="link-button" onClick={() => setFile(undefined)}>
            Remove
          </button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {mutation.isPending ? <RefreshCw className="spin" /> : <Upload />}
          {mutation.isPending ? "Ingesting…" : "Ingest batch"}
        </Button>
        {lastSubmission && !mutation.isPending ? (
          <Button type="button" size="sm" variant="outline" onClick={() => mutation.mutate(lastSubmission)} title="Send exactly the same payload again">
            <RotateCcw />
            Resubmit same batch
          </Button>
        ) : null}
      </div>
      {preparationError ? (
        <div className="result-banner danger">
          <AlertTriangle />
          <div>
            <strong>Could not prepare the batch</strong>
            <p>{preparationError}</p>
          </div>
        </div>
      ) : null}
      {mutation.isSuccess ? <BatchResultView result={mutation.data} /> : null}
      {mutation.isError ? <BatchErrorView error={mutation.error} /> : null}
    </form>
  );
}

function BatchResultView({ result }: { result: BatchIngestionResult }) {
  const tone = result.rejected > 0 || result.conflicts > 0 ? "warning" : "good";
  return (
    <div className="flex flex-col gap-3">
      <div className={`result-banner ${tone}`}>
        {tone === "good" ? <CheckCircle2 /> : <AlertTriangle />}
        <div>
          <strong>
            Batch {result.batchId.slice(0, 8)} processed in {formatDuration(result.durationMs)}
          </strong>
          <p>
            {formatCount(result.received)} received = {formatCount(result.accepted)} accepted + {formatCount(result.duplicates)} duplicates + {formatCount(result.conflicts)} conflicts + {formatCount(result.rejected)} rejected.
            {result.accepted === 0 && result.duplicates > 0 ? " Nothing new was stored: every valid event already existed (idempotent replay)." : ""}
          </p>
        </div>
      </div>
      <div className="stat-grid">
        <Stat label="Accepted" value={formatCount(result.accepted)} tone="good" />
        <Stat label="Duplicates" value={formatCount(result.duplicates)} hint="Already stored; skipped" />
        <Stat label="Conflicts" value={formatCount(result.conflicts)} hint="Reused event ID, different content" tone={result.conflicts ? "warning" : undefined} />
        <Stat label="Rejected" value={formatCount(result.rejected)} tone={result.rejected ? "danger" : undefined} />
        <Stat label="Events / second" value={formatCount(Math.round(result.eventsPerSecond))} />
      </div>
      {result.rejections.length > 0 ? (
        <div className="overflow-x-auto rounded border">
          <table className="mini-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Code</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {result.rejections.map((rejection) => (
                <tr key={`${rejection.index}-${rejection.code}`}>
                  <td className="mono-value">#{rejection.index + 1}</td>
                  <td>
                    <span className="chip chip-danger">{rejection.code}</span>
                  </td>
                  <td>{rejection.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.rejectionsTruncated ? <p className="muted p-2 text-[10px]">Only the first rejections are listed; the counts above are complete.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function BatchErrorView({ error }: { error: Error }) {
  const apiError = isApiRequestError(error) ? error : undefined;
  const interrupted = apiError && Object.keys(apiError.details).length > 0;
  return (
    <div className="result-banner danger">
      <AlertTriangle />
      <div>
        <strong>{interrupted ? "Batch interrupted" : "Batch rejected"}</strong>
        <p>{error.message}</p>
        {interrupted ? (
          <p>
            {formatCount(countFrom(apiError.details, "accepted"))} events were stored before the problem. Fix the payload and resubmit the whole batch: stored events will come back as duplicates.
          </p>
        ) : null}
        {apiError?.status === 503 && apiError.retryAfterSeconds !== undefined ? <p>The backend suggests retrying after {apiError.retryAfterSeconds}s.</p> : null}
        {apiError?.traceId ? <p className="mono-value">Trace ID {apiError.traceId}</p> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- single event

type EventField = "eventId" | "processKey" | "caseId" | "activity" | "timestamp" | "resource";
type EventForm = Record<EventField, string>;

const DAY_MS = 86_400_000;

function validateEvent(form: EventForm): Partial<Record<EventField, string>> {
  const errors: Partial<Record<EventField, string>> = {};
  if (!form.caseId.trim()) errors.caseId = "must not be blank";
  else if (form.caseId.length > 200) errors.caseId = "at most 200 characters";
  if (!form.activity.trim()) errors.activity = "must not be blank";
  else if (form.activity.length > 200) errors.activity = "at most 200 characters";
  const timestamp = form.timestamp.trim();
  if (!timestamp) errors.timestamp = "is required";
  else if (Number.isNaN(Date.parse(timestamp)) || !/(Z|[+-]\d{2}:?\d{2})$/i.test(timestamp)) errors.timestamp = "must be an ISO-8601 instant with a zone, e.g. 2026-09-15T09:00:00Z";
  else if (Date.parse(timestamp) > Date.now() + DAY_MS) errors.timestamp = "must not be more than 24h in the future";
  if (form.processKey && !/^[A-Za-z0-9._-]{0,100}$/.test(form.processKey)) errors.processKey = "letters, digits, '.', '_' or '-' only";
  if (form.eventId.length > 200) errors.eventId = "at most 200 characters";
  if (form.resource.length > 200) errors.resource = "at most 200 characters";
  return errors;
}

function blankToUndefined(value: string): string | undefined {
  return value.trim() === "" ? undefined : value.trim();
}

function SingleEventForm({ onIngested }: { onIngested: () => void }) {
  const { lastProcessKey } = usePreferences();
  const [form, setForm] = useState<EventForm>(() => ({
    eventId: "",
    processKey: lastProcessKey,
    caseId: "",
    activity: "",
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    resource: "",
  }));
  const [showErrors, setShowErrors] = useState(false);
  const errors = validateEvent(form);
  const mutation = useMutation({ mutationFn: (event: EventRequest) => api.ingestEvent(event), onSuccess: onIngested });

  const set = (field: EventField) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    mutation.mutate({
      eventId: blankToUndefined(form.eventId),
      processKey: blankToUndefined(form.processKey),
      caseId: form.caseId.trim(),
      activity: form.activity.trim(),
      timestamp: form.timestamp.trim(),
      resource: blankToUndefined(form.resource),
    });
  };

  const field = (name: EventField, label: string, placeholder: string, hint?: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input value={form[name]} onChange={set(name)} placeholder={placeholder} aria-invalid={showErrors && errors[name] !== undefined} />
      {showErrors && errors[name] ? <span className="field-error">{errors[name]}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );

  return (
    <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
      <div className="form-grid">
        {field("processKey", "Process key", "default", "Defaults to “default” when empty")}
        {field("caseId", "Case ID *", "ORD-1001")}
        {field("activity", "Activity *", "Order Created")}
        {field("timestamp", "Timestamp *", "2026-09-15T09:00:00Z", "ISO-8601 instant with a zone")}
        {field("resource", "Resource", "web-shop")}
        {field("eventId", "Producer event ID", "evt-123", "Optional; becomes the idempotency key")}
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? <RefreshCw className="spin" /> : <Send />}
          Submit event
        </Button>
        <span className="muted inline-flex items-center gap-1 text-[10px]">
          <Info className="h-3 w-3" /> Submit twice to see duplicate protection.
        </span>
      </div>
      {mutation.isSuccess ? <SingleResult response={mutation.data} /> : null}
      {mutation.isError ? <SingleError error={mutation.error} /> : null}
    </form>
  );
}

function SingleResult({ response }: { response: SingleIngestionResponse }) {
  const created = response.result.status === "ACCEPTED";
  return (
    <div className={`result-banner ${created ? "good" : "info"}`}>
      {created ? <CheckCircle2 /> : <Copy />}
      <div>
        <strong>
          {created ? "201 Created: event stored" : "200 OK: duplicate, nothing stored"}
        </strong>
        <p>
          {created ? "The event was persisted. " : "An identical event already exists; the original event is returned. "}
          {response.result.eventId ? (
            <Link to="/events/$eventId" params={{ eventId: response.result.eventId }} className="link">
              View event {response.result.eventId.slice(0, 8)}
            </Link>
          ) : null}
        </p>
        <p className="mono-value">identity {response.result.eventIdentity.slice(0, 16)}…</p>
      </div>
    </div>
  );
}

function SingleError({ error }: { error: Error }) {
  const apiError = isApiRequestError(error) ? error : undefined;
  const conflict = apiError?.code === "EVENT_ID_CONFLICT";
  return (
    <div className={`result-banner ${conflict ? "warning" : "danger"}`}>
      <AlertTriangle />
      <div>
        <strong>{apiError ? `${apiError.status || ""} ${apiError.code}` : "Request failed"}</strong>
        <p>{error.message}</p>
        {conflict ? <p>The producer reused an event ID for different content. The stored event was kept; fix the producer rather than retrying.</p> : null}
        {apiError?.fieldErrors.length ? (
          <ul className="field-error-list">
            {apiError.fieldErrors.map((fieldError) => (
              <li key={`${fieldError.field}-${fieldError.message}`}>
                <code>{fieldError.field}</code> {fieldError.message}
              </li>
            ))}
          </ul>
        ) : null}
        {apiError?.traceId ? <p className="mono-value">Trace ID {apiError.traceId}</p> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- metrics

function IngestionMetrics() {
  const batch = useMetric("http.server.requests", { uri: "/api/v1/events/batch" }, { refetchInterval: 15_000 });
  const single = useMetric("http.server.requests", { uri: "/api/v1/events" }, { refetchInterval: 15_000 });

  const rows = [
    { label: "POST /api/v1/events/batch", query: batch },
    { label: "POST /api/v1/events", query: single },
  ];
  return (
    <>
      <table className="mini-table">
        <thead>
          <tr>
            <th>Endpoint</th>
            <th className="numeric">Requests</th>
            <th className="numeric">
              <span className="inline-flex items-center gap-1">
                Mean
                <InfoTip text="Total request time ÷ request count since the backend started." />
              </span>
            </th>
            <th className="numeric">Max</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, query }) => {
            const count = measurement(query.data, "COUNT");
            const total = measurement(query.data, "TOTAL_TIME");
            const max = measurement(query.data, "MAX");
            const notRecorded = query.isError && isApiRequestError(query.error) && query.error.status === 404;
            return (
              <tr key={label}>
                <td className="mono-value">{label}</td>
                {query.isPending ? (
                  <td colSpan={3} className="numeric muted">
                    …
                  </td>
                ) : notRecorded ? (
                  <td colSpan={3} className="numeric muted">
                    No requests since backend start
                  </td>
                ) : query.isError ? (
                  <td colSpan={3} className="numeric muted" title={query.error.message}>
                    Metrics unavailable
                  </td>
                ) : (
                  <>
                    <td className="numeric mono-value">{formatCount(count)}</td>
                    <td className="numeric mono-value">{count && total !== undefined ? formatDuration((total / count) * 1_000) : "—"}</td>
                    <td className="numeric mono-value">{max !== undefined ? formatDuration(max * 1_000) : "—"}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted mt-2 text-[10px]">
        From Spring Boot Actuator <code>http.server.requests</code>, all outcomes, refreshed every 15s. Max covers the recent window only. See <Link to="/health" className="link">System Health</Link> for rates.
      </p>
    </>
  );
}
