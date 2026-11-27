# Phase 8 Module 5 — Student Overview and Profile APIs

## Endpoints

Both endpoints use the existing JWT-cookie authentication and require the
`X-Student-Account-Link` header that the Student Context service supplies:

- `GET /api/student-portal/overview`
- `GET /api/student-portal/profile`

Each request runs `passportAuthenticateJwt` followed by
`requireStudentAccess`. A successful response follows the existing envelope:
`{ "message": "...", "data": { ... } }`. Missing, foreign, inactive, or stale
student access returns the generic `Student access not found` error.

The Overview DTO contains:

```json
{
  "studentName": "Student A",
  "activeGroupCount": 1,
  "upcomingSessionCount": 1,
  "upcomingSessions": [
    {
      "title": "Math lesson",
      "groupName": "Group A",
      "startsAt": "2026-12-01T10:00:00.000Z"
    }
  ],
  "attendanceSummary": {
    "total": 2,
    "present": 1,
    "absent": 1,
    "late": 0,
    "excused": 0
  },
  "recentAttendance": [
    {
      "status": "present",
      "recordedAt": "2026-11-25T10:00:00.000Z"
    }
  ]
}
```

Overview uses only existing model fields. Active group count comes from active
Enrollments linked to active StudyGroups. Upcoming sessions are scheduled
Sessions for those groups whose start time has not passed; the list is capped at
five while the count covers all matching sessions. Attendance counts and the
five newest records come from the authenticated Student's AttendanceRecords.
The response excludes enrollment notes, session notes, attendance notes, and
other Student records.

The read-only Profile DTO is:

```json
{
  "name": "Student A",
  "email": "student@example.test",
  "phone": "01000000000",
  "schoolName": "School A",
  "grade": "Grade 8"
}
```

Profile fields are explicitly selected from the Student model. Missing optional
values are returned as `null`. Status, internal notes, timestamps, IDs,
passwords, account links, guardian information, and Workspace internals are
intentionally excluded. No editing API was added.

## Isolation

The controllers consume only the typed `req.studentContext` produced by
`requireStudentAccess`. The middleware revalidates the JWT User, active
StudentAccountLink ownership, active Student, and active Workspace on each
request. Data queries then scope by the trusted Student and Workspace IDs;
enrollments are additionally restricted to active enrollments and their
corresponding active groups. Client-provided Student, Workspace, and User IDs
are not used for authorization. Teacher Workspace routes and context selection
were not changed.

## Frontend behavior

The Overview and Profile pages use `StudentPortalApiService`, which sends the
existing selected StudentAccountLink ID in the `X-Student-Account-Link` header
and includes credentials. The Overview has loading, retryable error, zero-data
and populated states for its summary, upcoming sessions, and attendance.
Profile has loading, retryable error, and explicit unavailable-value display.
Both preserve the existing Arabic RTL layout and are read-only.

Groups, Schedule, and Attendance remain outside this phase; no new APIs or
navigation behavior for those pages were implemented.

## Verification

Verification:

- Backend source TypeScript check (`npx tsc --noEmit -p tsconfig.json`): passed.
- Focused Phase 8 backend tests, including `phase8-9.test.ts`: **81 passed**.
  The test process used local placeholder `MONGO_URI` and `JWT_SECRET` values
  for configuration imports; tests mock Mongoose methods and do not connect to
  MongoDB.
- Angular tests (`npm test -- --watch=false`): **138 passed**.
- Angular production build (`npm run build`, default production configuration):
  passed.
- `git diff --check`: passed.

Frontend tests use Angular HTTP testing and service mocks. No external provider
was accessed.

## Limitations

- Group, session, and attendance information is limited to data currently
  stored in the existing models. No progress, performance, or financial metrics
  are inferred.
- Upcoming session results list at most five entries; the returned count is
  the total number of matching scheduled sessions.
- The Profile endpoint is read-only. Changes require a separately defined
  product/API contract.
- Database indexes and deployment behavior were not changed or verified.
