# ProcLenz

ProcLenz is a Java 21/Spring Boot process-intelligence backend. It transforms immutable business events into case timelines, process variants, rework signals, SLA reports, bottleneck metrics, and a frontend-ready process graph.

## Run locally

```powershell
docker compose up -d postgres
.\mvnw.cmd spring-boot:run
```

The API is on `http://localhost:8080`; health is at `/actuator/health`.

## Quick demo

```bash
curl -X POST http://localhost:8080/api/v1/events -H "Content-Type: application/json" -d '{"processKey":"orders","caseId":"ORD-1001","activity":"Order Created","timestamp":"2026-09-15T09:00:00Z","resource":"system"}'
curl http://localhost:8080/api/v1/cases/ORD-1001/timeline?processKey=orders
curl http://localhost:8080/api/v1/processes/orders/graph
```

See [API documentation](docs/api.md) and [architecture notes](docs/architecture.md). PostgreSQL is the source of truth; Flyway owns the schema. Kafka, Redis, security, migrations, and benchmarks remain planned evolutionary phases rather than unsupported claims.

## Original roadmap

Exactly. **We should optimize for speed-to-working-system, not build every possible feature.** Then each phase doubles as interview preparation.

The Celonis JD gives us three major pillars: **Java/Spring/Hibernate backend**, **distributed/data-intensive systems**, and **reliability/enterprise engineering**. 

# ProcessPulse — 3-Phase Development Plan

### End goal

By the end, we should be able to confidently say:

> **“I built a production-style Java/Spring Boot microservices platform for enterprise process intelligence, using PostgreSQL/Hibernate, Kafka, Redis, security, observability and reliable event processing.”**

And more importantly, you should be able to **defend every line of it in a Celonis interview.**

---

# PHASE 1 — Core Backend + Process Intelligence

### Goal

**Get a complete working product ASAP.**

We don't touch Kafka, Kubernetes, fancy observability, etc. initially.

### Stack

```text
Java 21
Spring Boot
Spring Web
Spring Data JPA
Hibernate
PostgreSQL
Maven
JUnit
Docker
```

### Architecture

```text
                    Client
                      │
                      ▼
              ┌───────────────┐
              │ Spring Boot   │
              │ REST API      │
              └───────┬───────┘
                      │
            ┌─────────┴─────────┐
            ▼                   ▼
      Process Service      Analytics
            │                   │
            └─────────┬─────────┘
                      ▼
                 PostgreSQL
```

### Build

**1. Project foundation**

```text
processpulse/
├── pom.xml
├── src/
│   ├── main/java/
│   │   └── com/processpulse/
│   └── test/
├── docker-compose.yml
└── README.md
```

**2. Domain model**

```text
Process
Case
Event
Activity
ProcessVariant
```

**3. Hibernate/JPA**

We'll learn while implementing:

```text
@Entity
@Id
@GeneratedValue
@OneToMany
@ManyToOne
@OneToOne
```

Then:

* lazy/eager loading
* cascading
* transactions
* indexes
* pagination
* N+1 problem

**4. REST API**

```http
POST /api/events
POST /api/datasets

GET /api/processes
GET /api/processes/{id}

GET /api/cases/{caseId}
GET /api/cases/{caseId}/timeline

GET /api/analytics/bottlenecks
GET /api/analytics/variants
GET /api/analytics/sla
```

**5. Process engine**

Given:

```text
Case A

Created
Approved
Inventory
Shipped
Invoiced
Paid
```

produce:

```text
Created
   ↓
Approved
   ↓
Inventory
   ↓
Shipped
   ↓
Invoiced
   ↓
Paid
```

Then calculate:

```text
case duration
activity duration
transition frequency
waiting time
process variants
rework
SLA violations
```

### Interview track running alongside Phase 1

Every implementation topic gets its corresponding interview block.

For example:

**We're implementing `@Transactional` →**

learn:

```text
What is a transaction?
ACID
@Transactional
transaction propagation
isolation levels
rollback
```

**We're implementing Hibernate →**

learn:

```text
JPA vs Hibernate
Entity lifecycle
Persistence Context
First-level cache
Lazy vs eager
N+1
Dirty checking
```

**We're implementing REST →**

learn:

```text
REST
HTTP methods
GET vs POST vs PUT vs PATCH
HTTP status codes
DTOs
validation
exception handling
```

### Phase 1 Definition of Done

We should be able to:

```text
CSV/Event input
      ↓
Spring Boot
      ↓
Hibernate
      ↓
PostgreSQL
      ↓
Process reconstruction
      ↓
Analytics REST APIs
```

**Working end-to-end.**

---

# PHASE 2 — Distributed + Production Backend

Now we take the working monolith/modular backend and turn it into something much closer to an enterprise system.

### New stack

```text
Kafka
Redis
Spring Security
JWT
Docker
Testcontainers
Micrometer
Prometheus
Grafana
```

### Architecture

```text
                         Client
                           │
                           ▼
                    API / Gateway
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
      Ingestion Service             Query Service
             │                           │
             ▼                           ▼
           Kafka                       Redis
             │                           │
       ┌─────┴─────┐                     │
       ▼           ▼                     │
 Process Worker  Analytics Worker        │
       │           │                     │
       └─────┬─────┘                     │
             ▼                           │
          PostgreSQL ◄───────────────────┘
```

### We introduce asynchronous processing

Instead of:

```text
POST event
   ↓
process everything
   ↓
return response
```

we move to:

```text
POST event
   ↓
validate
   ↓
Kafka
   ↓
return 202 Accepted
   ↓
background processing
```

This gives us a serious distributed-systems discussion.

### Reliability

Implement:

```text
idempotency
retry
exponential backoff
dead-letter queue
duplicate detection
failure recovery
```

Example:

```text
Kafka
  ↓
Consumer
  ↓
Database ❌
  ↓
Retry
  ↓
Retry
  ↓
DLQ
```

### Redis

Cache expensive queries:

```text
GET /processes/{id}/analytics
```

instead of calculating everything every time:

```text
API
 ↓
Redis
 ↓ cache hit
Response
```

or:

```text
Redis miss
 ↓
PostgreSQL
 ↓
Analytics
 ↓
Redis
 ↓
Response
```

### Security

Implement:

```text
JWT authentication
        ↓
RBAC
 ┌──────┼──────┐
ADMIN ANALYST VIEWER
```

### Production engineering

Add:

```text
health checks
metrics
structured logs
request tracing
database monitoring
performance measurements
```

Then deliberately break things.

For example:

```text
Kill PostgreSQL
Kill Kafka
Inject duplicate events
Delay consumers
Send malformed events
Generate high traffic
```

and observe how the system behaves.

### Interview track

This phase becomes our **Spring Boot + Distributed Systems interview bootcamp**.

Topics:

```text
Spring Boot
Spring IoC
Dependency Injection
Bean lifecycle
@Component
@Service
@Repository
@Configuration
@Autowired
Spring Boot auto-configuration

Spring MVC
Filters
Interceptors
Exception handling
DTOs
Validation

Spring Data JPA
Hibernate
Transactions
Isolation
Optimistic/Pessimistic locking
Connection pools

Kafka
Partitions
Offsets
Consumer groups
Ordering
Delivery semantics
Exactly-once vs at-least-once

Redis
Caching
Cache invalidation
TTL
Cache-aside

Microservices
Service discovery
API Gateway
Load balancing
Fault tolerance
Circuit breakers

Security
JWT
Authentication
Authorization
RBAC
```

---

# PHASE 3 — Celonis-Level Engineering + Polish

This is the **interview differentiator** phase.

We're not adding random features.

We're adding things that answer:

> **"Can this person actually work on a large enterprise backend?"**

The JD specifically emphasizes product lifecycle ownership, reliability, security, dependency/standards updates, development automation, troubleshooting, and supporting on-prem customers migrating to cloud. 

So Phase 3 targets exactly that.

---

## 3.1 Process Intelligence Graph

Upgrade our process model.

Instead of simply:

```text
Event → Event → Event
```

build:

```text
                 ┌────────────┐
                 │  Approved  │
                 └─────┬──────┘
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
      Inventory Check         Rejected
             │                   │
             ▼                   │
         Shipment ◄──────────────┘
```

Nodes:

```text
activity
frequency
average duration
failure rate
```

Edges:

```text
transition count
average waiting time
p95 waiting time
SLA violation rate
```

This is our miniature **process intelligence graph**.

---

# 3.2 On-Prem → Cloud Migration

This is one of the strongest Celonis-specific additions.

Create:

```text
ProcessPulse On-Prem
        │
        │ migration
        ▼
ProcessPulse Cloud
```

Migration pipeline:

```text
Extract
   ↓
Validate
   ↓
Transform
   ↓
Batch Transfer
   ↓
Verify
   ↓
Checksum / Record Count
```

We should be able to discuss:

```text
schema compatibility
data consistency
versioning
backward compatibility
zero/low downtime migration
rollback
validation
```

---

# 3.3 Performance Engineering

Load-test the platform.

For example:

```text
10K events
100K events
1M events
```

Measure:

```text
requests/sec
event processing/sec
p50 latency
p95 latency
p99 latency
DB query latency
Kafka consumer lag
memory usage
CPU usage
```

Then actually optimize something.

Example:

```text
Before:
p95 = 850 ms

After indexing + caching:
p95 = 170 ms
```

That number becomes extremely valuable in interviews.

---

# 3.4 Failure Injection

Build a small internal fault-testing framework.

```text
Fault
 ├── DB unavailable
 ├── Kafka unavailable
 ├── Consumer crash
 ├── duplicate event
 ├── malformed event
 └── network delay
```

Then document:

```text
Fault
 ↓
Observed behavior
 ↓
Recovery mechanism
 ↓
Data consistency
 ↓
System availability
```

This connects beautifully with the JD's emphasis on reliability and troubleshooting. 

---

# 3.5 CI/CD + Developer Automation

Finally:

```text
git push
   ↓
GitHub Actions
   ↓
Build
   ↓
Unit tests
   ↓
Integration tests
   ↓
Docker build
   ↓
Security checks
```

We also document developer workflows:

```bash
./mvnw test
./mvnw spring-boot:run
docker compose up
docker compose down
```

---

# The learning strategy

This is the most important part.

**We don't separate "project development" and "interview preparation."**

We learn exactly what we need **30 minutes before implementing it.**

For example:

```text
TODAY

Learn:
Spring Boot DI
      ↓
Implement:
Service layer
      ↓
Interview:
"Explain Dependency Injection"
      ↓
Implement:
Tests
      ↓
Interview:
"How does Spring create beans?"
```

Next:

```text
Learn:
Hibernate Persistence Context
      ↓
Implement:
@Entity relationships
      ↓
Interview:
"JPA vs Hibernate?"
      ↓
Debug:
N+1 query
      ↓
Interview:
"What is the N+1 problem?"
```

Then:

```text
Learn:
Kafka consumer groups
      ↓
Implement:
Event processing
      ↓
Interview:
"What happens when a consumer dies?"
```

So by the end, **the project itself becomes our interview handbook.**

---

# Our 3-phase roadmap at a glance

```text
╔══════════════════════════════════════════════════════════╗
║                    PROCESSPULSE                          ║
╚══════════════════════════════════════════════════════════╝

PHASE 1
CORE BACKEND
──────────────────────────────────────────────────────────
Java 21
Spring Boot
REST
JPA/Hibernate
PostgreSQL
Process Mining Engine
Analytics
JUnit

                 ↓

PHASE 2
DISTRIBUTED BACKEND
──────────────────────────────────────────────────────────
Kafka
Redis
Microservices
Async processing
Retries
DLQ
Idempotency
JWT/RBAC
Docker
Observability

                 ↓

PHASE 3
ENTERPRISE ENGINEERING
──────────────────────────────────────────────────────────
Process Intelligence Graph
On-Prem → Cloud migration
Performance engineering
Load testing
Fault injection
Monitoring
CI/CD
Security hardening
Production documentation
```

## And our interview preparation runs through all 3

```text
                    CELONIS INTERVIEW
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
     JAVA / OOP       SPRING BOOT       SYSTEM DESIGN
          │                │                │
          │                │                │
       Phase 1          Phase 1          Phase 2
          │                │                │
          ▼                ▼                ▼
      Hibernate        REST/API        Microservices
          │                │                │
          ▼                ▼                ▼
     PostgreSQL        Security          Kafka
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                    Phase 3 Deep Dive
                           │
              Reliability / Scaling /
             Debugging / Architecture
```

### One rule for us

**We build first, learn exactly what blocks us, then immediately lock that knowledge into interview questions.**

No 200-hour Spring Boot course. No spending three days designing the perfect architecture before writing code.

**Working software → understand it → break it → fix it → defend it in an interview.**

That's the fastest route for this JD.
