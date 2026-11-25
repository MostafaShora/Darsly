# Phase 7 — Module 4: Attendance

## Implemented pages and routes

All routes use the existing `authGuard` and resolve the active workspace through `WorkspaceService`.

- `/attendance` — paginated session list with session-date and session-status filters.
- `/attendance/sessions/:sessionId` — session attendance list, individual record creation, and supported record corrections.
- `/attendance/students/:studentId` — paginated attendance history for a student.

The Dashboard, Sessions, and Student detail views link to the relevant attendance pages. The Sessions feature itself only links to attendance; it does not issue attendance requests.

## Existing API contracts reused

All requests use the existing workspace-scoped API under `/api/workspaces/:workspaceId`. No backend routes, DTOs, validators, models, or business rules were changed.

| Method and route | Use |
| --- | --- |
| `GET /sessions?page&pageSize&groupId&from&to&status` | Session overview. The UI uses date and status filters; dates are converted from browser-local day boundaries to UTC. |
| `GET /sessions/:sessionId` | Load persisted session details. |
| `GET /groups/:groupId` | Display the session's group name. |
| `GET /groups/:groupId/enrollments?page&pageSize&status` | Load the paginated active enrollment roster for adding attendance. |
| `GET /students/:studentId` | Display names for attendance rows and load the student profile. |
| `GET /sessions/:sessionId/attendance?page&pageSize&status` | List a session's attendance records. |
| `POST /sessions/:sessionId/attendance` | Create one attendance record using `studentId`, optional `status`, `lateMinutes`, and `notes`. |
| `PATCH /sessions/:sessionId/attendance/:attendanceId` | Correct only the changed `status`, `lateMinutes`, and/or `notes` fields. |
| `GET /students/:studentId/attendance?page&pageSize&status&from&to` | List a student's attendance history. The `from` and `to` filters apply to `recordedAt`. |

Attendance responses use the existing `{ message, data: { items, pagination } }` envelope for lists and `{ message, data }` for a single record. The DTO contains IDs, status, late minutes, notes, `recordedAt`, `createdAt`, and `updatedAt`; it does not contain student, session, or group names. The UI therefore fetches related records only for the current page and caches those results.

## Behavior and validation

- Supported attendance statuses are `present`, `absent`, `late`, and `excused`.
- `lateMinutes` is optional and must be zero or greater. It is submitted only when the selected status is `late`.
- Notes are optional, trimmed, and limited to 1000 characters.
- New records are offered only after the session starts and while the session is not cancelled. The selectable roster is limited to current `active` group enrollments whose `enrolledAt` is at or before the session start. The backend remains authoritative for eligibility and uniqueness.
- The UI does not create absence records automatically and does not provide deletion.
- Existing records may be corrected after a session is cancelled or an enrollment becomes inactive, provided the session has started. Updates remain disabled before the session start, matching the API.
- Duplicate students visible on the loaded attendance page are excluded from the create selector. A record on an unloaded page may still be selected; the backend's uniqueness constraint rejects it, and its error is shown without a success state.
- Session and attendance lists use backend pagination (20 rows per page). Related-name lookups are limited to unique IDs on the loaded page and cached in memory.
- Attendance timestamps display in the browser's local timezone. Student history labels its date filters as recording dates to distinguish them from session dates.

## Tests and verification

Frontend tests use mocked API services and cover the workspace-scoped API paths, credentials, filters and pagination, active-enrollment eligibility, supported write fields, duplicate/error handling, cancelled/future session behavior, correction without optimistic updates, student history joins, loading/empty/error states, route guards, and navigation. The Sessions workflow test confirms it does not call an attendance API.

- `npm test -- --watch=false` — passed, 47 tests.
- `npm run build` — passed.
- `git diff --check` — passed.

## Known limitations

- The backend has no batch endpoint for resolving DTO references. A page may trigger up to one request per unique student or session, plus group lookups; this is bounded by the current page size and cached while the page remains open.
- The active enrollment endpoint has pagination but no search-by-name capability. Roster selection therefore uses its existing pages without inventing a search endpoint.
- When a duplicate attendance record is outside the currently loaded page, only the backend can identify it; the server conflict is surfaced to the teacher.
- The session overview initially starts at the current local date. Earlier sessions remain accessible by changing the date filter.
