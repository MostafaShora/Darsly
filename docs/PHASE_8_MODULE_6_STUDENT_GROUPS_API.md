# Phase 8 Module 6 — Student Groups API

## Endpoint

`GET /api/student-portal/groups`

The endpoint uses the existing JWT-cookie authentication and
`requireStudentAccess` middleware. It requires the selected
`X-Student-Account-Link` header and returns the standard response envelope:

```json
{
  "message": "Student groups retrieved successfully",
  "data": [
    {
      "name": "Algebra Group",
      "subjectName": "Mathematics",
      "enrolledAt": "2026-10-01T00:00:00.000Z",
      "status": "active"
    }
  ]
}
```

An empty result is returned as `"data": []`.

## Data sources and isolation

- Enrollment links `studentId`, `workspaceId`, and `groupId`, and provides
  `enrolledAt`, `status`, and private `notes`.
- StudyGroup provides `workspaceId`, `subjectId`, `name`, and `status`, as
  well as private or operational fields such as description, fee, and
  capacity.
- Subject provides `workspaceId` and `name`, plus fields not needed by this
  view.

The service uses the middleware-established `req.studentContext` only. It
queries enrollments scoped to the trusted Student and Workspace, for active
enrollments whose enrollment date has begun. It then batch-queries active
groups in that Workspace by the resulting group IDs, and batch-queries
subjects in that Workspace by those groups' subject IDs. This avoids per-group
lookups and requires no new database indexes.

Only group name, subject name (nullable if unavailable), enrollment date, and
the active group status are returned. Database IDs, teacher/internal notes,
enrollment notes, group descriptions, fees, capacity, other students, guardian
data, and Workspace internals are excluded. The current Group model has no
teacher assignment field; Workspace membership does not identify a teacher for
an individual group, so the DTO does not include a teacher name.

Missing, foreign, inactive, or stale Student Context is rejected by the
existing middleware using the generic student-access error. Client-supplied
Student, Workspace, User, and enrollment IDs do not authorize or filter access.

## Frontend behavior

The existing Student Portal API service requests this endpoint with
credentials and the already validated StudentAccountLink header. The Groups
page displays responsive cards with only the DTO fields. It distinguishes
loading, empty, retryable API error, and populated states. The existing
Student Portal route, context guard, and navigation remain in place. No group
details, editing, schedule, or attendance feature is introduced.

## Verification

Verification:

- Backend source TypeScript check (`npx tsc --noEmit -p tsconfig.json`): passed.
- Focused Phase 8 backend tests, including the 10 Phase 8.10 tests: **91
  passed**. Local placeholder `MONGO_URI` and `JWT_SECRET` values were set for
  configuration imports; the tests mock model methods and do not connect to
  MongoDB.
- Angular tests (`npm test -- --watch=false`): **142 passed**.
- Angular production build (`npm run build`, default production configuration):
  passed.
- `git diff --check`: passed.

Angular tests use HTTP testing and service mocks. No external provider was
accessed.

## Limitations

- Teacher names cannot be shown until a group-to-teacher relationship exists.
- Subject name is the only subject detail shown; no descriptions or other
  Workspace metadata are exposed.
- No runtime or deployed-index verification was performed.
