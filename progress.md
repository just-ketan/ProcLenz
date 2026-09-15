# Progress

Completed Phase 1 foundation: PostgreSQL/Flyway schema, validated single and partial batch event ingestion, deterministic idempotency, case timelines, variants, rework, SLA, bottlenecks, graph projection, and analytics unit tests.

Planned next: streaming CSV dataset ingestion, Testcontainers PostgreSQL integration tests, then Kafka/Redis/security/observability as measured needs justify them.

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
