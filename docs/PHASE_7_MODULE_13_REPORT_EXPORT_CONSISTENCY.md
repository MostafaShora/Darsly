# Phase 7 Module 13 — Report Export Consistency (F8)

## Root cause and audit

The previous exports collected pages from the interactive attendance and finance
report endpoints. Those requests were independent reads, so a record update between
pages could create a mixed-time export without changing the reported row count.
The export loops also read the component's live Workspace ID for each page.

The export now uses one backend request and one MongoDB snapshot transaction. The
interactive report tables continue to use their existing paginated endpoints.

## Endpoint contract

`POST /api/workspaces/:workspaceId/reports/export`

The endpoint uses the existing JWT authentication and `requireWorkspaceAccess()`
middleware. The path Workspace is authorized by that middleware; the controller
passes the Workspace ID from `req.workspaceContext` to the report service. The
request body is only a report type and its filters:

```json
{
  "type": "attendance",
  "from": "2026-01-01T00:00:00.000Z",
  "to": "2026-01-31T23:59:59.999Z",
  "studentId": "valid-object-id",
  "groupId": "valid-object-id",
  "status": "present",
  "timezone": "Africa/Cairo"
}
```

The finance type accepts `from`, `to`, `studentId`, and `timezone`. A Workspace ID
in the body is ignored and is never used for authorization. Dates, timezone, IDs,
range order, report type, and attendance status are validated using the existing
report conventions.

Successful responses retain the existing attendance or finance report data shape.
Attendance includes the complete `items` array; finance includes the complete
`invoices`, `payments`, and `allocations` arrays. Existing report headings, columns,
date formatting, and browser HTML/print output are unchanged.

## Snapshot and Workspace behavior

The report export service starts one Mongoose session and runs all reads under one
`withTransaction()` configured with:

- `readConcern: { level: "snapshot" }`
- `readPreference: "primary"`
- `writeConcern: { w: "majority" }`

The transaction is read-only. Attendance filter validation, eligible Session
lookup, AttendanceRecord reads/counts, and Student/StudyGroup lookups all receive
the same session. Finance filter validation, Invoice and Payment reads, Allocation
reads, and Allocation-to-Payment/Invoice validation reads also receive that
session. Reads in the transaction are sequential to avoid unsupported parallel
operations on one MongoDB transaction. Existing non-export report calls retain
their normal query behavior.

Every report data query remains scoped with the Workspace ID supplied by the
authorized route context. Finance's existing broader reads used for current and
historical summaries, and its existing date and status semantics, are retained.
Attendance still excludes cancelled and future sessions, and preserves its
student/group/status filters, sorting, summary, and DTO fields.

Each exported collection is capped at 10,000 records. A larger result raises a
client error and aborts the transaction; no partial report is returned. If session
creation, snapshot execution, or transaction commit fails, the API returns
`503 Service Unavailable` with a safe message. There is no non-snapshot fallback.
The session is ended in the success and failure paths.

At export start, the frontend captures the active Workspace, applied filters, tab,
and filter revision. It sends one export request. If the Workspace or applied
filters change before the response completes, the result is discarded and no file
is downloaded or printed. Duplicate export actions remain blocked while a request
is pending.

## Limits and remaining constraints

The 10,000-row cap applies to each returned collection, matching the prior export
limit. Finance summary calculations continue to read the broader Workspace-scoped
records required by the existing report semantics; those underlying summary reads
are not independently bounded by this export-row cap.

The isolated proof of concept previously passed using Mongoose 9.11.2 with a
disposable MongoDB 8.2.4 single-node replica set. It verified snapshot reads across
collections during independent concurrent updates and transaction rollback. This
does **not** prove that the configured Darsly deployment supports snapshot
transactions. If it does not, exports will fail closed with the 503 response; the
deployment topology must be verified before relying on snapshot exports in
production.

## Tests and verification

- Frontend tests: `npm test -- --watch=false` — passed, 111 tests.
- Frontend production build: `npm run build` — passed.
- Focused backend tests: `npx tsx --test test/phase6.test.ts test/phase7.test.ts` —
  passed, 17 tests.
- Backend source type-check: `npx tsc --noEmit -p tsconfig.json` — passed.
- Focused backend test type-check:
  `npx tsc --noEmit --strict --esModuleInterop --target ES2020 --module commonjs
  --moduleResolution node --skipLibCheck --types node,passport
  src/types/express.ts test/phase7.test.ts` — passed.
- `git diff --check` — passed.

Mocked backend tests cover snapshot options, a shared session across report reads,
Workspace query filters, attendance DTO/filter behavior, all finance collections,
Workspace context use in the controller, record limits, validation, transaction
failure, no fallback, and session cleanup.
Frontend tests cover one-request export filters and Workspace capture, formatting,
stale Workspace response discard, failure without download, duplicate action
prevention, and independence from interactive table pagination.

No application database was used for tests. Production MongoDB compatibility and
browser-level behavior were not verified.

## Files changed

- `backend/src/controllers/report.controller.ts`
- `backend/src/routes/workspace.route.ts`
- `backend/src/services/report.service.ts`
- `backend/src/utils/app-error.ts`
- `backend/src/validators/report.validation.ts`
- `backend/test/phase7.test.ts`
- `client/src/app/app.spec.ts`
- `client/src/app/core/services/report.service.ts`
- `client/src/app/features/reports/reports.component.ts`
- `docs/PHASE_7_MODULE_13_REPORT_EXPORT_CONSISTENCY.md`
