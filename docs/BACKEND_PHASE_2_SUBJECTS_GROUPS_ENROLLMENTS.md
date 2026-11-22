# Backend Phase 2: Subjects, Study Groups, and Enrollments

## Scope and compatibility

Phase 2 exposes the existing `Subject`, `StudyGroup`, and `Enrollment` models through
workspace-scoped APIs. It does not change model schemas or indexes, add dependencies,
or implement sessions, attendance, payments, invoices, reports, or frontend changes.
Request bodies use strict Zod objects so protected or unknown body fields, including
client-supplied `workspaceId`, are rejected.

All endpoints require the existing JWT authentication, active membership, and active
workspace policy. Controllers take the workspace ID only from the authorized
`req.workspaceContext`. Resource reads and writes include that ID; group and
enrollment operations additionally verify referenced records belong to the same
workspace. Missing and cross-workspace resources are reported as not found.

## Endpoints

All routes are prefixed with `/api/workspaces/:workspaceId`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/subjects` | List subjects |
| `POST` | `/subjects` | Create a subject |
| `GET` | `/subjects/:subjectId` | Read a subject |
| `PATCH` | `/subjects/:subjectId` | Update a subject |
| `GET` | `/groups` | List study groups |
| `POST` | `/groups` | Create a study group |
| `GET` | `/groups/:groupId` | Read a study group |
| `PATCH` | `/groups/:groupId` | Update a study group |
| `GET` | `/groups/:groupId/enrollments` | List enrollments in a group |
| `POST` | `/groups/:groupId/enrollments` | Enroll a student in a group |
| `GET` | `/enrollments` | List workspace enrollments |
| `GET` | `/enrollments/:enrollmentId` | Read an enrollment |
| `PATCH` | `/enrollments/:enrollmentId` | Update enrollment status, end date, or notes |

No hard-delete endpoint was added.

## Request rules

### Subjects

Create accepts `{ name, description? }`. Patch accepts a non-empty subset of
`{ name?, description?, status? }`. Names are trimmed and limited to 2–100
characters; descriptions are limited to 1000 characters. Status is `active` or
`archived`.

List query parameters are `page`, `pageSize`, `search`, and `status`. Search is a
literal, case-insensitive substring match over name and description. Results sort by
name and ID for stable pagination.

The existing unique `(workspaceId, name)` index remains authoritative. Duplicate
names within a workspace return 409. No cross-workspace or global subject uniqueness
was added.

### Study groups

Create accepts `{ subjectId, name, description?, monthlyFee, capacity? }`.
`subjectId` must identify a subject in the same workspace. `monthlyFee` is a
non-negative decimal **string** (maximum 128 characters and 34 significant digits)
so Decimal128 precision is preserved. `capacity` is either `null` or an integer from
1 to 1000; omission uses the model's `null` default.

Patch accepts a non-empty subset of `subjectId`, `name`, `description`, `monthlyFee`,
`capacity`, and `status`. A supplied subject must belong to the workspace. Status is
`active`, `inactive`, or `archived`. A finite capacity cannot be lowered below the
current active enrollment count; this check runs transactionally.

List query parameters are `page`, `pageSize`, `search`, `subjectId`, and `status`.
Search is a literal, case-insensitive substring match over group name and description.
A `subjectId` filter must belong to the authorized workspace.

Group DTOs serialize `monthlyFee` as a decimal string, IDs as strings, and dates as
ISO 8601 UTC strings. The existing model has a non-unique workspace/name index, so
duplicate group names are allowed.

### Enrollments

Create uses `POST /groups/:groupId/enrollments` with
`{ studentId, enrolledAt?, notes?, status? }`. Status may be `active` or `paused`;
omission preserves the existing `active` default. Student and group must both exist
in the authorized workspace. `enrolledAt`, when supplied, must be an ISO 8601 date-time
with an explicit timezone. `notes` is limited to 1000 characters.

Patch accepts a non-empty subset of `{ status?, endedAt?, notes? }`. Status is
`active`, `paused`, `completed`, or `cancelled`; `endedAt` is `null` or an ISO 8601
date-time with an explicit timezone. The existing model validation remains
authoritative: completed/cancelled records require an end date; active/paused records
cannot have one; and an end date cannot precede `enrolledAt`. Returning an ended
enrollment to active requires explicitly clearing `endedAt`.

List query parameters are `page`, `pageSize`, `studentId`, `groupId`, and `status`.
Supplied student/group filters are checked against the current workspace. The
group-specific list route supports `page`, `pageSize`, `studentId`, and `status`.
Results sort by enrollment date and ID for stable pagination.

The existing partial unique index allows at most one active enrollment per
workspace/student/group combination. Duplicate active enrollments return 409. Paused,
completed, and cancelled records remain as history; no enrollment delete operation is
exposed. Per the existing index, a paused row does not by itself block a new active
row for the same pair; attempting to activate it while another active row exists
returns the existing 409 conflict.

## Capacity policy and concurrency

The model defines a nullable group capacity but no seat counter or separate paused
reservation rule. Setting a group capacity below its active enrollment count returns
409.

Only active enrollments participate in capacity checks. Paused creation skips the
capacity lock and count; activating a paused enrollment checks capacity first.
Cancelled/completed/paused enrollments do not count as occupied seats. A `null`
capacity is unlimited.

Capacity-sensitive active creation/reactivation runs in a MongoDB transaction. It
conditionally updates the group's existing `updatedAt` from the value read in that
transaction, setting it to a strictly later timestamp, then counts active enrollments
and creates/activates the enrollment in the same transaction. The compare-and-set
predicate ensures the lock operation is a real document write rather than a possible
no-op. Concurrent capacity-sensitive transactions write the same group document;
MongoDB reports a write conflict, and the driver's `withTransaction()` retries
transient transaction failures. After retry, capacity is counted again. This also
serializes active enrollments against finite-capacity changes, which update the same
group document transactionally. A successful active create/reactivation advances the
group's `updatedAt`, including for groups with unlimited capacity.

Transactions require a transaction-capable MongoDB deployment (normally a replica
set). The current automated suite mocks Mongoose persistence/session behavior. It
checks the compare-and-set write shape and capacity decision paths, but does not
reproduce MongoDB write conflicts or prove last-seat concurrency against a live
replica set. A replica-set integration/concurrency test is still required before
claiming deployment-level concurrency verification.

No rule was added to prohibit enrollment in inactive/archived groups or for inactive/
archived students because the existing schemas do not establish that business rule.
No automatic transition or capacity reservation for paused enrollments was introduced.

## Response conventions

Successful responses use `{ "message": "...", "data": ... }`. Collection `data` is
`{ "items": [...], "pagination": { "page", "pageSize", "totalItems", "totalPages" } }`.
Subject, group, and enrollment responses are explicit DTOs: they expose string `id`
values, omit workspace and Mongoose internals, and serialize dates to ISO 8601 UTC
strings. Group fees are decimal strings.

Invalid input or malformed IDs return 400, unauthenticated requests return 401,
non-members return 403, missing/out-of-workspace resources return 404, and unique
index or capacity conflicts return 409 using the existing error middleware.

## Implementation files

- `backend/src/routes/workspace.route.ts` — mounts all three authenticated feature
  routers behind `requireWorkspaceAccess()`.
- `backend/src/routes/subject.route.ts`,
  `backend/src/routes/study-group.route.ts`, and
  `backend/src/routes/enrollment.route.ts` — routes and request validation.
- `backend/src/controllers/subject.controller.ts`,
  `backend/src/controllers/study-group.controller.ts`, and
  `backend/src/controllers/enrollment.controller.ts` — response envelopes and DTO
  mapping.
- `backend/src/services/subject.service.ts`,
  `backend/src/services/study-group.service.ts`, and
  `backend/src/services/enrollment.service.ts` — scoped queries, validation of
  references, capacity handling, and status updates.
- `backend/src/validators/subject.validation.ts`,
  `backend/src/validators/study-group.validation.ts`, and
  `backend/src/validators/enrollment.validation.ts` — Zod request schemas.
- `backend/src/dtos/subject.dto.ts`,
  `backend/src/dtos/study-group.dto.ts`, and
  `backend/src/dtos/enrollment.dto.ts` — response DTOs.
- `backend/test/phase2.test.ts` — isolated HTTP tests using stubbed persistence.
- `backend/package.json` — adds the Phase 2 test file to the existing test command.

No existing model file was modified.

## Verification

Run from `backend`:

```powershell
npm test
npm run build
```

Verification performed:

- `npm test` — passed, 26 tests across Phase 0, Phase 1, and Phase 2.
- `npm run build` — passed.
- `git diff --check` — passed.

Tests use the existing Node `node:test` and `tsx` setup, an ephemeral HTTP server,
mocked Mongoose methods, and no database connection. Phase 2 coverage includes
authentication/member/suspended-workspace checks, CRUD and validation, pagination and
filters, workspace scoping, subject/group/student reference checks, Decimal128 DTO
serialization, active/paused/cancelled enrollment capacity paths, capacity limits and
reductions, enrollment date/status validation, and duplicate-key conflict responses.
The stubs do not verify real MongoDB transaction write-conflict/retry behavior.
