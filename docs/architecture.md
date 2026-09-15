# Architecture

ProcLenz is deliberately a modular monolith. `event` owns write-side ingestion and idempotency, `process` reconstructs case timelines, and `analytics` derives read-side intelligence from ordered events. This keeps transactions and correctness simple before asynchronous infrastructure is justified.

The deterministic event identity is SHA-256 over normalized process key, case ID, activity, timestamp, and resource. The application checks it first for a friendly result; PostgreSQL's unique constraint is the concurrency-safe authority if two requests race. This gives domain-level effectively-once persistence without claiming distributed exactly-once delivery.

The `process_key, case_id, occurred_at` index serves timelines. `process_key, occurred_at` supports process scans by time. `process_key, activity` supports activity filtering/aggregation. `open-in-view` is disabled and read services are explicitly read-only transactions to avoid accidental lazy queries in controllers.
