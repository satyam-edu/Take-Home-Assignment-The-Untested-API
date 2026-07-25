# Submission Notes: The Untested API

## 1. Overview & Architecture Choices

The existing architecture (Express routes → service layer → in-memory array, with a separate
validators module) was left as-is — it's a clean enough separation of concerns for the scope of
this assignment, so no restructuring was done beyond what was asked.

**Test coverage:** the suite in `task-api/tests/` (unit tests for `taskService.js`, integration
tests for every route via Supertest) covers **94.8% statements / 88.2% branches / 94.3% lines**
across `src/`, well above the 80% target. `npm run coverage` reproduces this locally.

**Bug fixes & documented bugs:** three bugs were found by writing tests against the documented
API contract rather than against the code's actual behavior — each failing assertion pointed
directly at a real defect. Full detail (severity, file/line, root cause, recommended fix) is in
[BUG_REPORT.md](./BUG_REPORT.md). Summary:

- **Fixed:** pagination off-by-one in `getPaginated` (`taskService.js`) — `offset` was computed
  as `page * limit` instead of `(page - 1) * limit`, so page 1 skipped the first page's worth of
  results entirely.
- **Documented, not fixed** (per the assignment's "fix one bug" scope): `getByStatus` uses
  substring matching (`.includes()`) instead of strict equality, and `completeTask` silently
  resets `priority` back to `'medium'` on completion.

**`PATCH /tasks/:id/assign` design decisions:**

- **Re-assignment is allowed.** Nothing in the spec treats assignment as a one-time action, and
  every other mutation endpoint in this API (`PUT`, `completeTask`) already allows repeated
  changes — blocking re-assignment would be an inconsistent, unrequested restriction. Covered by
  an explicit test (`allows reassigning an already-assigned task`).
- **Strict validation:** `assignee` must be a string and non-empty after trimming; whitespace-only
  values (`"   "`) are rejected as if empty, and the stored value is the trimmed string, not the
  raw input — this avoids leading/trailing-whitespace variants of the same name being treated as
  different assignees.
- **Error codes match the rest of the API:** body validation failures return `400` with
  `{ error: "Assignee must be a non-empty string" }`, unknown task IDs return `404` with
  `{ error: "Task not found" }` — mirroring the existing `PUT`/`DELETE`/`complete` handlers so the
  API stays consistent rather than introducing a new error shape for one endpoint.

## 2. What I'd Test Next With More Time

- **Concurrent request handling / race conditions** on the in-memory store — e.g. two simultaneous
  `PATCH .../complete` and `PATCH .../assign` calls on the same task, or concurrent `DELETE` +
  `PUT` racing on the same ID, to see whether the array-based store can produce lost updates.
- **Load / stress testing** under high throughput to understand how the linear `find`/`findIndex`
  scans over the in-memory array degrade as the task count grows, and where a real index or
  database would become necessary.
- **Property-based testing** for validator edge cases — special characters and emoji in `title`/
  `assignee`, non-UTF8 or extremely long strings, deeply nested or oversized JSON payloads, and
  boundary values for `page`/`limit` (negative numbers, `0`, non-numeric strings, floats).

## 3. Surprises in the Codebase

- `completeTask` silently resets `priority` to `'medium'` instead of leaving the task's existing
  priority untouched — a `high`-priority task quietly loses that signal the moment it's marked
  done, which seems like an unintentional side effect rather than a deliberate business rule.
- `getByStatus` filters using `String.prototype.includes()` rather than strict equality, so a
  filter value that's a substring of a real status (e.g. `?status=progress`) silently returns
  `in_progress` tasks it shouldn't match — an easy oversight that only surfaces once you test
  filter values the route doesn't otherwise validate.

## 4. Questions I'd Ask Before Shipping to Production

- **Persistence layer:** what database is this moving to (PostgreSQL, MongoDB, something else)?
  That choice affects whether the current service-layer function signatures can stay the same or
  need to become async/transactional, and how pagination/filtering should be pushed down to the
  query layer instead of done in memory.
- **Auth & authorization:** how will authentication be handled (JWT, session, OAuth), and once
  `assignee` exists, should task visibility/editing be scoped so users only see or modify tasks
  assigned to them — or is this still an internal/admin-only tool for now?
- **Rate limiting & logging:** what's the expected production logger (Winston, Pino, something
  else already standardized elsewhere), and are there rate-limiting rules expected on write
  endpoints (`POST`, `PUT`, `PATCH`, `DELETE`) to protect the service under abusive or accidental
  high-throughput traffic?
