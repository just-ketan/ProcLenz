# PROCLENZ — Frontend Build Prompt

Enterprise Process Intelligence Platform · aligned with the ProcLenz backend API v1

> Paste everything below the line into Lovable. Keep this file in sync with the backend whenever an
> endpoint or response record changes.

---

Build a production-quality frontend for **Proclenz**, an enterprise process-intelligence platform.

## 0. READ FIRST — SCOPE AND CONTRACT RULES

This is a **frontend-only** project, deployed to **Vercel**. The backend is a separate Java 21 + Spring
Boot + PostgreSQL service that already exists.

- Do **not** create a backend, database, authentication server, API routes, serverless functions, or any
  process-mining implementation. The browser displays results that the backend computes. The only
  numbers the frontend may compute itself are the derived metrics listed in **§6**.
- The API contract in **§4 and §5** is authoritative. It was written from the running backend. Every
  endpoint is labelled:
  - **AVAILABLE**: exists today. It must work with `VITE_USE_MOCK_DATA=false`.
  - **PLANNED**: designed but not shipped. Build the UI behind a capability flag (§5.4). It is mock-only
    until the backend releases it, and it must degrade gracefully when the endpoint returns 404.
- **Never call endpoints that are not listed.** These common guesses do **not** exist:
  `/api/v1/analytics/*`, `/api/v1/processes/{id}/metrics`, `GET /api/v1/cases`,
  `GET /api/v1/cases/{caseId}`, `/api/v1/ingestion/batches`, `/api/v1/health`. Health lives at Spring
  Boot Actuator: `/actuator/health`.
- All requests go through one API layer (§10). Components never call `fetch`.

## 1. PRODUCT CONCEPT

Proclenz ingests business event logs and reconstructs how processes actually execute. Each event has:

| Field | Meaning |
|---|---|
| `eventId` | Optional producer-assigned ID; when present it is the idempotency key |
| `processKey` | Process the event belongs to, e.g. `order-to-cash` |
| `caseId` | The business case, e.g. an order number |
| `activity` | What happened, e.g. `Order Approved` |
| `timestamp` | When it happened (ISO-8601 instant) |
| `resource` | Optional: who or what performed it |

Worked example. This exact case is verified by backend tests; reuse it in mock data:

```
Case ORD-1001 (process order-to-cash)
09:00  Order Created
09:14  Order Approved        wait 14m
10:30  Inventory Checked     wait 1h 16m
10:42  Rework Required       wait 12m
11:05  Inventory Checked     wait 23m   ← rework (activity repeated)
11:20  Order Shipped         wait 15m
Backend returns durationMs = 8400000 (2h 20m), reworkActivities = ["Inventory Checked"]
```

**Critical semantic.** Events carry a single completion timestamp, with no start/complete lifecycle. The
backend therefore measures **waiting time between consecutive events**, not activity execution time.
Never display "activity processing time" or "activity duration". Use "waiting time before activity" or
"transition time", and explain it in a tooltip.

What the backend computes, per process:

- Case reconstruction and case timelines
- Activity frequency and case coverage
- Directly-follows transitions: count, percentage, average/median/p95 waiting time
- Process variants: stable IDs, share, cumulative Pareto share, duration statistics, SLA violation rate
- Rework: repeated activities, concrete loops, time lost
- Bottlenecks: transitions scored by share of total waiting time, adjusted for long-tail delays
- Case-duration SLA compliance with worst offenders and breaches by variant
- A frontend-ready process graph
- Deterministic rule-based insights with evidence

What the backend does **not** provide. Do not show or fake any of these:

- Period-over-period change percentages
- Time series and trends
- Date-range filtering
- Per-activity SLA
- Activity execution time
- Case open/closed status
- Resource analytics
- Daily throughput
- An activity catalogue (so no "unknown activity" errors)
- Free-text case search
- Persisted ingestion batch history
- Any "AI score"

The visual story must be visible throughout the UX, using real counts:

```
EVENT LOG → CASE RECONSTRUCTION → PROCESS MODEL → VARIANTS → PERFORMANCE
          → BOTTLENECKS · REWORK · DEVIATIONS · SLA → OPERATIONAL INSIGHTS
```

## 2. DESIGN DIRECTION

A serious enterprise analytics product, inspired by observability and process-mining tools. It is not a
marketing site or a consumer dashboard.

- **Typography:** Inter or IBM Plex Sans for UI. JetBrains Mono or IBM Plex Mono for IDs, timestamps and
  numbers, with `font-variant-numeric: tabular-nums`. 13–14px base size; a clear hierarchy.
- **Colour:** neutral slate surfaces and one restrained accent. Severity colours are reserved for
  `HIGH` / `MEDIUM` / `LOW` and SLA states. Colour is never the only signal; pair it with a label or icon.
- **Surfaces:** 1px subtle borders, 4–6px radius, minimal shadows, dense but well-spaced tables.
- **Themes:** light and dark via CSS variables (shadcn tokens), plus a system default.
- **Responsive:** desktop-first (≥ 1280px), fully usable at 1024px. On tablet and phone, pages are
  read-only: the sidebar collapses to a drawer, tables scroll horizontally, and the graph opens fit-to-view.
- **Avoid:** gradients, hero sections, glassmorphism, oversized rounded cards, AI chat, stock imagery,
  emoji-as-icons, and decorative charts without business meaning.

The product must immediately communicate: *this system understands how an enterprise process actually executes.*

## 3. TECHNOLOGY AND PROJECT STRUCTURE

- Vite + React 18 + TypeScript (`strict: true`)
- Tailwind CSS + shadcn/ui, with lucide-react icons
- React Router. Put process, SLA, filters, pagination and selection in the URL so every view is a shareable deep link.
- TanStack Query for all server state. No Redux/Zustand. Component state stays local; user preferences go in `localStorage`.
- `@xyflow/react` (React Flow) with `dagre` for layered graph layout
- Recharts for charts, date-fns for dates
- Vitest for the pure modules (`src/domain/*`, API error parsing, mock handlers)

```
src/
  api/
    config.ts            reads import.meta.env (the only place that does)
    client.ts            fetch wrapper: base URL, headers, timeout, errors, diagnostics
    errors.ts            ApiRequestError, error-code helpers
    types.ts             backend contract types (§5.2), mirrored exactly
    capabilities.ts      capability registry and detection (§5.4)
    index.ts             ProclenzApi interface; exports http or mock implementation
    http/                processes.ts analytics.ts cases.ts events.ts datasets.ts actuator.ts
    mock/                index.ts handlers/*.ts fixtures/**/*.json
  domain/
    format.ts            durations, numbers, percentages, timestamps, ISO durations
    derived.ts           every client-derived metric from §6, each with a doc comment
    graph.ts             ProcessGraph → React Flow elements, layout, overlays (pure)
  hooks/                 one TanStack Query hook per API call (useProcessSummary, useProcessGraph, …)
  components/
    layout/  process-graph/  charts/  tables/  kpi/  timeline/  feedback/  ingestion/
  pages/
    Overview ProcessExplorer Cases CaseTimeline Bottlenecks Rework Variants Sla
    Processes Datasets DatasetDetail Ingestion Health Settings EventDetail Migrations
  routes.tsx
```

### Environment

```
VITE_API_BASE_URL=            # e.g. https://api.proclenz.example ; empty = same origin (Vercel rewrite)
VITE_ACTUATOR_BASE_URL=       # optional; defaults to `${VITE_API_BASE_URL}/actuator`
VITE_USE_MOCK_DATA=true       # true: mock implementation; false: real backend
VITE_DEFAULT_PROCESS_KEY=order-to-cash
VITE_REQUEST_TIMEOUT_MS=30000 # analytics can take seconds on large processes
```

Provide `.env.example`. Vite only exposes variables prefixed `VITE_`, so the mock switch is
`VITE_USE_MOCK_DATA`. Never hardcode backend URLs in components.

### Vercel

`vercel.json` must include an SPA fallback. Document two integration options in the README:

1. **CORS:** set `VITE_API_BASE_URL` to the backend origin. The backend must allow the Vercel origin and
   expose the headers `X-Correlation-Id, Location, ETag, Retry-After`.
2. **Proxy:** leave `VITE_API_BASE_URL` empty and use rewrites (placeholder domain):

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://YOUR-BACKEND-HOST/api/:path*" },
    { "source": "/actuator/:path*", "destination": "https://YOUR-BACKEND-HOST/actuator/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

`npm run build` must pass `tsc --noEmit` and `vite build` with zero errors.

## 4. BACKEND CONTRACT — CONVENTIONS

**Base paths.** REST lives under `${VITE_API_BASE_URL}/api/v1`; actuator lives under `${VITE_ACTUATOR_BASE_URL}`.

**Process identity.** A process is identified by `processKey` (`[A-Za-z0-9._-]`, max 100 chars), not by a
numeric ID. All analytics are scoped to one process: `/api/v1/processes/{processKey}/...`. Events sent
without a `processKey` belong to `default`.

**Units and formats.**

- Durations are integer milliseconds; fields end in `Ms`.
- Percentages are numbers from 0 to 100, rounded to 2 decimals; fields end in `Percent`. `tailVolatility` is a 0–1 ratio.
- Timestamps are ISO-8601 UTC strings, e.g. `2026-09-01T09:00:00Z`.
- SLA request parameters are ISO-8601 durations (`PT8H`, `P2D`). The backend echoes threshold strings in
  hour form (`P7D` comes back as `"PT168H"`), so always **display SLA thresholds from `thresholdMs`**.

**Pagination.** Pages are zero-based and `size` ≤ 200. Case lists use the `PageResponse` envelope;
variants carry their own page fields.

**Path encoding.** `caseId` may contain any character, so always `encodeURIComponent` it in paths.

**Headers.**

- Send `Accept: application/json` and `X-Correlation-Id: pl-<uuid>` on every request. The ID must match
  `[A-Za-z0-9._:-]{1,64}` or the server replaces it.
- The server echoes `X-Correlation-Id`. `201` responses include `Location`, `503` responses include
  `Retry-After` in seconds, and `405` responses include `Allow`.

**Errors.** Every failure from the REST API has this body. Empty `fieldErrors` and `details` are omitted:

```json
{
  "timestamp": "2026-09-15T10:00:00Z",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "path": "/api/v1/events",
  "traceId": "pl-3f2c...",
  "fieldErrors": [{ "field": "caseId", "message": "must not be blank" }],
  "details": {}
}
```

| Code | HTTP | Meaning | UI treatment |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | Invalid field or parameter | Inline field errors from `fieldErrors` |
| `MALFORMED_REQUEST` | 400 | Invalid JSON, wrong type, bad parameter format | Show `message`; it names the field |
| `ROUTE_NOT_FOUND` | 404 | Endpoint does not exist | For PLANNED endpoints: capability unavailable (§5.4) |
| `PROCESS_NOT_FOUND` | 404 | No events ingested for this process key | Empty state with link to Ingestion |
| `CASE_NOT_FOUND` | 404 | Case not in this process | Not-found state with link back to Cases |
| `EVENT_NOT_FOUND` | 404 | Unknown event ID | Not-found state |
| `METHOD_NOT_ALLOWED` | 405 | Wrong HTTP method | Treat as a bug; generic error |
| `NOT_ACCEPTABLE` | 406 | Unsupported `Accept` header | Generic error |
| `EVENT_ID_CONFLICT` | 409 | Producer reused an `eventId` for different content | Explain; `details.eventId`, `details.processKey` |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Wrong `Content-Type` | Generic error (`details.supportedMediaTypes`) |
| `INTERNAL_ERROR` | 500 | Unexpected server failure | Generic message and copyable `traceId`; no auto-retry |
| `SERVICE_UNAVAILABLE` | 503 | Database temporarily unavailable | "Temporarily unavailable"; auto-retry honouring `Retry-After` |

Tolerate codes the frontend does not know yet (for example the planned `AUTHENTICATION_REQUIRED` and
`ACCESS_DENIED`). If a response is not JSON or the network fails, synthesise
`{ status, code: 'NETWORK_ERROR' | 'TIMEOUT' | 'HTTP_<status>' }`.

**Retry policy.** Auto-retry only `NETWORK_ERROR`, `TIMEOUT` and `503`: at most 3 attempts, honouring
`Retry-After` and otherwise using exponential backoff. Never auto-retry other 4xx errors or `500`. Event
ingestion is idempotent server-side, so manual "Retry" and "Resubmit" actions are always safe.

**Cost awareness.** There is no server-side analytics cache yet, so every analytics call re-mines the whole
process from its stored events.

- Never poll analytics endpoints.
- Use TanStack Query with `staleTime: 60_000` and keys that include `processKey` and every parameter.
- Keep each page to at most 5 analytics calls.
- Show a "Computing process model…" loader label rather than a generic spinner.

## 5. BACKEND CONTRACT — ENDPOINTS AND TYPES

### 5.1 Available endpoints

| Method and path | Parameters / body | Success | Notable errors |
|---|---|---|---|
| `POST /api/v1/events` | `EventRequest` JSON | `201` `EventIngestionResult` (`ACCEPTED`, `Location` header). `200` `EventIngestionResult` (`DUPLICATE`; `eventId` is the originally stored event) | `400`, `409 EVENT_ID_CONFLICT` |
| `POST /api/v1/events/batch` | JSON array of `EventRequest` (`application/json`) **or** NDJSON (`application/x-ndjson`), any size, streamed server-side | `200` `BatchIngestionResult` | `400 MALFORMED_REQUEST` when JSON breaks mid-stream (committed counts in `details`); `503` (counts in `details`); `415` |
| `GET /api/v1/events/{eventId}` | UUID | `200` `EventResponse` | `404 EVENT_NOT_FOUND`, `400` invalid UUID |
| `GET /api/v1/processes/{processKey}/summary` | `sla?` | `200` `ProcessSummary` | `404 PROCESS_NOT_FOUND`, `400` invalid `sla` |
| `GET /api/v1/processes/{processKey}/variants` | `sla?`, `page=0`, `size=20` (1–200) | `200` `VariantAnalysis` | `404`, `400` |
| `GET /api/v1/processes/{processKey}/rework` | `loops=10` (0–100) | `200` `ReworkAnalysis` | `404` |
| `GET /api/v1/processes/{processKey}/bottlenecks` | `limit=10` (1–100) | `200` `BottleneckAnalysis` | `404` |
| `GET /api/v1/processes/{processKey}/sla` | `threshold?`, `worst=10` (0–100) | `200` `SlaAnalysis` | `404`, `400` |
| `GET /api/v1/processes/{processKey}/graph` | none | `200` `ProcessGraph` | `404` |
| `GET /api/v1/processes/{processKey}/insights` | `sla?` | `200` `InsightReport` | `404` |
| `GET /api/v1/processes/{processKey}/cases` | `page=0`, `size=20` (1–200), `sort=durationMs\|startedAt\|caseId\|eventCount`, `direction=desc\|asc`, `minDurationMs?` (≥ 0, inclusive), `variantId?` | `200` `PageResponse<CaseSummaryView>`; an unknown process returns an empty page, not 404 | `400 VALIDATION_FAILED` (`sort`, `direction`, `size`, `page`) |
| `GET /api/v1/cases/{caseId}/timeline` | `processKey` (defaults to `default`) | `200` `CaseTimeline` | `404 CASE_NOT_FOUND` |
| `GET /actuator/health` | none | `HealthResponse`; today `{"status":"UP","groups":["liveness","readiness"]}`, with `components` only when the backend enables health details | none |
| `GET /actuator/health/liveness`, `GET /actuator/health/readiness` | none | `HealthResponse` | none |
| `GET /actuator/metrics` | none | `{ "names": string[] }` | none |
| `GET /actuator/metrics/{name}` | `tag=key:value` (repeatable) | `MetricResponse` | `404` until the meter has recorded something |
| `GET /actuator/info` | none | object (may be empty) | none |

Batch notes:

- Items are validated individually. An invalid item is rejected with its zero-based `index`; the rest of the batch continues.
- The server commits every 500 events. When a batch is interrupted, everything committed so far stays,
  and resubmitting the **whole** batch is safe: already-stored events come back as duplicates.
- At most 100 rejections are listed; beyond that `rejectionsTruncated: true`.
- Invariant: `received = accepted + duplicates + conflicts + rejected`.

Event validation rules, mirrored client-side for instant feedback while the server stays authoritative:

- `caseId` and `activity` are required, max 200 chars.
- `timestamp` is required, must be an ISO-8601 instant, and cannot be more than 24h in the future.
- `processKey` must match `[A-Za-z0-9._-]*`, max 100.
- `eventId` and `resource` are max 200 chars each.

Actuator meters available now:

- `http.server.requests` (tags `uri`, `method`, `status`, `outcome`; statistics `COUNT`, `TOTAL_TIME` in seconds, `MAX`)
- `hikaricp.connections.active`, `.idle`, `.pending`, `.max`
- `jvm.memory.used` and `jvm.memory.max` (tag `area:heap`)
- `process.cpu.usage`, `system.cpu.usage`, `process.uptime`, `jvm.threads.live`

### 5.2 Types — mirror exactly in `src/api/types.ts`

```ts
// ---------- shared ----------
export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';          // backend sorts HIGH first
export type SlaSource = 'REQUEST' | 'PROCESS' | 'DEFAULT';  // PROCESS appears once the process registry ships

export interface PageResponse<T> {
  content: T[];
  page: number;          // zero-based
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface ApiFieldError { field: string; message: string }

export interface ApiError {
  timestamp: string;
  status: number;
  code: string;          // see §4 table; tolerate unknown codes
  message: string;
  path: string;
  traceId?: string;
  fieldErrors?: ApiFieldError[];
  details?: Record<string, unknown>;
}

// ---------- events ----------
export interface EventRequest {
  eventId?: string;
  processKey?: string;
  caseId: string;
  activity: string;
  timestamp: string;
  resource?: string;
}

export interface EventIngestionResult {
  eventId: string | null;               // for DUPLICATE: the originally stored event
  status: 'ACCEPTED' | 'DUPLICATE';     // a conflict arrives as HTTP 409 ApiError
  eventIdentity: string;                // SHA-256 idempotency key (64 hex chars)
}

export interface BatchRejection {
  index: number;                        // zero-based position in the submitted batch
  code: string;                         // VALIDATION_FAILED | MALFORMED_REQUEST | EVENT_ID_CONFLICT
  message: string;                      // e.g. "caseId must not be blank"
}

export interface BatchIngestionResult {
  batchId: string;
  received: number;
  accepted: number;
  duplicates: number;
  conflicts: number;
  rejected: number;
  durationMs: number;
  eventsPerSecond: number;
  rejections: BatchRejection[];
  rejectionsTruncated: boolean;
}

export interface EventResponse {
  eventId: string;
  processKey: string;
  caseId: string;
  activity: string;
  timestamp: string;
  resource: string | null;
  sourceEventId: string | null;         // producer eventId, if one was supplied
  eventIdentity: string;
  ingestedAt: string;                   // when Proclenz stored it
}

// ---------- cases ----------
export interface CaseSummaryView {
  caseId: string;
  eventCount: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  variantId: string;                    // same ID as VariantAnalysis.variants[].variantId
}

export type CaseSortField = 'durationMs' | 'startedAt' | 'caseId' | 'eventCount';

export interface CaseListQuery {
  page?: number;
  size?: number;
  sort?: CaseSortField;
  direction?: 'asc' | 'desc';
  minDurationMs?: number;
  variantId?: string;
}

export interface CaseTimelineEvent {
  sequence: number;                     // 1-based
  eventId: string;
  activity: string;
  timestamp: string;
  resource: string | null;
  deltaFromPreviousMs: number;          // waiting time since previous event (0 for the first)
  elapsedMs: number;                    // time since the first event of the case
  rework: boolean;                      // activity already occurred earlier in this case
}

export interface CaseTimeline {
  processKey: string;
  caseId: string;
  variantId: string;
  eventCount: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  reworkActivities: string[];
  events: CaseTimelineEvent[];          // ordered by timestamp, then arrival order
}

// ---------- analytics ----------
export interface ProcessSummary {
  processKey: string;
  caseCount: number;
  eventCount: number;
  activityCount: number;
  variantCount: number;
  firstEventAt: string;
  lastEventAt: string;
  avgEventsPerCase: number;
  avgCaseDurationMs: number;
  medianCaseDurationMs: number;
  p95CaseDurationMs: number;
  maxCaseDurationMs: number;
  topVariantCasePercent: number;
  casesWithRework: number;
  reworkRatePercent: number;
  sla: {
    thresholdMs: number;
    threshold: string;                  // ISO duration, hour form
    source: SlaSource;
    violatingCases: number;
    violationRatePercent: number;
  };
}

export interface Variant {
  rank: number;                         // 1 = most frequent
  variantId: string;                    // 16 hex chars, stable across runs
  activities: string[];
  sequence: string;                     // "Order Created → Credit Check → …"
  activityCount: number;
  containsRework: boolean;
  caseCount: number;
  casePercent: number;
  cumulativeCasePercent: number;        // Pareto
  avgDurationMs: number;
  medianDurationMs: number;
  p95DurationMs: number;
  slaViolations: number;
  slaViolationRatePercent: number;
}

export interface VariantAnalysis {
  processKey: string;
  totalCases: number;
  totalVariants: number;
  slaThresholdMs: number;
  page: number;
  size: number;
  totalPages: number;
  variants: Variant[];
}

export interface ActivityRework {
  activity: string;
  affectedCases: number;
  affectedCasePercent: number;
  repeatOccurrences: number;
  avgRepeatsPerAffectedCase: number;
  totalReworkTimeMs: number;
  avgReworkTimePerAffectedCaseMs: number;
}

export interface ReworkLoop {
  activity: string;
  path: string[];                       // e.g. ["Inventory Check","Rework Required","Inventory Check"]; very long loops are ["A","...","A"]
  occurrences: number;
  avgLoopDurationMs: number;
  p95LoopDurationMs: number;
}

export interface ReworkAnalysis {
  processKey: string;
  totalCases: number;
  casesWithRework: number;
  reworkRatePercent: number;
  totalRepeatOccurrences: number;
  totalReworkTimeMs: number;
  activities: ActivityRework[];
  loops: ReworkLoop[];
}

export interface Bottleneck {
  rank: number;
  fromActivity: string;
  toActivity: string;
  score: number;                        // 0–100, the worst transition = 100
  severity: Severity;                   // HIGH if waitShare ≥ 20%, MEDIUM if ≥ 10%
  transitionCount: number;
  caseCount: number;
  caseCoveragePercent: number;
  avgWaitMs: number;
  medianWaitMs: number;
  p95WaitMs: number;
  totalWaitMs: number;
  waitSharePercent: number;             // share of all waiting time in the process
  tailVolatility: number;               // 1 − median/p95
}

export interface BottleneckAnalysis {
  processKey: string;
  scoringModel: string;                 // human-readable formula; show it in the UI
  totalWaitingTimeMs: number;
  transitionsAnalyzed: number;
  bottlenecks: Bottleneck[];            // bottlenecks are TRANSITIONS, not activities
}

export interface SlaViolation {
  caseId: string;
  variantId: string;
  durationMs: number;
  overByMs: number;
  overByPercent: number;
}

export interface VariantCompliance {
  variantId: string;
  activities: string[];
  cases: number;
  violations: number;
  violationRatePercent: number;
}

export interface SlaAnalysis {
  processKey: string;
  thresholdMs: number;
  threshold: string;
  thresholdSource: SlaSource;
  totalCases: number;
  compliantCases: number;               // duration ≤ threshold
  violatingCases: number;               // duration > threshold
  violationRatePercent: number;
  avgDurationMs: number;
  p95DurationMs: number;
  worstViolations: SlaViolation[];
  variantsByViolations: VariantCompliance[];   // top 5
}

export type GraphNodeType = 'START' | 'ACTIVITY' | 'END';

export interface GraphNode {
  id: string;                           // activity name; "__start__" and "__end__" for boundary nodes
  label: string;
  type: GraphNodeType;
  frequency: number;                    // executions (events)
  caseCount: number;
  caseCoveragePercent: number;
  avgTimeToActivityMs: number;          // average waiting time before this activity
  repeatOccurrences: number;
}

export interface GraphEdge {
  id: string;                           // `${source}->${target}`
  source: string;
  target: string;
  count: number;
  caseCount: number;
  percentOfSourceOutgoing: number;      // outgoing percentages of a node sum to 100
  casePercent: number;
  avgDurationMs: number;                // waiting time on the transition
  medianDurationMs: number;
  p95DurationMs: number;
  reworkCount: number;                  // times this edge led back to an already executed activity
  reworkEdge: boolean;
}

export interface ProcessGraph {
  processKey: string;
  caseCount: number;
  nodes: GraphNode[];                   // START first, activities by frequency, END last
  edges: GraphEdge[];                   // sorted by count, descending
}

export type InsightType =
  | 'BOTTLENECK'
  | 'SLA_RISK'
  | 'REWORK_HOTSPOT'
  | 'SKIPPED_ACTIVITY'
  | 'VARIANT_FRAGMENTATION';

export interface ProcessInsight {
  type: InsightType;
  severity: Severity;
  title: string;
  detail: string;
  evidence: Record<string, string | number | null>;
}

export interface InsightReport {
  processKey: string;
  caseCount: number;
  slaThresholdMs: number;
  insights: ProcessInsight[];           // sorted HIGH → LOW
}

// ---------- actuator ----------
export type HealthStatus = 'UP' | 'DOWN' | 'OUT_OF_SERVICE' | 'UNKNOWN' | (string & {});

export interface HealthResponse {
  status: HealthStatus;
  groups?: string[];
  components?: Record<string, {
    status: HealthStatus;
    details?: Record<string, unknown>;
    components?: Record<string, unknown>;
  }>;
}

export interface MetricResponse {
  name: string;
  description?: string;
  baseUnit?: string;
  measurements: { statistic: string; value: number }[];   // COUNT, TOTAL_TIME, MAX, VALUE
  availableTags: { tag: string; values: string[] }[];
}
```

Insight `evidence` keys by type:

| Type | Evidence keys | Deep link |
|---|---|---|
| `BOTTLENECK` | `fromActivity`, `toActivity`, `waitSharePercent`, `avgWaitMs`, `p95WaitMs`, `caseCoveragePercent` | Bottlenecks, with that transition selected |
| `SLA_RISK` | `thresholdMs`, `violatingCases`, `violationRatePercent`, `p95DurationMs`, `worstVariantId` (nullable) | SLA & Compliance |
| `REWORK_HOTSPOT` | `activity`, `affectedCases`, `affectedCasePercent`, `repeatOccurrences`, `avgReworkTimePerAffectedCaseMs` | Rework, activity selected |
| `SKIPPED_ACTIVITY` | `activity`, `casesWithActivity`, `casesWithoutActivity`, `skippedPercent` | Process Explorer, deviations overlay, node focused |
| `VARIANT_FRAGMENTATION` | `variantCount`, `topVariantCasePercent` | Variants |

### 5.3 Planned endpoints (capability-gated, mock-only for now)

Shapes are provisional. Keep them isolated in `types.ts` under a `// PLANNED` section so they are easy to adjust.

**Process registry** (capability `processRegistry`)

- `GET /api/v1/processes` returns `ProcessDefinition[]`. The adapter should also accept a `PageResponse`.
- `GET /api/v1/processes/{processKey}` returns `ProcessDefinition` with an `ETag` header.
- `PUT /api/v1/processes/{processKey}/sla` takes body `{ "threshold": "P2D" | null }` and header
  `If-Match: <etag>`. It returns `200` with the updated definition and a new `ETag`, or
  `412 PRECONDITION_FAILED` when the process was changed by someone else.

```ts
export interface ProcessDefinition {
  processKey: string;
  displayName: string | null;
  slaThresholdMs: number | null;
  eventCount: number;
  caseCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}
```

**Datasets** (capability `datasets`)

- `POST /api/v1/datasets` is `multipart/form-data` with fields:
  - `file` (CSV), `name`, `processKey`
  - optional `timezone` (IANA, applied to timestamps without an offset; default `UTC`)
  - optional column overrides `eventIdColumn`, `caseIdColumn`, `activityColumn`, `timestampColumn`,
    `resourceColumn` (defaults `event_id`, `case_id`, `activity`, `timestamp`, `resource`)

  It returns `202 Accepted` with a `Location` header and a `Dataset` in `PENDING` status. Errors are
  `400 MALFORMED_DATASET` (missing required columns, unreadable file) and `413` (file too large).
- `GET /api/v1/datasets/{id}` returns a `Dataset`. Poll every 2s while it is `PENDING` or `PROCESSING`.
- `GET /api/v1/datasets?page&size` returns `PageResponse<Dataset>`.

```ts
export type DatasetStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED';

export interface Dataset {
  id: string;
  name: string;
  processKey: string;
  status: DatasetStatus;
  rowsRead: number;
  acceptedEvents: number;
  duplicateEvents: number;
  invalidRows: number;
  caseCount: number | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  rejections: { rowNumber: number; code: string; message: string }[];
  rejectionsTruncated: boolean;
}
```

**Security** (capability `auth`)

- Roles, highest first: `ADMIN` > `ANALYST` > `VIEWER`.
  - `VIEWER` has read-only analytics.
  - `ANALYST` can also submit events and upload datasets.
  - `ADMIN` can also manage datasets, configure SLAs and run migrations.
- Failures are `401 AUTHENTICATION_REQUIRED` and `403 ACCESS_DENIED`.
- Build only an auth-header hook in `client.ts` and role-aware disabling of actions. **No login server and no fake login.**

**Asynchronous ingestion and metrics** (capabilities `asyncIngestion`, `customMetrics`, `kafkaMetrics`)

- A Kafka-backed async endpoint returning `202`.
- Actuator meters `proclenz.events.ingested` (tags `channel`, `outcome`), `proclenz.ingestion.batch.duration`,
  `proclenz.analytics.computation` (tag `view`), `proclenz.analytics.cache` (tag `result`) and
  `proclenz.kafka.dlq.published`.
- Kafka client lag via `kafka.consumer.fetch.manager.records.lag.max`.
- Health components `db`, `diskSpace`, `ping`, `redis`, `kafka`.

**Migrations** (capability `migrations`): `POST /api/v1/migrations`, `GET /api/v1/migrations/{id}`.

```ts
export interface MigrationJob {
  migrationId: string;
  sourceDataset: string;
  targetDataset: string;
  status: 'PENDING' | 'EXTRACTING' | 'TRANSFERRING' | 'VALIDATING' | 'COMPLETED' | 'FAILED' | 'FAILED_VALIDATION';
  recordsExtracted: number;
  recordsTransferred: number;
  recordsValidated: number;
  failures: number;
  startedAt: string | null;
  completedAt: string | null;
  validation: {
    check: 'RECORD_COUNT' | 'CHECKSUM' | 'UNIQUENESS' | 'TIMESTAMP_SANITY' | 'KEY_CONSISTENCY';
    passed: boolean;
    expected: string;
    actual: string;
    message: string;
  }[];
}
```

### 5.4 Capabilities

`src/api/capabilities.ts` exposes the capabilities `processRegistry`, `datasets`, `auth`,
`asyncIngestion`, `customMetrics`, `kafkaMetrics`, `healthDetails` and `migrations`.

- **Mock mode:** all capabilities are enabled. Settings has a toggle, "Simulate current backend", that
  disables every PLANNED capability so the degraded UI can be tested.
- **Live mode:** probe once at startup and cache the result for the session.

  | Capability | Enabled when |
  |---|---|
  | `processRegistry` | `GET /api/v1/processes` returns 200 |
  | `datasets` | `GET /api/v1/datasets?size=1` returns 200 |
  | `healthDetails` | `/actuator/health` returns `components` |
  | `customMetrics` | the `/actuator/metrics` names include `proclenz.events.ingested` |
  | `kafkaMetrics` | the names include `kafka.consumer.fetch.manager.records.lag.max` |

  `404 ROUTE_NOT_FOUND` means the capability is unavailable.
- An unavailable capability renders a neutral `<CapabilityUnavailable>` panel: what the feature does,
  that it arrives in a later backend release, and a link to what works today. It is never styled as an error.

## 6. DERIVED METRICS (the only client-side calculations allowed)

Implement these in `src/domain/derived.ts` with unit tests. Show each in the UI with an ⓘ tooltip that
states its formula.

1. **SLA compliance %** = `compliantCases / totalCases × 100`
2. **Case SLA status** (thresholdMs from the SLA in effect):
   - `BREACHED` if `durationMs > thresholdMs`
   - `AT RISK` if `durationMs ≥ 0.8 × thresholdMs`
   - `ON TRACK` otherwise
3. **At-risk cases**: `totalElements` of `GET .../cases?minDurationMs=ceil(0.8×thresholdMs)&size=1`, minus `violatingCases`.
4. **Breached cases link**: `.../cases?minDurationMs=thresholdMs+1`.
5. **Average SLA margin** = `thresholdMs − avgDurationMs` (negative means over the SLA).
6. **Active bottlenecks**: bottlenecks with severity `HIGH` or `MEDIUM` in `GET .../bottlenecks?limit=100`.
7. **Abnormal wait** on a timeline event: `deltaFromPreviousMs` greater than `p95DurationMs` of the graph edge
   `${previousActivity}->${activity}`.
8. **Deviation vs dominant path**: compare a case or variant with variant rank 1.
   - **missing**: activities in rank 1 that are absent.
   - **unexpected**: activities present that are not in rank 1.
9. **Variants affected by a bottleneck**: loaded variants whose `activities` contain `fromActivity`
   immediately followed by `toActivity`. Label it "among N variants loaded".
10. **Variants covering 80% of cases**: the first rank whose `cumulativeCasePercent ≥ 80`.
11. **Rare path**: an edge with `casePercent` below the user-adjustable threshold (default 5%).
12. **Server request rate, mean latency and error rate**: deltas of `http.server.requests` `COUNT` and
    `TOTAL_TIME` between two polls, with errors taken from the `outcome:SERVER_ERROR` tag.
13. **Session ingestion throughput** = `Σ received / Σ durationMs` over batches submitted in this browser session.
14. **Arrival delay** of an event = `ingestedAt − timestamp`.

No other computed percentages or scores. Never aggregate raw events in the browser.

## 7. APPLICATION SHELL

**Left sidebar** (collapsible, icons plus labels, active state, keyboard accessible)

- **ANALYZE:** Overview · Process Explorer · Cases · Bottlenecks · Rework · Variants · SLA & Compliance
- **DATA:** Processes · Datasets · Ingestion
- **OPERATE:** System Health · Migrations (only when the `migrations` capability is on)
- **Bottom:** Settings · API Status. API Status shows a connection dot, a `MOCK` badge in mock mode, and
  opens a diagnostics drawer (§8.12).

**Top bar**

- **Proclenz wordmark.**
- **Process selector.** Uses the registry list when `processRegistry` is on. Otherwise it lists
  `VITE_DEFAULT_PROCESS_KEY` plus keys the user adds (kept in localStorage). "Add process key" validates
  the key with `/summary` and shows "No events ingested for `<key>` yet" on `PROCESS_NOT_FOUND`.
- **SLA threshold selector.** This replaces a date-range picker, because the backend has no time filtering.
  - Options: "Backend default" (omit the parameter), presets `PT4H`, `PT8H`, `P1D`, `P2D`, `P7D`,
    `P14D`, and a custom ISO-duration input with validation.
  - The value lives in the URL as `?sla=` and is sent as `sla` or `threshold` by the API layer.
  - It displays the effective threshold and its `source` from the latest summary.
- **Data window** (read-only): `firstEventAt – lastEventAt` from the summary, with a tooltip explaining
  that analytics cover all events of the process.
- **Search.**
  - "Go to case ID…" is an exact match within the selected process and opens the timeline. On
    `CASE_NOT_FOUND` it shows an inline message.
  - Input shaped like a UUID opens the event detail page.
- **Backend indicator:** Connected / Degraded / Unreachable / Mock data, from an actuator health poll every 30s.
- **Profile placeholder:** avatar menu with theme switch only. No login.

**Routes** (process-scoped routes carry the key in the path; `?sla=` propagates everywhere)

```
/                                   → /p/{default}/overview
/p/:processKey/overview
/p/:processKey/explorer             ?mode=frequency|duration&overlays=bottlenecks,rework,deviations&variant=&node=&edge=&paths=
/p/:processKey/cases                ?page&size&sort&direction&minDurationMs&variantId&breached=1
/p/:processKey/cases/:caseId
/p/:processKey/bottlenecks          ?limit&selected=<from->to>
/p/:processKey/rework               ?activity=
/p/:processKey/variants             ?page&size&selected=<variantId>
/p/:processKey/sla                  ?worst=
/processes   /datasets   /datasets/:datasetId   /ingestion   /health   /settings
/events/:eventId   /migrations
```

## 8. PAGES

Every page must have:

- skeleton loaders shaped like the final layout
- empty states that say what to do next
- error states that show the message, a copyable `traceId` and a Retry button (§12)
- capability-unavailable states where relevant

### 8.1 Overview (`summary`, `graph`, `insights`, `bottlenecks?limit=100`; lazy `variants?size=5`)

- **Header:** "Process Intelligence". Subtitle: "Understand how your processes actually execute." Show the
  process key, data window and SLA chip (threshold and source).
- **Pipeline strip.** This is the product story, told with real numbers; each step links to its page:
  `{eventCount} events → {caseCount} cases reconstructed → {variantCount} variants → {activityCount}
  activities · {edges} transitions → {activeBottlenecks} bottlenecks · {reworkRatePercent}% rework ·
  {violatingCases} SLA breaches → {insights.length} insights`
- **KPI cards.** No change percentages: the backend has no period comparison. Use informative sub-lines instead.
  - Total Cases (sub: avg events per case)
  - Events Processed (sub: data window)
  - Avg Case Duration (sub: median · p95)
  - SLA Compliance (sub: `violatingCases` of `caseCount` breach `<threshold>`)
  - Active Bottlenecks (sub: the top transition `from → to`)
  - Rework Rate (sub: `casesWithRework` cases)
- **Process flow** (main area). A compact interactive graph (§9), with the bottleneck overlay on by default,
  zoom/pan and fit-to-view.
  - Node cards show executions, case coverage and average wait before the activity.
  - Transitions ranked HIGH are emphasised, and the target node of a HIGH transition gets a severity
    halo, because that is where cases queue.
  - Clicking a node or edge opens Process Explorer with it selected.
- **Right panel: "Top Operational Issues".** Items come from `insights` in backend order, each with severity,
  title, detail and two or three evidence chips. Clicking one deep-links by type (§5.2 table). Empty state:
  "No significant issues detected under the current SLA".
- **Below the fold:** top 5 variants as sequence chips with case share and average duration, linking to Variants.

### 8.2 Process Explorer (`graph`; plus `bottlenecks`, `rework`, `variants`, `insights` loaded when their overlay or panel is opened)

The signature page. A full-height graph canvas with a toolbar and a collapsible right inspector.

**Toolbar**

- Mode, a segmented control: **Show frequency** or **Show duration**
- Overlay toggles: **Show bottlenecks**, **Show rework**, **Show deviations**
- Variant highlight select (from `variants?size=50`)
- Activity filter (multi-select that hides nodes and their edges, with a hidden count)
- **Paths** slider that hides edges below a minimum `casePercent`
- Layout direction (left→right or top→bottom), zoom in/out, fit view, reset
- Minimap and legend

**Node inspector**

- Activity, executions (`frequency`), cases and coverage %, average waiting time before the activity, repeats
- Rework stats from `/rework` for this activity (affected cases, time lost), when present
- Incoming edges (source, count, average and p95 wait) and outgoing edges (target, count, % of outgoing)
- Bottleneck transitions into or out of the node
- Related insights (evidence `activity`, `fromActivity` or `toActivity` matching the node)
- "Skipped in X% of cases" when a `SKIPPED_ACTIVITY` insight exists
- A muted note: "Execution time is not available: events record completion time only"

**Edge inspector**

- From → To, transition count, cases and case %, share of the source's outgoing flow
- Average / median / p95 wait (as a small bar), rework transitions
- When the edge is a ranked bottleneck: rank, score, severity, wait share and tail volatility, with a
  link to open it in Bottlenecks

### 8.3 Cases and Case Timeline (`cases`, `summary` for the SLA threshold, `variants?size=50` for labels; timeline uses `timeline` plus the cached `graph` and `variants`)

**Case table** (server-side paging, sorting and filtering, all synced to the URL)

- Columns: Case ID (mono, link) · Started · Ended · Duration (with a thin bar relative to the SLA
  threshold) · Events · Variant (`V{rank}` when known, otherwise the first 8 characters of the ID) ·
  SLA Status (derived §6.2).
  There is no Process column (the table is scoped to one process) and no open/closed Status column (the
  backend has no such state).
- Only `durationMs`, `startedAt`, `caseId` and `eventCount` are sortable, because those are the fields the backend supports.
- Filters:
  - "Breached only" toggle (`minDurationMs = thresholdMs + 1`)
  - Minimum duration (value plus unit)
  - Variant (select or pasted ID)
  - Page size 20 / 50 / 100 / 200
- Search is **"Go to case"** (exact ID). The backend has no text search, so never filter the current page
  and pretend it is a search.
- Empty filter result: "No cases match these filters" with a reset button.

**Case timeline** (`/p/:processKey/cases/:caseId`)

- **Header:** case ID, duration, event count, SLA status against the threshold, variant chip (links to the
  variant), rework activity chips, start → end.
- **Vertical timeline:** each event shows local time (UTC on hover), activity, resource and sequence.
  - The gap between events is drawn proportionally to `deltaFromPreviousMs` and labelled "wait 4h 09m".
  - Badges: **REWORK** (`rework: true`) and **ABNORMAL WAIT** (§6.7, tooltip "p95 for this transition: …").
- **"Compared with the dominant path"** card lists missing and unexpected activities (§6.8).
- **Cumulative elapsed chart:** a step line of `elapsedMs` per event, with the SLA threshold line.
- Clicking an event opens its event detail (§8.13).
- A legend explains that only waiting time is shown, because events carry one timestamp.

### 8.4 Bottlenecks (`bottlenecks?limit=` 10/25/50/100; `variants?size=200` for the affected-variants panel)

**Table.** The response is the complete top-N list, so client-side sorting within it is fine.

- Rank · Transition (From → To) · Severity · Score (0–100 bar) · Wait share % · Avg wait · Median ·
  P95 wait · Tail volatility · Transitions · Cases (coverage %)

**Detail panel** for the selected row (synced to the URL):

- **Why this is a bottleneck:** render `scoringModel`, then this transition's inputs.
  `waitShare`, then `tailVolatility`, then `impact = waitShare × (1 + tailVolatility)`, then the
  normalised score, then the severity rule. Keep the language plain.
- **Wait profile:** avg / median / p95 bars, and total waiting time against the process total (`totalWaitMs / totalWaitingTimeMs`).
- **Cases affected:** `caseCount`, `caseCoveragePercent`.
- **Variants affected** (§6.9), with a link to each variant.
- **Mini graph** focused on the transition and its neighbours.
- Links: open in Process Explorer (edge selected) · view SLA analysis.
- **No trend-over-time chart:** the backend exposes no time series. Do not synthesise one.

### 8.5 Rework (`rework?loops=20`)

- **KPIs:** rework rate, cases with rework, total repeat executions, total time spent in rework loops.
- **Activities table:** activity · affected cases (%) · repeats · average repeats per affected case ·
  time lost per affected case · total time lost.
- **Loops list:** each path rendered as connected chips (`Inventory Check → Rework Required → Inventory
  Check`), with occurrences and average / p95 loop duration. Clicking a loop opens Process Explorer with
  the rework overlay and that path highlighted.
- Empty state: "No rework detected: no activity repeats within a case".

### 8.6 Variants (`variants?page&size`, `summary`)

- **Summary strip:** total variants, total cases, top-variant coverage, "N variants cover 80% of cases" (§6.10).
- **Pareto chart:** bars of `casePercent` and a line of `cumulativeCasePercent` for the loaded page.
- **Variant rows:**
  - `V{rank}` and the short ID
  - sequence chips (long sequences collapse to "+N more"; expand on click)
  - cases and share, avg / median / p95 duration
  - SLA violation rate under the selected SLA
  - `REWORK` badge when `containsRework`
  - deviation summary vs V1 (§6.8)
- **Selected-variant panel:**
  - the full sequence as a linear flow, with repeated activities drawn as a loop-back arrow
  - statistics
  - "View N cases" (opens Cases with `variantId`)
  - "Highlight in Process Explorer"
- Server-side pagination.

### 8.7 SLA & Compliance (`sla?threshold&worst`, `summary`, one `cases?size=1` call for at-risk)

- **Threshold control** synced with the global SLA selector, plus a source badge (`REQUEST` / `PROCESS` / `DEFAULT`).
- **KPIs:** compliance % · breached cases · at-risk cases (§6.3) · average SLA margin (§6.5) · p95 duration
  vs threshold.
- **Duration vs SLA chart:** a bullet chart of average, median, p95 and max case duration against the threshold line.
- **Breaches by variant:** a bar chart from `variantsByViolations` (violations and violation rate), with sequences on hover.
- **Worst violations table:** Case ID (opens the timeline) · Variant · Duration · SLA · Over by · Over by %.
  The "All breached cases" button opens Cases filtered via §6.4.
- **Do not build** "compliance over time" or "breaches by activity": the backend measures SLA at case
  level and exposes no time series.

### 8.8 Processes

- **With `processRegistry`:** a table of process key · display name · events · cases · first / last event ·
  SLA threshold (or "default") · actions.
  - Actions: open Overview, and **Edit SLA** (a dialog that sends `PUT` with `If-Match`).
  - On `412`: "This process was changed by someone else. Reload to see the latest SLA."
- **Without it:** show known keys (default plus user-added). Each row expands to load its `summary`
  (cases, events, variants, SLA breach %), with a note that each summary is computed on demand. Include the
  "Add process key" action.

### 8.9 Datasets (capability `datasets`)

- **Upload panel, "Upload Event Dataset":** a drag-and-drop CSV zone.
  - Show the expected columns `event_id` (optional), `case_id`, `activity`, `timestamp`, `resource` (optional).
  - Fields: dataset name, process key (select or new), timezone for timestamps without an offset.
  - Column mapping auto-suggested by reading **only the header line** of the file.
  - Upload progress uses `XMLHttpRequest`, because `fetch` has no upload progress.
- **After `202`:** open the dataset detail page with the real status pipeline and live counters:

  ```
  RECEIVED  →  PROCESSING (rows read · accepted · duplicates · invalid)  →  COMPLETED | FAILED | INTERRUPTED
  ```

  Do not invent `VALIDATING`, `RECONSTRUCTING` or `ANALYZING` stages. Validation happens row by row while
  processing, and the process model is computed on demand when analytics are opened. On `COMPLETED`, show
  "Explore process" and "View cases" buttons.
- **Rejections table:** row number · code · message, with a "truncated" notice. Messages come from the
  backend, for example:
  - `caseId must not be blank`
  - `Field 'timestamp' must be an ISO-8601 instant such as 2026-09-15T09:00:00Z`
  - `timestamp must not be more than PT24H in the future`
  - `Event ID 'evt-17' was already used for a different event`

  Duplicates are counted, not treated as errors.
- **Datasets list:** name · process · status · rows · accepted · duplicates · invalid · cases · started · duration.
- **Without the capability:** `<CapabilityUnavailable>` explaining that server-side CSV datasets arrive in a
  later backend release, with a primary button to **Ingestion**, which works today.

### 8.10 Ingestion (works today, `POST /events`, `POST /events/batch`; actuator metrics)

**A. Submit events** (tabs)

- **Single event.**
  - Form fields: `eventId`, `processKey`, `caseId`, `activity`, `timestamp` (defaults to now; ISO), `resource`.
  - Client validation mirrors §5.1.
  - Result card:
    - **Created** (201): event ID and the `Location` link
    - **Duplicate** (200): links to the original event
    - **Conflict** (409): explanation with the `details`
    - **Validation** (400): field errors
- **Batch.**
  - Paste a JSON array or NDJSON, or choose a `.json` / `.ndjson` file (sent as a stream with the matching
    `Content-Type`).
  - For CSV files, offer a client-side conversion to NDJSON using the same column mapping UI, streaming the
    file line by line (`file.stream()` with `TextDecoderStream`). This is not a dataset upload.
  - **Result:** received · accepted · duplicates · conflicts · rejected · duration · events/s, plus a
    rejections table where the index maps back to the row, and a truncated notice.
  - **"Resubmit same batch"** demonstrates idempotency: accepted becomes 0 and everything counts as a duplicate.
  - **Interrupted batches** (`400` or `503` with `details`): "Stopped after N items; X were stored.
    Resubmit the whole batch: stored events will be reported as duplicates." For `503`, add a Retry-After countdown.

**B. Batch history (this session)**

- Columns: batch ID · source (paste / file name) · received · accepted · duplicates · conflicts · rejected ·
  duration · events/s · submitted at · result.
- Result is `COMPLETED`; `PARTIAL` (rejections or conflicts); `INTERRUPTED` (400 or 503 with counts); or `FAILED`.
- Stored in `sessionStorage` and clearly labelled "Recorded in this browser session. The backend does not
  persist batch history yet."

**C. Server ingestion metrics**, from actuator `http.server.requests` with `uri:/api/v1/events/batch` and
`uri:/api/v1/events`, polled every 15s:

- request count since backend start
- rate, mean latency and error rate (§6.12), and max latency
- small sparklines from the polling samples held in memory
- session throughput (§6.13)

When a meter returns 404: "No ingestion requests recorded since the backend started".

**D. Streaming pipeline** (capabilities `asyncIngestion`, `kafkaMetrics`): consumer lag, DLQ messages and
retries when available. Otherwise `<CapabilityUnavailable>`: "Asynchronous Kafka ingestion is not enabled on this backend".

### 8.11 System Health (actuator only)

- **Overall status** from `/actuator/health`; **liveness** and **readiness** from their groups. Status mapping:
  - `UP` → Healthy
  - `DOWN` / `OUT_OF_SERVICE` → Unavailable
  - `UNKNOWN` → Unknown
  - **Degraded** (derived): `UP` but readiness is not `UP`, the error rate is above 5%, or DB connections are pending.
- **Components**, reflecting the real architecture, a modular monolith:
  - **API**: reachable, with the client-measured health-call latency
  - **Database**: `components.db` when `healthDetails` is on; otherwise "Not reported" plus HikariCP pool metrics as a proxy
  - **Disk**: `components.diskSpace`, or not reported
  - **Event processor** and **Analytics engine**: labelled "In-process (modular monolith)", following API status
  - **Cache (Redis)** and **Message queue (Kafka)**: "Not configured" until their health components appear

  Never show "Healthy" for something the backend does not report.
- **Metrics** (poll every 15s, sparklines from in-memory samples):
  - request rate, mean and max latency, error rate
  - DB pool active / idle / pending / max
  - JVM heap used / max
  - process CPU, live threads, uptime

### 8.12 Settings and API Status

- **Environment** (read-only): API base URL, actuator base URL, mock mode, detected capabilities with probe results.
- **Preferences** (localStorage): default process key, page size, time display (local / UTC), theme.
- **Mock tools** (mock mode only):
  - simulated latency on / off
  - force an error scenario: none · 404 · 500 · 503 · network
  - "Simulate current backend" (disables PLANNED capabilities)
- **Diagnostics drawer:** the last 50 API calls (method, path, status, duration, correlation ID), with copy buttons.

### 8.13 Event Detail (`/events/:eventId`)

`EventResponse` fields, with:

- **Lineage:** the idempotency key (`eventIdentity`), producer ID (`sourceEventId`), and when it happened vs
  when it was ingested (arrival delay, §6.14).
- A link to its case timeline (`processKey` plus `caseId`).
- A short explanation of how duplicates are detected.

### 8.14 Migrations (capability `migrations`, build last)

A job list and job detail using `MigrationJob`. It shows the phase pipeline EXTRACTING → TRANSFERRING →
VALIDATING → COMPLETED / FAILED_VALIDATION, record counters, and a validation checklist of record count,
checksum, uniqueness, timestamp sanity and key consistency, each with expected vs actual. The sidebar
entry is hidden when the capability is off.

## 9. PROCESS GRAPH SPECIFICATION

The graph is data-driven. `src/domain/graph.ts` converts `ProcessGraph` (plus optional bottleneck, rework,
insight and variant data) into React Flow nodes and edges with pure functions. Never hardcode activity
names, positions or process shapes.

- **Layout:** dagre, `rankdir` LR by default (TB toggle), `acyclicer: 'greedy'` so rework cycles do not break
  ranking. Back edges render as curved paths; self-loops (`source === target`) as loop edges.
- **Nodes:**
  - **START and END:** small pills, "Start · {caseCount} cases" and "End".
  - **Activities:** compact cards with the label; `frequency` executions · `caseCoveragePercent`% of cases;
    "avg wait {avgTimeToActivityMs}" (hidden when there are no incoming transitions); a "↻ {repeatOccurrences}"
    badge when above 0.
- **Edges:**
  - **Width:** 1–8px, scaled by `sqrt(count / maxCount)`. Arrowheads always shown.
  - **Frequency mode label:** `{count} · {percentOfSourceOutgoing}%`. Boundary edges show the count only.
  - **Duration mode label:** average wait (p95 in the tooltip), with colour intensity scaled to `avgDurationMs` and an explicit legend.
- **Overlays:**
  - **Bottlenecks:** join `/bottlenecks` to edges by `${fromActivity}->${toActivity}`. Colour by severity,
    show a `#rank` badge, and put a severity halo on the target node of `HIGH` transitions.
  - **Rework:** `reworkEdge` edges become dashed with "↻ {reworkCount}". Nodes with repeats get a badge;
    selecting a loop from `/rework` highlights its path.
  - **Deviations:** `SKIPPED_ACTIVITY` nodes get a "skipped in X%" marker; rare paths (§6.11) are dotted
    amber; edges that are not on variant rank 1's path are muted.
  - **Variant highlight:** highlight consecutive pairs of the selected variant (including start → first and
    last → end) and dim everything else to about 25% opacity.
- **Interaction:**
  - hover tooltips on nodes and edges
  - click to select (updates the URL and the inspector); `Esc` clears the selection
  - wheel zoom, drag pan, fit view on load and when filters change
- **Filtering** hides elements visually only; it never recomputes metrics. START and END are always kept.
- **Scale:** above 40 activity nodes, start with the Paths slider at 5% and show "N rare transitions hidden".

## 10. API LAYER

**`src/api/client.ts`**

- `request<T>(method, path, { query, body, headers, signal, contentType, baseUrl })`
- Builds URLs from `config` and omits undefined query values.
- Adds `Accept` and `X-Correlation-Id`; applies the timeout via `AbortController`.
- Parses JSON. On failure it throws `ApiRequestError` with `status`, `code`, `message`, `fieldErrors`,
  `details`, `traceId` (body first, then the response header), `retryAfterSeconds` and `correlationId`.
- Records every call for the diagnostics drawer.
- Exposes an `authHeaderProvider` hook, unused until auth ships.

**`src/api/index.ts`** defines a `ProclenzApi` interface. Both the `http` and `mock` implementations satisfy
it, and `api` is chosen once from `VITE_USE_MOCK_DATA`. The UI imports only hooks, never the implementations.

```ts
export interface ProclenzApi {
  // analytics (AVAILABLE)
  getSummary(processKey: string, p?: { sla?: string }): Promise<ProcessSummary>;
  getVariants(processKey: string, p?: { sla?: string; page?: number; size?: number }): Promise<VariantAnalysis>;
  getRework(processKey: string, p?: { loops?: number }): Promise<ReworkAnalysis>;
  getBottlenecks(processKey: string, p?: { limit?: number }): Promise<BottleneckAnalysis>;
  getSla(processKey: string, p?: { threshold?: string; worst?: number }): Promise<SlaAnalysis>;
  getGraph(processKey: string): Promise<ProcessGraph>;
  getInsights(processKey: string, p?: { sla?: string }): Promise<InsightReport>;
  // cases (AVAILABLE)
  listCases(processKey: string, q?: CaseListQuery): Promise<PageResponse<CaseSummaryView>>;
  getCaseTimeline(processKey: string, caseId: string): Promise<CaseTimeline>;
  // events (AVAILABLE)
  ingestEvent(event: EventRequest): Promise<{ httpStatus: 200 | 201; result: EventIngestionResult; location?: string }>;
  ingestBatch(body: { contentType: 'application/json' | 'application/x-ndjson'; payload: string | Blob | ReadableStream }): Promise<BatchIngestionResult>;
  getEvent(eventId: string): Promise<EventResponse>;
  // actuator (AVAILABLE)
  getHealth(group?: 'liveness' | 'readiness'): Promise<HealthResponse>;
  listMetricNames(): Promise<string[]>;
  getMetric(name: string, tags?: Record<string, string>): Promise<MetricResponse>;
  // PLANNED
  listProcesses(): Promise<ProcessDefinition[]>;
  getProcess(processKey: string): Promise<{ process: ProcessDefinition; etag: string }>;
  updateProcessSla(processKey: string, threshold: string | null, etag: string): Promise<{ process: ProcessDefinition; etag: string }>;
  uploadDataset(input: DatasetUpload, onProgress?: (fraction: number) => void): Promise<Dataset>;
  getDataset(id: string): Promise<Dataset>;
  listDatasets(p?: { page?: number; size?: number }): Promise<PageResponse<Dataset>>;
  listMigrations(): Promise<MigrationJob[]>;
  getMigration(id: string): Promise<MigrationJob>;
}
```

The streaming batch `ReadableStream` body needs `duplex: 'half'`. Fall back to `Blob` where that is unsupported.

**Hooks and query keys**

- Keys follow the shape `['process', processKey, 'graph']`, `['process', processKey, 'variants', { sla, page, size }]`, etc.
- Analytics use `staleTime: 60s` and no refetch-on-focus.
- Health and metrics poll at their stated intervals; datasets poll every 2s only while processing.
- Mutations invalidate the process's analytics keys after successful ingestion.

## 11. MOCK DATA

Mock data must look exactly like real backend responses. Use static JSON fixtures in
`src/api/mock/fixtures`, typed against `types.ts`. The mock layer may **select, filter, sort and paginate**
fixtures using the backend's parameter semantics. It must **not** contain process-mining or aggregation logic.

**Processes**

- `order-to-cash` (primary, about 5,000 cases and 52,000 events) and `procure-to-pay` (smaller, for the selector).
- `default` is absent, to demo `PROCESS_NOT_FOUND`.
- Order-to-cash activities: Order Created, Credit Check, Order Approved, Inventory Check, Rework Required,
  Pick, Pack, Ship, Invoice Generated, Payment Received.

**Patterns built into the fixtures** (they must show up consistently across every endpoint):

- dominant happy path (~55% of cases)
- skipped Credit Check (~10%, producing a `SKIPPED_ACTIVITY` insight)
- approval bottleneck on Credit Check → Order Approved (`HIGH`, p95 far above median)
- inventory rework loop Inventory Check → Rework Required → Inventory Check (~12%, `REWORK_HOTSPOT`)
- slow-shipping tail on Pack → Ship
- missing Payment Received (~5%)
- default SLA `P7D` with roughly 15% breaches (`SLA_RISK`)

**Fixtures**

- `summary`, `graph`, `rework`, `bottlenecks` (≥ 12 transitions), `insights`
- `variants` (≥ 30 variants to exercise paging)
- `sla`, provided for thresholds `P2D`, `P7D` (default) and `P14D`; other values fall back to the nearest, with a mock-mode notice
- `cases` (≥ 250 `CaseSummaryView` rows)
- ≥ 10 timelines, including ORD-1001 from §1, a breached case, a rework case and a skipped-credit-check case. Other case IDs return `404 CASE_NOT_FOUND`.
- event fixtures for timeline `eventId`s
- actuator health and metrics

**Invariants the fixtures must satisfy** (add a Vitest test that checks them):

- `caseCount` is identical across summary, graph, variants (`totalCases`), SLA, rework and insights.
- Σ variant `caseCount` = `caseCount`, and the last `cumulativeCasePercent` = 100.
- START outgoing counts and END incoming counts each sum to `caseCount`. Each node's outgoing
  `percentOfSourceOutgoing` sums to about 100.
- `compliantCases + violatingCases = totalCases`.
- Every bottleneck `${fromActivity}->${toActivity}` exists as a graph edge.
- `durationMs = endedAt − startedAt` for cases. In timelines, Σ `deltaFromPreviousMs` = `durationMs`.

**Mock ingestion** emulates backend behaviour, not just a happy path:

- identical validation rules and messages
- identity = `eventId` when present, otherwise `processKey|caseId|activity|timestamp|resource`
- an in-memory map produces `ACCEPTED`, `DUPLICATE` and `CONFLICT`
- batch counts and rejection caps as specified

Ingested mock events do **not** change analytics fixtures; show a subtle mock banner saying so.

**Simulated latency:** 150–400ms for reads, 600–1500ms for analytics.

## 12. UX STATES AND FORMATTING

**States**

- **Skeletons** match final layouts: KPI rows, table rows, graph canvas placeholder, timeline rows.
- **Empty states** are specific:
  - `PROCESS_NOT_FOUND`: "No events for `<key>` yet", linking to Ingestion
  - empty case filters: a reset action
  - no rework / no insights / no breaches: a positive neutral message
- **Error panel:** plain-language title, `message`, a copyable `traceId`, and Retry (manual). For 503, an
  auto-retry countdown. For `NETWORK_ERROR`: "Cannot reach the backend at `<base URL>`".
- **Feedback:** toasts for mutations (ingestion, SLA update, dataset upload) and inline field errors for forms.
- **Accessibility:** focus rings, labelled controls, keyboard-operable tables and graph selection, and
  sufficient contrast in both themes.

**Formatting** (`src/domain/format.ts`, unit tested)

- **Durations** from ms: `< 1s` "850 ms" · `< 1m` "45 s" · `< 1h` "12m 30s" · `< 1d` "3h 12m" · `≥ 1d` "2d 4h"
- **Counts:** thousands separators; compact form on KPI cards ("52.4K") with the exact value in a tooltip.
- **Percentages:** one decimal on cards, two in tables and inspectors.
- **Timestamps:** local time by default ("Sep 14, 09:21"), UTC ISO in tooltips, and a setting to switch to UTC.
- **ISO durations:** humanise for display (`PT8H` → "8h"), and validate input with a regex before sending.
- **IDs:** monospace. Variant labels are `V{rank}` with `variantId.slice(0, 8)`.

## 13. DELIVERABLES AND ACCEPTANCE CHECKLIST

**Pages**

- [ ] Application shell with the sidebar, top bar (process selector, SLA selector, data window, search, backend indicator) and routes from §7
- [ ] Overview with the pipeline strip, KPIs, graph and insights panel
- [ ] Process Explorer with modes, overlays, filters, the paths slider, variant highlight and inspectors
- [ ] Cases with server-side paging, sorting and filters; case timeline with waits, rework, abnormal waits and deviations
- [ ] Bottlenecks with the scoring explanation; Rework; Variants with Pareto; SLA & Compliance
- [ ] Processes (registry or fallback), Datasets (capability-gated), Ingestion (working submit, batch, history, metrics)
- [ ] System Health, Settings, Event Detail and Migrations, all from actuator data or capability-gated as specified

**API layer**

- [ ] One API client; one `ProclenzApi` interface with http and mock implementations; `VITE_USE_MOCK_DATA` switches them
- [ ] `VITE_API_BASE_URL` and `VITE_ACTUATOR_BASE_URL` respected; no hardcoded hosts in components
- [ ] Types in `src/api/types.ts` match §5.2 exactly
- [ ] Correlation IDs sent; `traceId` shown on errors; retry policy as in §4

**Honesty and quality**

- [ ] No invented metrics: no change %, trends, AI scores, per-activity execution time or per-activity SLA
- [ ] Every page has skeleton, empty, error and (where relevant) capability-unavailable states
- [ ] Fixture invariant test and unit tests for `format.ts`, `derived.ts` and `graph.ts`
- [ ] Light and dark themes; responsive down to 1024px, with read-only views below that
- [ ] `vercel.json` with SPA fallback; README covering env vars, mock mode, CORS vs proxy, and how to capture real
      fixtures (`curl` the backend endpoints into `src/api/mock/fixtures`)
- [ ] `npm run build` succeeds with zero TypeScript errors

Prioritise information architecture, correctness against this contract, and polish over extra features.
