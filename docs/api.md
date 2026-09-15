# API

All routes are versioned under `/api/v1`.

`POST /events` accepts `processKey` (optional; defaults to `default`), `caseId`, `activity`, ISO-8601 `timestamp`, and optional `resource`. It returns `201 Created`; a duplicate returns `200 OK` with `status: DUPLICATE`.

`POST /events/batch` accepts an array of the same event objects. Each item is independently validated and persisted in its own transaction. The response reports accepted, duplicate, and invalid item counts, so valid items are never lost because a sibling is malformed.

`GET /cases/{caseId}/timeline?processKey=orders` returns ordered event sequence, time since the preceding event, and cumulative duration.

Analytics routes are `GET /processes/{processKey}/variants?sla=PT4H`, `/rework`, `/bottlenecks`, `/sla?threshold=PT4H`, and `/graph`. Durations are ISO-8601 durations.

Validation errors use `{ timestamp, status, code, message, fieldErrors }`.
