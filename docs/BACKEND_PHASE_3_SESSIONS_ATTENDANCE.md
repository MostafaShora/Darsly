# Backend Phase 3: Sessions and Attendance

## Phase 2 gate and model audit

Before Phase 3, the Phase 2 branch was `main` with a clean worktree. `npm test`
passed all 26 then-existing tests, `npm run build` passed, and `git diff --check`
passed. Enrollment capacity counts only `active` records; `paused` and `cancelled`
do not consume capacity. Active create/reactivation conditionally changes the
group's `updatedAt` inside a transaction before counting. The existing stubs verify
the compare-and-set write shape, but do not prove MongoDB write-conflict/retry
behavior under real concurrent requests.

The existing models support these relationships and values:

- `Session` has `workspaceId`, `groupId`, `title`, `startsAt`, `endsAt`, `status`,
  and `notes`. Status is `scheduled`, `completed`, or `cancelled`; model validation
  requires `endsAt > startsAt`. Sessions reference a StudyGroup, not a Student or
  Enrollment.
- `AttendanceRecord` has `workspaceId`, `sessionId`, `studentId`, `status`,
  `lateMinutes`, `notes`, and `recordedAt`. Status is `present`, `absent`, `late`,
  or `excused`; `lateMinutes` has a non-negative model minimum.
- `StudyGroup` and `Student` each carry `workspaceId`. `Enrollment` relates a
  Student to a StudyGroup and has the existing active/paused/completed/cancelled
  states and enrollment dates.
- Attendance has a unique index on `(workspaceId, sessionId, studentId)`. Its
  remaining indexes support session/status lists and student history. Session
  indexes support workspace/group chronological lists and workspace/status/date
  queries.

No Session or Attendance API/service/test implementation existed before this phase.
No model or index change was needed.

## Endpoints

All endpoints require the existing authenticated workspace access middleware and
use `/api/workspaces/:workspaceId`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/sessions` | List sessions |
| `POST` | `/sessions` | Create a scheduled session |
| `GET` | `/sessions/:sessionId` | Read a session |
| `PATCH` | `/sessions/:sessionId` | Update title, times, status, or notes |
| `GET` | `/sessions/:sessionId/attendance` | List a session's attendance |
| `POST` | `/sessions/:sessionId/attendance` | Record one student's attendance |
| `PATCH` | `/sessions/:sessionId/attendance/:attendanceId` | Correct an existing record |
| `GET` | `/students/:studentId/attendance` | List a student's attendance history |

No delete endpoint was added.

## Request contracts and validation

### Sessions

`POST /sessions` accepts:

```json
{
  "groupId": "MongoDB ObjectId",
  "title": "Optional title",
  "startsAt": "ISO 8601 date-time with offset",
  "endsAt": "ISO 8601 date-time with offset",
  "notes": "Optional notes"
}
```

New sessions use the model's `scheduled` default. List filters are `groupId`,
`from`, `to`, `status`, `page`, and `pageSize`; `from`/`to` filter `startsAt`
inclusively. Results sort by `startsAt`, then `_id`. `PATCH /sessions/:sessionId`
accepts a non-empty subset of `title`, `startsAt`, `endsAt`, `status`, and `notes`.
Status accepts only `scheduled`, `completed`, or `cancelled`. The model's date
validation runs on document save, including when a patch changes only one date.

`groupId` is immutable after creation. This preserves the group relationship for
any attendance records and avoids a session-group reassignment racing with new
attendance writes. Creation, reads, updates, and list filters verify the group is
within the authorized workspace. No additional rule requires the StudyGroup itself
to be active; the existing model and request did not define that policy.

### Attendance

`POST /sessions/:sessionId/attendance` accepts `{ studentId, status?, lateMinutes?,
notes? }`. Status defaults to `present`; allowed values are `present`, `absent`,
`late`, and `excused`. `lateMinutes` is a non-negative number, consistent with the
model's numeric field; notes are limited to 1000 characters.

`PATCH /sessions/:sessionId/attendance/:attendanceId` accepts a non-empty subset of
`status`, `lateMinutes`, and `notes`. Link fields (`workspaceId`, `sessionId`, and
`studentId`) and `recordedAt` cannot be changed through this API.

Session attendance lists accept `status`, `page`, and `pageSize`. Student history
accepts `status`, `from`, `to`, `page`, and `pageSize`; its date filters apply
inclusively to `recordedAt`. Both list types return the shared pagination metadata
and stable chronological sorting.

## Workspace and business rules

- Every resource query/mutation includes the `workspaceId` from
  `req.workspaceContext`. Session and Student references are independently checked
  against that workspace; cross-workspace or missing resources are not found.
- New attendance requires an active Enrollment for the Session's StudyGroup and
  Student in the same workspace. The Enrollment's `enrolledAt` must be no later
  than the Session's `startsAt`. Paused, completed, and cancelled enrollments are
  not eligible to create a record, including for past sessions.
- New attendance is rejected with 409 for cancelled Sessions and before
  `startsAt`; a scheduled or completed Session is eligible once its start time is
  reached. Existing records can be corrected after the Session starts, including
  when the Session is cancelled or the Enrollment later becomes non-active.
  Existing attendance is not automatically removed or changed by Session or
  Enrollment status changes.
- A duplicate create is rejected by the existing unique index and mapped to 409.
  Correcting a record is scoped by workspace, session, and attendance ID; it does
  not create a second record.
- A Session with attendance cannot have its resulting `startsAt` moved into the
  future. A date change is otherwise allowed when its resulting `startsAt` is not
  in the future and `endsAt > startsAt`; thus `endsAt` may be in the future for a
  session that has already started. The existing model validation enforces the
  interval even when PATCH supplies only one date. `groupId` remains immutable.
- No extra Session status-transition matrix was added. Updates accept any status
  value supported by the Session model.

Enrollment does not retain pause start/end history, so attendance eligibility is
based on its current status and cannot reconstruct whether an Enrollment was paused
at a past session. This phase follows the selected active-only policy. Attendance
history remains readable and existing records remain editable after an Enrollment
becomes inactive; no historical rows are rewritten.

## Response and DTO conventions

Responses preserve `{ "message": "...", "data": ... }`. Collection data contains
`items` and `{ page, pageSize, totalItems, totalPages }` pagination metadata.
Session and Attendance responses use explicit DTO mappers: IDs are strings, dates
are ISO 8601 UTC strings, and Mongoose internals/workspace IDs are omitted.

Invalid IDs, unsupported states, invalid date ranges, invalid timestamps, and model
validation failures return 400. Missing or out-of-workspace resources return 404.
Conflicting attendance states and duplicate unique-index records return 409 through
the existing AppError/error middleware conventions.

## Implementation files

- `backend/src/services/session.service.ts` and
  `backend/src/services/attendance.service.ts`
- `backend/src/controllers/session.controller.ts` and
  `backend/src/controllers/attendance.controller.ts`
- `backend/src/routes/session.route.ts`; Student attendance history is mounted in
  `backend/src/routes/student.route.ts`
- `backend/src/validators/session.validation.ts` and
  `backend/src/validators/attendance.validation.ts`
- `backend/src/dtos/session.dto.ts` and
  `backend/src/dtos/attendance.dto.ts`
- `backend/src/routes/workspace.route.ts` mounts the workspace-scoped Session API.
- `backend/test/phase3.test.ts` covers Phase 3 HTTP behavior with mocked persistence.
- `backend/package.json` includes the Phase 3 test file in `npm test`.

No model, index, authentication, frontend, or dependency changes were made.

## Verification and limitations

Run from `backend`:

```powershell
npm test
npm run build
```

Phase 3 tests cover Session create/list/read/update, pagination and filters,
workspace/group ownership, immutable group assignment, date/state validation,
attendance creation and eligibility for scheduled/completed Sessions, all
Enrollment statuses and the enrollment-date boundary, exact `startsAt` behavior,
future/cancelled Session handling, duplicate index conflicts, attendance
correction, Student history, status filters, and malformed/cross-workspace
references. They also assert that attended Sessions cannot be moved into the
future and that attendance updates use a write filter scoped by workspace,
session, and attendance ID.

Tests use the existing Node `node:test`/`tsx` setup, an ephemeral HTTP server, and
Mongoose stubs. They do not connect to a development or production database. The
unique-index behavior is tested through a mocked duplicate-key error;
replica-set index enforcement and concurrent duplicate writes are not exercised
against MongoDB. Query-scope assertions verify the filters passed to Mongoose, but
do not prove database authorization or index behavior outside those operations.
