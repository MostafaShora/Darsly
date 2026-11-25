# Phase 7 — Module 2: Subjects, Groups & Enrollments

## Implemented pages and routes

The authenticated Angular application now exposes:

- `/subjects` — searchable, paginated subject list with status filter.
- `/subjects/new` — create a subject.
- `/subjects/:subjectId` — subject details and edit.
- `/groups` — searchable, paginated group list with subject and status filters.
- `/groups/new` — create a group.
- `/groups/:groupId` — group details, edit, enrollment roster, and enrollment form.

Routes use the existing authentication guard. Dashboard and Reports navigation now link to Subjects and Groups; the dashboard feature cards link to both modules as well.

## Existing API contracts reused

Requests use the existing workspace-scoped endpoints and `withCredentials` convention:

| Workflow | Endpoint |
| --- | --- |
| List/create subjects | `GET/POST /workspaces/:workspaceId/subjects` |
| Read/update subject | `GET/PATCH /workspaces/:workspaceId/subjects/:subjectId` |
| List/create groups | `GET/POST /workspaces/:workspaceId/groups` |
| Read/update group | `GET/PATCH /workspaces/:workspaceId/groups/:groupId` |
| List/create group enrollments | `GET/POST /workspaces/:workspaceId/groups/:groupId/enrollments` |
| Update enrollment | `PATCH /workspaces/:workspaceId/enrollments/:enrollmentId` |
| Resolve related subjects/students | Existing subject and student GET endpoints in the same workspace |

No backend code, endpoint, model, or business rule was changed.

## Forms and behavior

- Subjects: name, description, and the API-supported `active` / `archived` status when editing. Creation uses the existing API default.
- Groups: subject, name, description, monthly fee, nullable capacity, and the API-supported `active` / `inactive` / `archived` status when editing. A `null` capacity is displayed as unlimited.
- Enrollments: existing student, optional enrollment date and notes, with initial status limited to `active` or `paused`.
- Roster rows resolve student names through the existing workspace-scoped Student API. The roster is paginated at 20 enrollments per page. Active enrollment count uses the API's filtered total for `status=active`.
- Enrollment transitions reuse the API's existing statuses. Reactivation sends `endedAt: null`; backend capacity validation remains authoritative. Capacity conflicts are reported in Arabic.
- Search, pagination, status filters, loading, empty, and API error states are provided. Forms prevent duplicate submissions while requests are pending.

The active workspace is obtained through the existing `WorkspaceService.getActiveWorkspace()` behavior; workspace identifiers are never hardcoded.

## Tests and verification

Focused Angular tests cover create/edit routing and submission for subjects, invalid subject submission, workspace context, subject list search/pagination parameters, group details and unlimited capacity, group editing, active enrollment count query, enrollment creation and capacity conflict messaging, enrollment reactivation, and guarded navigation. API calls are mocked; tests do not access a database.

## Limitations

- The existing workspace service selects the first active workspace; this module does not add a workspace selector.
- Enrollment responses do not include student details, so the roster resolves each displayed student using the existing GET endpoint. A failed student lookup is shown as a roster error.
- The frontend requests at most one roster page at a time; it does not fabricate records or bypass backend capacity and duplicate-enrollment checks.
