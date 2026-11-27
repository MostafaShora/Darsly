# Phase 8 Module 7 — Student Schedule API

## Endpoint and authorization

`GET /api/student-portal/schedule`

The endpoint is mounted behind the existing `passportAuthenticateJwt` and
`requireStudentAccess` middleware. The request uses the authenticated User
cookie and the `X-Student-Account-Link` header. The middleware revalidates the
owned active StudentAccountLink, active Student, and active Workspace and
attaches the trusted Student Context. The controller and service use only that
context; request body, query, and path identifiers do not determine access.

## Data relationships and query scope

The schedule is traversed from the trusted Student Context as follows:

1. Active `Enrollment` records match the Student ID and Workspace ID and have
   `enrolledAt <= now`.
2. Active `StudyGroup` records match those enrollment group IDs and the same
   Workspace ID.
3. `Subject` names and `Session` records are fetched in batches using those
   active group IDs and the same Workspace ID.

This uses `Enrollment.studentId`, `workspaceId`, `groupId`, `status`, and
`enrolledAt`; `StudyGroup.workspaceId`, `subjectId`, `name`, and `status`;
`Subject.workspaceId`, `_id`, and `name`; and `Session.workspaceId`, `groupId`,
`title`, `startsAt`, `endsAt`, and `status`. The session model has no teacher
assignment field, so the response does not claim a teacher name.

All data queries are workspace-scoped. The session lookups are batched rather
than performed once per group. No indexes or client-provided identifiers were
added.

## Time/status behavior

The server's current time is used for classification:

- Upcoming: `scheduled` sessions with `startsAt` strictly later than now,
  ordered by `startsAt` ascending.
- Past: `scheduled` or `completed` sessions with `startsAt` at or before now,
  ordered by `startsAt` descending. Each past-session query is constrained by
  the matching active enrollment's `enrolledAt` date, so sessions before
  enrollment are excluded before the result limit is applied.
- `cancelled` sessions are excluded. A completed session with a future start
  is not returned.

Each list is capped at 100 results. The endpoint does not introduce pagination.

## Response DTO

The response follows the existing `{ message, data }` envelope:

```json
{
  "message": "Student schedule retrieved successfully",
  "data": {
    "upcoming": [
      {
        "title": "Algebra lesson",
        "startsAt": "2026-11-20T10:00:00.000Z",
        "endsAt": "2026-11-20T11:00:00.000Z",
        "status": "scheduled",
        "groupName": "Algebra Group",
        "subjectName": "Mathematics"
      }
    ],
    "past": []
  }
}
```

The response omits database IDs, Workspace identifiers, notes, internal
metadata, private enrollment/group fields, and other students' information.
Optional session titles and subject names are returned as `null` when
unavailable; timestamps are serialized as ISO 8601 UTC strings.

## Frontend behavior

The existing Schedule route and Student Context selection remain unchanged.
`StudentPortalApiService` sends the selected account-link header and includes
credentials. The page renders separate responsive upcoming and past lists,
localized date/time values, loading skeletons, list-specific empty states, and a
retryable API error state. It does not expose edit or detail actions.

## Verification

- Backend source type-check: `npx tsc --noEmit -p tsconfig.json` — passed.
- Focused backend Phase 8 test files (`phase8`, `phase8-2`, `phase8-3`,
  `phase8-4`, `phase8-6`, `phase8-9`, `phase8-10`, `phase8-11`): 80 tests
  passed, 0 failed. The Phase 8.10 + 8.11 subset passed 13 tests, including
  all 3 schedule tests. The Phase 8.8 test file was not included because it
  requires `MONGO_URI`.
- Angular Schedule API/component tests: 5 passed, 0 failed.
- Angular production build: passed.
- `git diff --check`: passed.
- The aggregate backend `npm test` command did not complete because its
  pre-test TypeScript check reports existing missing `../src/app` imports in
  `test/foundation.test.ts` and `test/phase1.test.ts` through
  `test/phase4.test.ts`. Running the 8.8 tests directly also requires
  `MONGO_URI`, which is not configured; no database was contacted.
- The full Angular suite ran 145 tests: 122 passed and 23 failed in the
  unchanged `src/app/app.spec.ts`, where request matchers expect relative URLs
  but the test environment emits absolute API URLs. The focused Schedule
  service/component tests passed.
- No development or production database or external provider was used.

## Limitations

- Session records do not contain a teacher assignment, meeting link, or
  recurrence information, so none is displayed.
- Past sessions are defined using their start time, not end time. Sessions
  already underway therefore appear in the past list.
- The result cap can omit older past sessions for groups with more than 100
  qualifying records; pagination is outside this phase.
