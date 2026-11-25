# Phase 7 Module 1: Students and Guardians

## Implemented pages and routes

The teacher-facing Angular interface now includes:

- `/students` — searchable, status-filtered, paginated student list with loading,
  empty, and error states.
- `/students/new` — create a student.
- `/students/:studentId` — view and edit a student, including supported status
  changes and the student's guardian relationships.
- `/guardians` — searchable, paginated guardian list with loading, empty, and error
  states.
- `/guardians/new` — create a guardian.
- `/guardians/:guardianId` — view and edit a guardian.

All routes use the existing authentication guard. The `new` path is handled by the
existing parameter route so the page can distinguish creation from profile details.
Navigation links are available from the dashboard, student and guardian pages, and
reports.

The pages use Arabic RTL layouts and the existing Darsly styling conventions. Forms
use Reactive Forms with trimmed required/minimum-length validation, field limits,
and Arabic validation and API error messages. Pending writes are guarded against
duplicate submission.

## Existing APIs reused

All requests use the existing workspace-scoped endpoints under
`/api/workspaces/:workspaceId` and send credentials:

| Method | Endpoint | UI use |
| --- | --- | --- |
| GET | `/students?page=&pageSize=&search=&status=` | Student search, filter, pagination |
| POST | `/students` | Create student |
| GET | `/students/:studentId` | Student details |
| PATCH | `/students/:studentId` | Edit student |
| GET | `/guardians?page=&pageSize=&search=` | Guardian search and pagination |
| POST | `/guardians` | Create guardian |
| GET | `/guardians/:guardianId` | Guardian details |
| PATCH | `/guardians/:guardianId` | Edit guardian |
| GET | `/students/:studentId/guardians` | List a student's guardian links |
| POST | `/students/:studentId/guardians` | Link an existing guardian |
| PATCH | `/students/:studentId/guardians/:guardianId` | Edit relationship fields |
| DELETE | `/students/:studentId/guardians/:guardianId` | Remove a relationship |

The Angular service unwraps the existing `{ message, data }` response envelope and
uses the existing list pagination shape. The backend remains authoritative for
workspace authorization; no backend routes, models, or business rules were changed.
The UI selects the first active workspace returned by the existing workspace
service. There is no workspace switcher in this module.

## Supported forms and relationship behavior

Student fields: `name`, `phone`, `email`, `schoolName`, `grade`, `status`, and
`notes`. Supported statuses remain `active`, `inactive`, and `archived`.

Guardian fields: `name`, `phone`, `alternatePhone`, `email`, profile-level
`relationship`, and `notes`. The existing relationship options are used without
adding values.

From student details, teachers can browse the existing paginated guardian list,
link an existing guardian, and set the link's `relationship`, `isPrimary`, and
`receivesNotifications` fields. Existing link fields can be edited. Removing a link
requires browser confirmation and removes only the relationship, not either profile.
The notification field is presented as the existing preference; the UI does not
send notifications.

The current API does not provide a guardian-to-students listing endpoint. Guardian
details therefore do not claim to show linked students; the page states this
limitation instead of making an additional request or inferring relationships.

## Tests and verification

Frontend tests use mocked API services and HTTP testing utilities; they do not
connect to a development or production database.

- `npm test -- --watch=false` — passed, 21 tests.
- `npm run build` — passed (Angular production build).
- `git diff --check` — passed.

Coverage includes workspace-scoped API request construction and credential
preservation, student and guardian list/search/pagination, empty and API-error
states, create/edit validation and submission, student details, guardian details,
relationship link/update/removal, active route guards, and dashboard navigation.

## Known limitations

- Guardian profile pages cannot list linked students until an existing API supports
  that query.
- Workspace choice follows the existing first-active-workspace behavior; this module
  does not add workspace selection.
- Tests validate frontend behavior and request contracts with mocks. They do not
  prove MongoDB query behavior, transaction behavior, or live authorization.
