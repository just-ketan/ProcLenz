# Progress

Last updated: 2026-09-15. Plan and rationale: [docs/implementation-plan.md](docs/implementation-plan.md).

**Where we stopped:** Phase 1 is roughly two thirds done. Event ingestion, idempotency, error handling,
the process mining engine, analytics API, case timeline and case list are implemented, tested against
real PostgreSQL and committed. Next up is the process registry with configurable SLA (milestone E).

---

## DONE

| Commit | Milestone | What it delivered |
|---|---|---|
| `ce64cb7` | Import | Existing foundation committed as found; stale `bin/` (Eclipse output copy) ignored |
| `1b29933` | Audit | `docs/implementation-plan.md`: architecture, gaps (with code-level findings), target design, risks, test strategy |
| `904c822` | Fix | JVM pinned to UTC. The app could not start: Windows JVM sends `Asia/Calcutta`, which the Debian 13 `postgres:16` image rejects |
| `66ed870` | Benchmark tool | `tools/benchmark/ProclenzBench.java`: dependency-free load generator (order-to-cash synthetic cases), p50/p95/p99 |
| `8b910c3` | Engine | `analytics.engine`: framework-free single-pass miner, variants (stable IDs), rework loops, bottleneck scoring, SLA, graph, insights |
| `756980c` | Test infra | H2 replaced by Testcontainers PostgreSQL; `*Test` = unit (surefire), `*IT` = integration (failsafe) |
| `ac41553` | Errors | Consistent `ApiError` (timestamp, status, code, message, path, traceId); fixed 500s for client errors; correlation IDs; datasource via env vars |
| `be8c706` | Ingestion v2 | Flyway V2; one idempotent JDBC chunk writer (`ON CONFLICT DO NOTHING RETURNING`); producer event ID or content fingerprint; 409 on reused IDs; streaming JSON/NDJSON batches |
| `3303658` | Analytics API | Engine wired to a JDBC stream; `/summary`, `/variants`, `/rework`, `/bottlenecks`, `/sla`, `/graph`, `/insights`; timeline v2; paginated case list |
| `fa5a96d` | Docs | This file; `docs/reliability.md` (idempotency, concurrent duplicates, partial batch failures, failure classes) |
| `docs: frontend prompt` | Frontend contract | `docs/frontend-lovable-prompt.md`: Lovable build prompt mirroring the exact v1 API: available vs planned endpoints, TypeScript types, allowed derived metrics, capability gating |

### Endpoints working now

```
POST /api/v1/events                         single event: 201 new | 200 duplicate | 409 reused eventId | 400
POST /api/v1/events/batch                   JSON array or application/x-ndjson, streamed, per-item rejections
GET  /api/v1/events/{id}
GET  /api/v1/cases/{caseId}/timeline?processKey=
GET  /api/v1/processes/{key}/cases?page&size&sort=durationMs|startedAt|caseId|eventCount&direction&minDurationMs&variantId
GET  /api/v1/processes/{key}/summary?sla=P2D
GET  /api/v1/processes/{key}/variants?sla&page&size
GET  /api/v1/processes/{key}/rework?loops=
GET  /api/v1/processes/{key}/bottlenecks?limit=
GET  /api/v1/processes/{key}/sla?threshold=PT8H&worst=
GET  /api/v1/processes/{key}/graph
GET  /api/v1/processes/{key}/insights?sla=
```

### Key design decisions already made (do not re-litigate)

- **One write path:** every channel (REST, batch, later CSV/Kafka/migration) goes through `EventWriter`.
  The unique constraint on `event_identity` is the only duplicate authority.
- **JPA for entities with lifecycle** (future `Dataset`, `ProcessDefinition`, `MigrationJob`); **JDBC for the
  append-only event log** (bulk writes, streaming reads). `ProcessEvent` is `@Immutable`, used for timeline/lookup.
- **Identity:** `eventId` scoped per process if supplied, otherwise SHA-256 of canonical content
  (trimmed, microsecond timestamps, `|` escaped). The dataset is deliberately excluded. V1 hashes preserved.
- **Bottleneck score:** `impact = waitShare × (1 + tailVolatility)`, normalised to 100; severity from absolute
  waitShare (HIGH ≥ 20%, MEDIUM ≥ 10%). Waiting time = gap since previous event (single-timestamp events).
- **Analytics are computed per request** from one read-only transaction; Redis caching comes in Phase 2.
- **Flyway owns the schema**, `ddl-auto: validate`. Never edit an applied migration; add `V3+`.

---

## IN PROGRESS

Nothing uncommitted. The working tree is clean after the latest commits.

---

## NEXT

### Phase 1 (remaining)

**E. Process registry and configurable SLA**
- Flyway `V3`: `processes(process_key PK, display_name, sla_threshold_ms NULL, created_at, updated_at, version)`;
  backfill `INSERT ... SELECT DISTINCT process_key FROM process_events`; FK `process_events.process_key → processes`.
- Auto-register keys inside `EventWriter` per chunk (`INSERT ... ON CONFLICT DO NOTHING`, same transaction).
- `GET /api/v1/processes` (list with event/case counts), `GET /api/v1/processes/{key}`,
  `PUT /api/v1/processes/{key}/sla` with `@Version` optimistic locking (ETag / If-Match → 412).
- `SlaPolicy` precedence becomes request → process → default (`SlaThreshold.Source.PROCESS` already exists).

**F. Dataset ingestion (CSV)**
- Flyway `V4`: `datasets` (id UUID, name, process_key, status, received/accepted/duplicate/invalid counts,
  case_count, started_at, completed_at, duration_ms, error), `dataset_rejections` (capped), and
  `process_events.dataset_id` with FK + partial index.
- `POST /api/v1/datasets` (multipart CSV + name, processKey, optional column mapping and timezone for local
  timestamps) → `202 Accepted` + `Location`; `GET /api/v1/datasets/{id}` shows live progress and final stats.
- Stream rows (Jackson CSV is managed by the Boot BOM; verify the Jackson 3 artifact), reuse
  `EventNormalizer` + `EventService.writeChunk`, update dataset counters in the **same chunk transaction**
  (checkpoint). Bad header → `400 MALFORMED_DATASET`. On startup, mark stuck `PROCESSING` datasets `INTERRUPTED`.
- Add the `dataset_id` column to `EventWriter`'s insert.

**G. Demo dataset.** An order-to-cash CSV in `demo/` with a normal flow, slow inventory, approval bottleneck,
rework, skipped credit check, SLA violations and duplicate rows. A demo script covers brief section 26.

**H. Phase 1 docs and report.** Rewrite `README.md`, `docs/api.md`, `docs/architecture.md`; add `docs/database.md`
(indexes vs query patterns, V1–V4 decisions). Then produce the Phase 1 report (what changed, tests, tradeoffs).

### Frontend integration (backend work the frontend depends on)
- The frontend contract lives in `docs/frontend-lovable-prompt.md` and mirrors the Java response records field by field.
  Update it whenever an endpoint, parameter or record changes.
- CORS for the Vercel origin (allowed origins from an environment variable), exposing
  `X-Correlation-Id, Location, ETag, Retry-After`. Alternatively the frontend proxies through Vercel rewrites.
- Health details (`management.endpoint.health.show-details`, restricted once security exists) so the
  frontend can show `db`/`diskSpace` component status.
- Dataset field names in the prompt (`rowsRead`, `acceptedEvents`, `duplicateEvents`, `invalidRows`) and the
  process registry shape are provisional; align the prompt when milestones E and F land.

### Phase 2 (design already chosen, see implementation plan section 5)
Kafka (topic keyed by `processKey|caseId`; batch listener; poison → DLQ at once, transient DB errors → unbounded
backoff, unknown → bounded retries then DLQ; idempotency via `EventWriter`) · Redis cache-aside with
generation keys invalidated after commit, optional · Spring Security (ADMIN > ANALYST > VIEWER, users from env,
JSON 401/403; override `org.springframework.boot.webmvc.error.DefaultErrorAttributes` for filter-level errors) ·
Micrometer metrics + Prometheus · ECS structured logs · correlation ID into Kafka headers.

### Phase 3
Migration subsystem (legacy on-prem PostgreSQL → extract/transform/transfer/validate; chunk checkpoints;
order-independent checksums; resume/rollback) · profile-gated fault injection · benchmarks at 10K/100K/1M
(including before/after of a covering index) · CI · final docs and interview handbook.

---

## TEST STATUS

| Suite | Result | Notes |
|---|---|---|
| Unit (`./mvnw test`) | **56 passed, 0 failed** | Engine, identity, normaliser, exception handler, assembler |
| Integration (`./mvnw verify`) | **37 passed, 0 failed** | Testcontainers `postgres:16` |

Integration detail: the last full run passed 35/37. The 2 failures were wrong expectations in
`AnalyticsIT` (slow-approval cases share the happy path's activity sequence, so there are 3 variants, not 4).
After correcting the test, `AnalyticsIT` was re-run alone: 7/7 passed. Main code was unchanged between the
two runs. **First thing next session: run `clean verify` once to reconfirm everything is green at HEAD.**

Notable verified behaviours: 16 concurrent submissions of one event persist exactly one row; a malformed JSON
stream keeps its committed prefix; the variant ID computed in SQL equals the engine's; the brief's
ORD-1001 example yields `durationMs = 8400000`.

### Baseline benchmark (before the ingestion rewrite, measured, not estimated)

Existing JPA per-event-transaction code, packaged jar, `-Xms512m -Xmx1g`, WSL2 Ubuntu 26.04, 12 vCPU,
7.7 GB RAM (WSL), OpenJDK 21.0.12, PostgreSQL 16.15 in Docker 29.6.1. Workload: 10,000 events, batches of
500, 4 concurrent clients.

| Measure | Result |
|---|---|
| Ingestion throughput | 486.1 events/s |
| Batch (500) latency | p50 3910 ms · p95 6374 ms · p99 6381 ms |
| Analytics p50 (10K events) | variants 85 · rework 73 · bottlenecks 131 · sla 69 · graph 105 ms |

The "after" measurement for the new ingestion path has **not** been run yet (Phase 3 benchmarks).

---

## HOW TO RUN (this machine)

Docker runs as the **snap Docker engine inside WSL** (`Ubuntu-26.04`), not Docker Desktop. Build and test
inside WSL, where JDK 21 and the Docker socket are available:

```bash
wsl -d Ubuntu-26.04
cd /mnt/c/Users/ketan/Desktop/Projects/ProcLenz
export PATH=/snap/bin:$PATH
./mvnw clean verify                   # unit + integration tests
docker compose up -d postgres         # local database (already running as proclenz-postgres)
./mvnw -DskipTests package && java -jar target/proclenz-0.0.1-SNAPSHOT.jar
java tools/benchmark/ProclenzBench.java ingest --events 10000 --process bench
```

---

## KNOWN ISSUES AND NOTES

- **Docs are stale:** `README.md`, `docs/api.md` and `docs/architecture.md` still describe the pre-refactor API,
  and the README still contains the original planning notes. Rewrite in milestone H.
- **Environment gotchas:**
  - Windows `JAVA_HOME` points to a removed JDK 17. Windows only has JDK 25; use WSL (JDK 21).
  - In non-interactive WSL shells, `docker` resolves to the Docker Desktop shim; prepend `/snap/bin` to `PATH`.
  - From Git Bash, `wsl.exe -- <cmd>` expands `$VARS` in an extra shell layer. Run `wsl.exe -e bash script.sh` instead.
  - Always use `clean` after deleting or renaming classes. Stale `.class` files in `target/` are picked up by surefire.
- **Local dev database** (`proclenz-postgres` in WSL) contains test rows created during the audit: process keys
  `audit` (1), `baseline` (10,000) and `baseline-wsl` (10,000). Safe to delete. On next app start Flyway applies V2 to it.
- **Docker Desktop leftovers** from the audit (it was started by mistake, then stopped): an unused volume
  `proclenz_proclenz-postgres-data` and pulled images `apache/kafka:4.1.0` and `redis:7.4-alpine` exist in
  Docker Desktop, **not** in WSL Docker. Pull them in WSL for Phase 2.
- **Benchmark generator spacing:** cases are 7 minutes apart from 2026-01-05. Runs of roughly 100K+ events produce
  future timestamps that the new 24h clock-skew rule rejects. Compress spacing before large benchmarks.
- `git` prints LF/CRLF warnings (`core.autocrlf=true`). Harmless; optionally add `* text=auto eol=lf` to `.gitattributes`.
- `docs/implementation-plan.md` lists milestones in planned order; actual commits landed engine-first. Content is still accurate.

---

# Original notes

# ProcLenz

## Phase 1 : bulding an Enterprize process mining & intelligence Backend
the capabilities revolve around
```ymal
Event ingestion
      ↓
PostgreSQL
      ↓
Hibernate/JPA
      ↓
Process reconstruction
      ↓
Process analytics
      ↓
REST APIs
```

so the current system has progressed into being `awake` with postgres on docker

```yaml
Spring Boot
    ↓
JPA / Hibernate
    ↓
HikariCP
    ↓
PostgreSQL JDBC Driver
    ↓
localhost:5432
    ↓
Docker PostgreSQL
    ↓
✅
```
