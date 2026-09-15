# Reliability

How ProcLenz behaves when inputs are wrong, repeated, or arrive while something is broken. Every
behaviour described here is covered by an automated test, named where relevant.

## 1. Duplicate events and idempotency

### Why duplicates happen

Duplicates are normal in enterprise integration, not an edge case:

| Source of duplicates | Example |
|---|---|
| Client retry after a lost response | Server committed the event, the HTTP response timed out, the producer sends it again |
| Batch resubmission | A batch failed halfway; the documented recovery is to resend the whole batch |
| Overlapping extracts | A nightly export window overlaps the previous one by an hour |
| Re-uploaded files | The same CSV is uploaded twice by different people |
| At-least-once transports | A message broker redelivers after a consumer crashed before committing its offset |
| Multiple integrations | Two connectors forward the same source-system event |

If duplicates were stored, every metric would silently drift: activity frequencies inflate, loops
appear that never happened (`Approved → Approved` looks like rework), and waiting times shrink.

### How a duplicate is recognised

Each event gets a deterministic **identity** (`EventIdentity`):

```
contentHash = SHA-256( processKey | caseId | activity | occurredAt | resource )
identity    = contentHash                                        no producer event ID
            = SHA-256( "event-id" | processKey | producerEventId )  producer supplied "eventId"
```

- **Producer ID first.** When the source system has a real event ID, it is the most reliable key.
  It is scoped to the process, so two systems may reuse the same ID in different processes.
- **Content fingerprint otherwise.** The same business occurrence always produces the same hash.
- **Canonical form before hashing** (`EventNormalizer`): fields are trimmed, blank optionals become
  absent, and timestamps are truncated to microseconds. PostgreSQL `timestamptz` stores microseconds;
  hashing nanoseconds would make a value read back from the database hash differently from the value
  originally submitted. (The original implementation had exactly this bug.)
- **The dataset or upload is deliberately not part of the key.** The same event uploaded in two files
  is one event, not two. Trade-off: two genuinely distinct events with identical case, activity,
  timestamp and resource collapse into one. Producers that can emit such events must send `eventId`.
- **Delimiter escaping.** `|` and `\` inside fields are escaped, so `caseId="A|x", activity="y"` cannot
  collide with `caseId="A", activity="x|y"`. Values without those characters hash exactly as in the
  first schema version, so rows stored before the upgrade still deduplicate.

### How the database enforces uniqueness

`process_events.event_identity` carries a unique constraint (`uk_event_identity`). Every ingestion
channel writes through one statement per chunk (`EventWriter`):

```sql
INSERT INTO process_events (...)
SELECT ... FROM unnest(?::text[], ...) AS incoming(...)
ON CONFLICT (event_identity) DO NOTHING
RETURNING event_identity
```

Identities returned were inserted; identities not returned already existed. The constraint is the
only authority. The application never decides "this is new" on its own.

Alternatives that were rejected:

| Approach | Why not |
|---|---|
| In-memory `HashSet` of seen identities | Not shared between instances, lost on restart, unbounded memory |
| `SELECT` then `INSERT` | Race window: two requests both see "absent" and both insert |
| `INSERT` and catch the unique-violation exception | In PostgreSQL the exception aborts the whole transaction, so each event needs its own transaction; it also misclassifies other integrity errors as duplicates (the original code did this) |

### Replayed producer IDs with different content

If a producer reuses an `eventId` for a different payload, silently ignoring it would lose data.
The writer compares the stored `content_hash` with the new one:

| Situation | Outcome | HTTP (single event) |
|---|---|---|
| New identity | `ACCEPTED` | `201 Created` with `Location` |
| Same identity, same content | `DUPLICATE` | `200 OK`, returns the original `eventId` |
| Same producer `eventId`, different content | `CONFLICT` | `409 EVENT_ID_CONFLICT` |

A duplicate returns 200, not 409, because the client's intent (this event is stored) is already
satisfied. Treating a retry as an error would push every producer to write special-case handling.

### Concurrent duplicate requests

Two transactions inserting the same identity at the same time:

1. Transaction A inserts the row; the unique index entry is visible but uncommitted.
2. Transaction B's insert on the same key **blocks** on A's index entry.
3. A commits: B's `ON CONFLICT DO NOTHING` inserts nothing and reports a duplicate.
   A rolls back instead: B's insert proceeds and B owns the row.

Exactly one row survives either way, under the default `READ COMMITTED` isolation, with no explicit
locks. A duplicate's follow-up `SELECT` of the original ID runs as a new statement, so it sees A's
committed row.

Verified by `EventIngestionIT.concurrentSubmissionsOfOneEventPersistExactlyOneRow`: 16 threads submit
the same event simultaneously, and the result is 1 `ACCEPTED`, 15 `DUPLICATE`, 1 stored row.

## 2. Partial batch failures

`POST /api/v1/events/batch` streams the body and commits every `chunk-size` events (default 500) in
its own transaction.

| Failure inside a batch | Behaviour | Test |
|---|---|---|
| One item fails validation | Item rejected with index, code and message; the rest continue | `BatchIngestionIT.invalidItemsAreRejectedIndividuallyWithoutFailingTheBatch` |
| One item has a wrongly typed field | Parser skips to the next item; item rejected as `MALFORMED_REQUEST` | same |
| Duplicate inside the same batch | First occurrence accepted, later ones counted as duplicates | same |
| JSON becomes syntactically invalid midway | Items before the error are committed; `400` with committed counts in `details` | `malformedJsonMidStreamKeepsTheProcessedPrefixAndReportsIt` |
| Database becomes unavailable midway | Committed chunks stay; `503` with `Retry-After` and counts in `details` | `ApiExceptionHandlerTest` |
| The whole batch is resubmitted | Nothing is written twice | `resubmittingTheSameBatchWritesNothingNew` |

The response invariant `received = accepted + duplicates + conflicts + rejected` holds for every
completed batch. The recovery instruction for any interrupted batch is always the same: resend all
of it. Idempotent writes turn "at-least-once" retries into exactly one stored copy.

## 3. Failure classification at the API boundary

Different failures need different reactions from the caller, so they are not all "errors".

| Class | Examples | Status | Should the caller retry? |
|---|---|---|---|
| Invalid input | Missing field, future timestamp, bad parameter | `400` | No. Fix the data |
| Malformed input | Invalid JSON, wrong field type | `400` | No |
| Not found | Unknown case, event, process, route | `404` | No |
| Conflict | Producer event ID reused for different content | `409` | No. Producer bug |
| Transient infrastructure | Database connection refused, pool exhausted, query timeout | `503` + `Retry-After` | Yes, with backoff; idempotency makes it safe |
| Unexpected | Programming error | `500`, generic message, full stack trace in the server log under the `traceId` | Report it with the `traceId` |

Error bodies never contain stack traces, SQL, class names or parser messages
(`ApiExceptionHandlerTest.unexpectedFailureNeverExposesInternalDetails`,
`ErrorHandlingIT.invalidFieldValueNamesTheFieldWithoutLeakingInternals`).
