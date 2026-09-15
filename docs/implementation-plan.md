# ProcLenz Implementation Plan

Audit date: 2026-09-15. This plan is based on reading every file in the repository, running the
existing test suite, and starting the infrastructure. It is updated as milestones land; the
authoritative status lives in [`progress.md`](../progress.md).

---

## 1. Current architecture (as found)

```
             REST (/api/v1)
                  |
   +--------------+---------------+
   |              |               |
EventController CaseController AnalyticsController
   |              |               |
EventService  CaseTimelineService ProcessAnalyticsService
   |              |               |
   +------ ProcessEventRepository (Spring Data JPA) ------+
                  |
          PostgreSQL 16 (Flyway V1: process_events)
```

- **Build:** Maven Wrapper 3.9.16, Spring Boot 4.1.1 (Spring Framework 7.0.9, Hibernate 7.4.5,
  Jackson 3.1.5, Flyway 12.4), `java.version=21`.
- **Packaging:** package-by-feature modular monolith: `event`, `process`, `analytics`, `common`.
- **Persistence:** single table `process_events` with a SHA-256 `event_identity` unique constraint
  and three composite indexes. `ddl-auto: validate`, `open-in-view: false`.
- **Infrastructure:** `docker-compose.yml` with PostgreSQL 16 only.

## 2. Existing functionality

| Capability | State |
|---|---|
| `POST /api/v1/events` single ingestion with Bean Validation | Works (201 new / 200 duplicate) |
| `POST /api/v1/events/batch` with per-item results | Works, per-event transaction |
| Deterministic idempotency (SHA-256 fingerprint + unique constraint) | Works for sequential and racing requests |
| `GET /api/v1/cases/{caseId}/timeline` | Returns ordered items with deltas |
| Variants, rework, SLA, bottlenecks, graph endpoints | Implemented in one 70-line service |
| Flyway V1 schema | Present |
| Tests | 2 tests (context load on H2, one analytics unit test) — **baseline: 2/2 pass, BUILD SUCCESS** |

## 3. Current gaps (code-level findings)

### Correctness
1. **Malformed JSON returns HTTP 500.** `@ExceptionHandler(Exception.class)` pre-empts Spring's
   default resolver, so `HttpMessageNotReadableException`, type mismatches (`?sla=abc`) and unknown
   routes all become `INTERNAL_ERROR`. Unexpected exceptions are also swallowed without logging,
   which makes production troubleshooting impossible.
2. **Duplicate detection by exception type is too broad.** Any `DataIntegrityViolationException`
   (e.g. a future NOT NULL or length violation) is reported as `DUPLICATE`.
3. **Timestamp precision hole in idempotency.** The fingerprint hashes nanosecond `Instant`s, but
   PostgreSQL `timestamptz` stores microseconds. Data read back from the DB no longer hashes to its
   stored identity, which also breaks checksum-based migration validation.
4. **Non-deterministic ordering for simultaneous events.** Tie-break is a random UUID, not arrival order.
5. `@Valid` on `EventService.ingest` has no effect (class is not `@Validated`).

### Analytics quality
6. **Bottlenecks rank by average wait only** — the "slowest activity" anti-pattern.
7. **Graph edge percentage is share of all transitions,** not share of the source's outgoing flow,
   so the "Created → Approved 98%" reading is impossible. No start/end nodes, no case coverage.
8. Variants have no stable ID; SLA threshold is hard-coded (`PT4H`) in the controller.
9. Rework counts repeats but not loops (`Inventory Check → Rework Required → Inventory Check`) or time lost.
10. No summary/insight layer — the pipeline stops at metrics, not operational insight.

### Scalability
11. Analytics loads **every event of a process as managed JPA entities** into memory. `bottlenecks()`
    scans the table twice, `graph()` twice. Memory is O(events) plus persistence-context overhead.
12. Batch ingestion: `List<EventRequest>` materialises the whole body; each event costs an `exists`
    query, an insert, a flush and a commit. No batch size limit, no processing-time tracking.

### Missing capabilities
13. Datasets (CSV), processes registry/SLA config, case listing with pagination/filtering.
14. Kafka, Redis, Spring Security/RBAC, custom metrics, correlation IDs, structured logging.
15. Migration subsystem, fault injection, benchmarks, CI.

### Testing and hygiene
16. Tests run on **H2 with `create-drop`**, so they validate neither the Flyway schema nor PostgreSQL
    semantics (a unique violation aborts a PG transaction; H2 does not).
17. `bin/` is a stale Eclipse output copy (sources + `.class` files) and must not be committed.
18. README mixes an early planning conversation ("ProcessPulse") with product documentation.
19. Local environment: `JAVA_HOME` points to a removed JDK 17; only JDK 25 is installed
    (compiles fine with `--release 21`).

## 4. Target architecture

Modular monolith that evolves; no service is split until a measured need exists.

```
                          Clients (curl / demo script / future UI)
                                        |
                        Spring Security (Basic / JWT, RBAC) + Correlation-ID filter
                                        |
   +-------------+--------------+-------+--------+---------------+----------------+
   |             |              |                |               |                |
 Event API   Dataset API     Case API      Analytics API    Migration API   Fault API (dev/test)
   |             |              |                |               |
   |  sync       | streaming    |                |               |
   |  path       | CSV reader   |           AnalyticsCache       |
   |             |              |           (Redis, optional)    |
   +---> EventWriter (chunked JDBC, ON CONFLICT DO NOTHING) <----+-- MigrationRunner
   |             ^                               |                   (extract/transform/
   | async       |                               v                    transfer/validate)
   +--> Kafka ---+ EventConsumer         ProcessMiningEngine              |
      (keyed by    (batch, retry,        (pure Java, single pass:     legacy on-prem DB
       process|case) DLQ)                 variants, rework, SLA,       (separate PostgreSQL)
                                          bottlenecks, graph, insights)
                                        |
                              PostgreSQL (Flyway-owned schema)
```

### Key design decisions
- **One write path for every channel.** REST single, REST batch, CSV datasets, Kafka consumer and
  migrations all go through `EventWriter`: chunked JDBC `INSERT … ON CONFLICT (event_identity) DO
  NOTHING RETURNING`. Idempotency becomes a single atomic statement enforced by the database, not an
  exception-driven check-then-insert.
- **JPA where lifecycle matters, JDBC where volume matters.** `Dataset`, `ProcessDefinition`,
  `MigrationJob` are JPA entities with state transitions. The append-only event firehose uses JDBC
  batch writes and streaming reads; Hibernate still maps and validates `ProcessEvent` for timelines.
- **Pure analytics engine.** `analytics.engine` has no Spring or JPA types. It consumes an ordered
  stream of cases in one pass with bounded memory (aggregates + per-case durations) and produces an
  immutable snapshot; every API view is a projection of it. Fully unit-testable.
- **Chunk checkpoints + idempotency = resumable jobs.** Dataset and migration chunks commit rows and
  progress counters in the same transaction.
- **Optional dependencies degrade, never break.** Redis down means cache bypass; Kafka down means
  the async endpoint returns 503 while sync ingestion keeps working.

### Domain model
| Concept | Representation |
|---|---|
| ProcessEvent | Entity + `process_events` row (append-only) |
| Process | `ProcessDefinition` entity (`processes` table: key, name, SLA threshold) |
| Case | `CaseTrace` value object reconstructed from ordered events (duration, sequence, loops) |
| Activity | Graph node / activity statistics (derived) |
| ProcessVariant | `VariantStats` with deterministic ID = hash of the activity sequence |
| Dataset | Entity: first-class ingestion unit with counts, status, duration, rejections |
| IngestionBatch | `BatchIngestionResult` returned by batch endpoints (accepted/duplicates/rejected/duration) |
| ProcessMetric | Process summary metrics (derived, cached) |
| ProcessInsight | Deterministic rule-based insights with severity and evidence (derived) |
| MigrationJob | Entity with phase status, counters, checkpoint, validation report |

## 5. Incremental implementation plan

Every milestone: compile → test → fix → commit. Commits follow `type(scope): summary`.

### Phase 1 — Core backend
| # | Milestone | Commit |
|---|---|---|
| 0 | Import existing foundation as-is, ignore `bin/` | `chore: import existing ProcLenz foundation` |
| 1 | Baseline benchmark of existing ingestion/analytics (real numbers, kept for before/after) | `perf: add dependency-free benchmark tool` |
| 2 | Error handling: consistent `ApiError` with path/traceId, 400/404/405/415/503 mapping, logging | `feat(common): consistent API error model` |
| 3 | Schema V2: `ingest_seq`, `content_hash`, `source_event_id`, `dataset_id`, `ingested_at`, processes, datasets | `feat(db): evolve event schema for datasets and idempotency` |
| 4 | Idempotency v2 + `EventWriter` (micros normalisation, producer event ID, payload conflict = 409) | `feat(event): idempotent chunked event writer` |
| 5 | Streaming batch endpoint (JSON array + NDJSON, bounded memory, capped rejection list) | `feat(event): streaming batch ingestion` |
| 6 | Case timeline v2 (ms deltas, duration, variant, rework flags, 404) + paginated case list | `feat(process): case timeline and case listing` |
| 7 | Process mining engine: case traces, variants, rework loops, waiting time, bottleneck score, SLA, graph, summary, insights | `feat(analytics): single-pass process mining engine` |
| 8 | Process registry + configurable SLA | `feat(process): process registry with SLA configuration` |
| 9 | Dataset ingestion (streaming CSV, async job, checkpoints, rejections) | `feat(dataset): streaming CSV dataset ingestion` |
| 10 | Demo order-to-cash dataset with intentional patterns | `feat(demo): order-to-cash demo dataset` |
| 11 | Testcontainers PostgreSQL integration tests replacing H2 (failsafe `*IT`) | `test: PostgreSQL integration coverage` |

### Phase 2 — Production backend
| # | Milestone |
|---|---|
| 12 | Kafka: topic keyed by `process|case`, async ingestion (202), batch consumer, idempotent writes |
| 13 | Failure classification: poison → DLQ immediately; transient DB errors → unbounded backoff; unknown → bounded retries then DLQ |
| 14 | Redis cache-aside for analytics views with generation-based invalidation after commit; Redis optional |
| 15 | Spring Security: ADMIN > ANALYST > VIEWER hierarchy, users/secrets from environment, JSON 401/403 |
| 16 | Observability: correlation IDs (HTTP + Kafka headers), ECS structured logs, Micrometer metrics, Prometheus endpoint |
| 17 | Testcontainers for Kafka and Redis |

### Phase 3 — Enterprise differentiators
| # | Milestone |
|---|---|
| 18 | Graph polish (start/end nodes, outgoing %, rework edges, p95) |
| 19 | Migration subsystem: legacy on-prem PostgreSQL → extract/transform/transfer, checkpoints, resume, rollback |
| 20 | Migration validation: counts, order-independent checksums, uniqueness, timestamp sanity, key consistency |
| 21 | Fault injection (dev/test profiles only): DB latency, consumer crash, duplicates, malformed, delay, migration corruption |
| 22 | Benchmarks at 10K / 100K / 1M events, EXPLAIN-driven optimisation, before/after |
| 23 | CI (GitHub Actions: unit + integration), final docs, interview handbook, demo script, architecture review |

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Dev machine RAM (15.6 GB total, <1 GB free at audit) | Kafka + PG + Redis + app + Testcontainers may swap | Single KRaft broker with capped heap, alpine images, singleton test containers, unit tests need no Docker |
| New major versions (Boot 4, Jackson 3, Spring Kafka 4, Security 7) | Moved packages, sparse examples | Verify APIs against jars in the local repository; compile after each step |
| JDK 25 locally vs Java 21 target | Accidental post-21 API use | `--release 21` via `java.version`; CI on JDK 21 |
| Laptop + Docker Desktop/WSL2 benchmarks | Not production-representative | Record environment; report measured numbers and relative change only |
| Fingerprint excludes dataset | Re-uploads dedupe (intended); two genuinely distinct identical events collapse | Producer `eventId` takes precedence; documented |
| In-process async jobs | App crash leaves jobs mid-flight | Chunk checkpoints committed with rows; startup marks interrupted jobs; idempotent replay |
| Cache staleness | Analytics briefly stale | Generation keys invalidated after commit; TTL bound; documented |
| Kafka duplicates | Double counting | Application-level idempotency; never claim exactly-once |
| Scope size | Half-finished features | Phase gates: green build + commit per milestone; no placeholder endpoints |

## 7. Testing strategy

- **Unit tests (no Spring, no Docker, `*Test`, surefire):** process mining engine (durations,
  variants and IDs, rework loops, waiting time, bottleneck scoring, SLA resolution, graph, insights),
  percentiles, event fingerprinting and normalisation, CSV parsing and timestamp formats, migration
  transformer and checksum accumulator, Kafka failure classification.
- **Integration tests (`*IT`, failsafe, Testcontainers):** REST → service → PostgreSQL through
  MockMvc against the real Flyway schema: ingestion status codes, duplicate replay, payload conflict,
  **concurrent duplicate submissions produce exactly one row**, partial batch failure, timeline
  ordering and 404, dataset upload lifecycle, analytics over a known dataset, security matrix, cache
  hit/miss and invalidation (Redis container), Kafka consume → persist, DLQ, redelivery idempotency
  (Kafka container), migration success and checksum-failure paths (second PostgreSQL database).
- **Not tested:** getters, framework behaviour, trivial DTOs.
- **Commands:** `./mvnw test` (fast, no Docker) and `./mvnw verify` (everything).
