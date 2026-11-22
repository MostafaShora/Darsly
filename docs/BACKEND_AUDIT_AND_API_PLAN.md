# Darsly Backend Audit and API Plan

## 1. Executive summary

The backend is a TypeScript, Express, and Mongoose application under `backend/src`. Its
currently mounted APIs cover authentication and workspace management only. Mongoose
models already exist for students and guardians, subjects and groups, enrollments,
sessions, attendance, invoices, payments, and payment allocations, but none of those
domains is exposed through routes or controllers. There is no reports or dashboard
aggregation API.

The existing authentication and workspace implementations are present in code, but the
repository has no backend test script or backend test files; their runtime behavior has
not been demonstrated by an automated integration suite. A direct TypeScript check
(`tsc --noEmit -p tsconfig.json`) passed during this audit.

**Verified facts** below describe the checked-in implementation. **Recommendations**
and **proposed contracts** are not existing APIs and need product approval before
implementation. No application source or database data was changed for this audit.

## 2. Backend architecture

| Area | Verified implementation |
| --- | --- |
| Entry point | `backend/src/index.ts` creates the Express app and HTTP server, configures JSON and URL-encoded bodies, cookies, CORS, Passport, `/health`, `/api`, and production static serving. |
| Configuration | `backend/src/config/env.config.ts` reads environment settings through `backend/src/utils/get-env.ts`. Database connection is in `backend/src/config/database.config.ts`; JWT cookie authentication is configured in `backend/src/config/passport.config.ts` and `backend/src/utils/cookie.ts`. |
| Database | Mongoose connects to MongoDB through `backend/src/config/database.config.ts`. Models are declared individually in `backend/src/models/`. |
| Routing | `backend/src/routes/index.ts` mounts `auth.route.ts` at `/auth` and `workspace.route.ts` at `/workspaces`, under the `/api` prefix. |
| Request handling | Authentication controllers use `asyncHandler`; workspace controllers forward exceptions with `next`. Services contain most authentication and workspace rules. |
| Validation and errors | Zod is used for authentication request bodies in `backend/src/validators/auth.validation.ts`. Workspace request validation is manual in `backend/src/services/workspace.service.ts`. Errors are handled by `backend/src/middlewares/errorHandler.middleware.ts` and `backend/src/utils/app-error.ts`. |
| TypeScript and scripts | `backend/tsconfig.json` enables strict mode. `backend/package.json` defines `dev`, `build`, and `start`; it has no test or lint script. No backend test files were found under `backend/src` or in `backend/test(s)`. |
| Dependencies | Runtime dependencies include Express, Mongoose, Passport/JWT, Zod, cookie-parser, CORS, dotenv, bcrypt, and bcryptjs. Both bcrypt packages are present; auth uses `bcrypt`, while the separate helper in `backend/src/utils/bcrypt.ts` uses `bcryptjs`. |

Existing documentation reviewed: `docs/BACKEND_INTEGRATION_NOTES.md`,
`docs/DASHBOARD_IMPLEMENTATION.md`, `docs/FRONTEND_AUDIT.md`, and
`docs/FRONTEND_REFACTOR_REPORT.md`. These agree that the dashboard currently consumes
authentication identity only and does not receive student, group, session, attendance,
payment, report, or activity-feed data.

## 3. Existing models and relationships

Every listed relationship is represented by a Mongoose `ref`; MongoDB does not enforce
referential integrity for those references. The current model declarations also do not
prove that referenced records belong to the same workspace.

| Model | Existing fields and constraints of note | Relationships |
| --- | --- | --- |
| `User` (`models/user.model.ts`) | Name, unique normalized email, password hash excluded from normal selection, active/pending/suspended status, last login timestamp. | Workspace owner and member references point to users. |
| `Workspace` (`models/workspace.model.ts`) | Name, unique slug, status, description, currency fixed to EGP, suspension metadata. Unique owner index means one workspace per owner. | `ownerId` and `suspendedBy` reference `User`. |
| `WorkspaceMember` (`models/workspace-member.model.ts`) | Owner/teacher role, invited/active/suspended status, inviter and join date. Unique `(workspaceId,userId)`; validation checks active/invited join-date consistency. | References `Workspace` and `User`. |
| `Student` (`models/student.model.ts`) | Workspace, name, optional phone/email, school, grade, active/inactive/archived status, notes; workspace/status and workspace/name indexes. | References `Workspace`. |
| `Guardian` (`models/guardian.model.ts`) | Workspace, name, required phone, optional alternate phone/email, relationship, notes; workspace/phone and workspace/name indexes. | References `Workspace`. |
| `StudentGuardian` (`models/student-guardian.model.ts`) | Workspace, student, guardian, relationship, primary and notification flags. Unique student/guardian link and at most one primary guardian per student. | References `Workspace`, `Student`, and `Guardian`. |
| `Subject` (`models/subject.model.ts`) | Workspace, name, description, active/archived status. Unique subject name per workspace. | References `Workspace`. |
| `StudyGroup` (`models/study-group.model.ts`) | Workspace, subject, name, description, Decimal128 monthly fee, optional capacity, active/inactive/archived status. | References `Workspace` and `Subject`. |
| `Enrollment` (`models/enrollment.model.ts`) | Workspace, student, group, enrollment/end dates, active/paused/completed/cancelled status, notes. Date/status validation; only one active enrollment per student/group. | References `Workspace`, `Student`, and `StudyGroup`. |
| `Session` (`models/session.model.ts`) | Workspace, group, title, start/end timestamps, scheduled/completed/cancelled status, notes. Validation requires end after start. | References `Workspace` and `StudyGroup`. |
| `AttendanceRecord` (`models/attendance-record.model.ts`) | Workspace, session, student, present/absent/late/excused status, non-negative late minutes, notes, recorded timestamp. Unique student/session record. | References `Workspace`, `Session`, and `Student`. |
| `Invoice` (`models/invoice.model.ts`) | Workspace, invoice number, student, enrollment, group, period, Decimal128 amount, optional due date, draft/issued/void status, description and notes. Unique invoice number per workspace; validates period order. | References `Workspace`, `Student`, `Enrollment`, and `StudyGroup`. |
| `Payment` (`models/payment.model.ts`) | Workspace, student, Decimal128 amount, payment method/status, received timestamp, optional reference, notes. | References `Workspace` and `Student`. |
| `PaymentAllocation` (`models/payment-allocation.model.ts`) | Workspace, payment, invoice, Decimal128 amount. Unique payment/invoice allocation. | References `Workspace`, `Payment`, and `Invoice`. |

## 4. Existing routes and endpoint contracts

All paths below are verified from `backend/src/routes/`; they are mounted beneath
`/api`. Authentication uses an HttpOnly `accessToken` cookie. The client also sends
requests with credentials enabled. Auth responses explicitly map users to
`id`, `name`, `email`, `status`, and `lastLoginAt`; password hashes are not included.

### Authentication

| Method and path | Access | Verified request and response |
| --- | --- | --- |
| `POST /api/auth/register` | Public | Zod body: `{ name, email, password }`. Returns 201 with `{ message, user }` and sets the JWT cookie. |
| `POST /api/auth/login` | Public | Zod body: `{ email, password }`. Returns 200 with `{ message, user }` and sets the JWT cookie. |
| `POST /api/auth/logout` | Public | Clears the cookie; returns 200 with `{ message }`. |
| `GET /api/auth/status` | JWT cookie required | Returns 200 with `{ message, user }`; Passport rejects missing/invalid authentication. |

Registration and login normalize email to lowercase. Password length is constrained to
8–128 characters by the current Zod schema. Passwords are hashed with bcrypt. Passport
checks the JWT audience/algorithm and requires an active user.

### Workspaces

`backend/src/routes/workspace.route.ts` applies JWT authentication to every workspace
route. Workspace creation checks that the authenticated user is active; workspace
reads and mutations check active membership. Mutations are owner-only.

| Method and path | Verified behavior |
| --- | --- |
| `POST /api/workspaces` | Body fields consumed by the service: `name` and optional `description`. Creates a workspace and active owner membership in a MongoDB transaction; returns 201 `{ message, data }`. |
| `GET /api/workspaces/mine` | Lists workspaces with active membership, including suspended workspaces; returns `{ message, data }`. |
| `GET /api/workspaces/:workspaceId` | Requires active membership; returns workspace status even when suspended. |
| `PATCH /api/workspaces/:workspaceId` | Owner-only update of `name` and/or `description`; rejects an empty update. |
| `PATCH /api/workspaces/:workspaceId/suspend` | Owner-only suspension; records owner suspension metadata. |
| `PATCH /api/workspaces/:workspaceId/activate` | Owner-only activation; an administratively suspended workspace cannot be reactivated through this owner route. |

Workspace responses use `{ message, data }` and return Mongoose workspace documents.
Workspace validation is manual; there is no shared request schema or pagination contract.

### Other route inventory

No mounted endpoints were found for users, students, guardians, subjects, groups,
enrollments, sessions, attendance, invoices, payments, reports, dashboard statistics,
or activity feeds. `getUsersService` is not mounted by a route.

## 5. Feature status matrix

| Feature | Status | Evidence |
| --- | --- | --- |
| Authentication | **API exists, needs verification** | Auth routes, controllers, services, Zod schemas, JWT cookie, and Passport strategy exist. No backend automated tests were found. |
| Workspace management | **API exists, needs verification** | Workspace routes and owner/member-aware services exist. No backend automated tests were found. |
| Students and guardians | **Model exists, API is missing** | `Student`, `Guardian`, and `StudentGuardian` models exist; no corresponding routes/controllers/services. |
| Subjects, groups, and enrollments | **Models exist, APIs are missing** | `Subject`, `StudyGroup`, and `Enrollment` models exist; no corresponding routes/controllers/services. |
| Sessions | **Model exists, API is missing** | `Session` model exists; no corresponding route/controller/service. |
| Attendance | **Model exists, API is missing** | `AttendanceRecord` model exists; no corresponding route/controller/service. |
| Payments and invoices | **Models exist, APIs are missing** | `Invoice`, `Payment`, and `PaymentAllocation` models exist; no corresponding routes/controllers/services. |
| Reports and dashboard integration | **Not implemented** | No report/dashboard models, routes, controllers, or aggregation services were found. |
| Recent activity feed | **Not implemented** | No activity model or activity-feed API was found. |

“API exists, needs verification” means the route and implementation are present; it is
not a claim that deployment, database connectivity, or all runtime behavior has been
tested.

## 6. Gaps and risks to resolve before feature implementation

### Authorization and workspace isolation

- The existing workspace service demonstrates active membership and owner checks, but
  there is no reusable workspace-access middleware/service for the unimplemented
  domains.
- New routes must derive the user ID from the authenticated principal, validate the
  workspace ID, and check active membership and workspace state on every request.
- Every referenced student, subject, group, session, enrollment, invoice, and payment
  must be loaded with the same `workspaceId`. A `ref` alone does not provide this
  isolation.
- Membership APIs do not exist. The member model supports invitations, but no invite,
  accept, removal, or role-management flow is implemented.

### Validation, error handling, and authentication hardening

- Zod parse failures currently reach the generic error handler rather than an explicit
  400 response; the generic handler returns 500 for non-`AppError` errors and includes
  the underlying error message in its response.
- Workspace input validation is service-level and incomplete as a reusable API
  contract. New routes should validate path parameters, query parameters, and bodies
  before service operations.
- JWT configuration currently has a built-in fallback. Production startup should
  fail closed when a strong, explicitly configured signing secret is absent; the
  fallback value is intentionally not reproduced in this report.
- The JWT expiry is configurable while the cookie `maxAge` is fixed. Confirm and align
  token and cookie lifetimes so users do not retain an expired cookie unexpectedly.
- Registration performs an existence check before insert, while the database unique
  email index is the concurrency-safe constraint. A duplicate-key race is not mapped
  explicitly to the normal conflict response.
- The generic error handler logs the full error object and exposes its message to the
  client. Review log redaction and client-safe error serialization before expanding
  the API surface.
- No request rate limiting or security-header middleware was found in the app setup.
  Evaluate appropriate production protections without changing auth behavior.

### Data consistency and domain rules

- Workspace creation uses `withTransaction`; confirm the target MongoDB deployment
  supports transactions.
- Model constraints are not a substitute for API/service business rules. In
  particular, capacity enforcement, cross-workspace references, attendance eligibility,
  invoice/payment status transitions, and payment allocation totals are not currently
  enforced by domain services because those services do not exist.
- The `relationship` value exists on both `Guardian` and `StudentGuardian`. Define
  whether guardian-level or student-link relationship is authoritative before
  exposing both fields.
- Decimal128 values need an explicit JSON contract, preferably decimal strings rather
  than JavaScript floating-point numbers.
- Group/session time zones, recurring sessions, schedule overlaps, attendance
  eligibility for paused/ended enrollments, invoice numbering, refunds, and outstanding
  balance calculation are product decisions not defined by the current models.

### Querying, testing, and maintainability

- There is no established API pagination, filtering, search, or sorting convention.
  The only observed sorting is the workspace list ordered by creation time.
- No backend test files or `test` script exist. The TypeScript compiler check passed,
  but it does not verify route behavior, MongoDB transactions, or authorization.
- `backend/src/config/http.config.ts` is used by the app; `backend/src/utils/http.config.ts`
  duplicates HTTP status constants and appears unused. Consolidate only if a future
  scoped change confirms it is safe.

## 7. Proposed API contract conventions

The following are **recommendations**, not existing routes or contracts:

- Keep the existing cookie authentication and mount new resources below
  `/api/workspaces/:workspaceId/...`. This makes tenant scope explicit while still
  requiring server-side membership checks.
- Use `401` for missing/invalid authentication, `403` for a signed-in user without
  permission, `404` for missing or out-of-workspace resources, `400` for invalid
  request data, and `409` for duplicate/conflicting state.
- Keep `{ message, data }` as the response envelope. For collection responses, make
  `data` contain `{ items, pagination: { page, pageSize, totalItems, totalPages } }`.
  This pagination shape is proposed, not current.
- Serialize Mongo IDs as strings, dates as ISO 8601 strings, and Decimal128 values as
  decimal strings. Do not return raw Mongoose documents as the long-term public
  contract.
- Prefer status transitions supported by the models over hard deletion, particularly
  for students, groups, enrollments, invoices, and payments that can have history or
  financial references.

## 8. Dependency-aware implementation roadmap

The proposed order preserves the existing models and avoids parallel, inconsistent
ownership rules. File names below are likely additions; no such feature files currently
exist.

### Phase 0 — Shared API and workspace authorization foundation

**Dependency:** Before any workspace-scoped feature routes.

**Likely files:** Add a reusable workspace access helper/middleware under
`backend/src/middlewares/` or `backend/src/services/`; add shared request validation
and response serialization helpers under `backend/src/validators/` and
`backend/src/utils/`; normalize validation errors in
`backend/src/middlewares/errorHandler.middleware.ts`; mount feature routers from
`backend/src/routes/index.ts`.

**Contract:** No new business endpoint. Establish a consistent authenticated
workspace context, request validation, safe errors, and list pagination before
feature-specific work.

**Tests and acceptance:** Reject unauthenticated and non-member requests; deny access
to suspended workspaces according to an approved policy; test malformed IDs and
validation responses; verify that object lookups cannot escape the workspace.

### Phase 1 — Students and guardians

**Dependencies:** Phase 0.

**Likely files:** Add `student.route.ts`, `student.controller.ts`,
`student.service.ts`, and `student.validation.ts`; optionally add guardian handlers
in the same module. Mount the router in `routes/index.ts`. Reuse existing
`Student`, `Guardian`, and `StudentGuardian` models; do not create duplicate models.

**Proposed endpoints:**

| Method and path | Proposed body/query |
| --- | --- |
| `GET /api/workspaces/:workspaceId/students` | Query: `page`, `pageSize`, `search`, `status`, and approved sort fields. |
| `POST /api/workspaces/:workspaceId/students` | `{ name, phone?, email?, schoolName?, grade?, status?, notes? }`. |
| `GET /api/workspaces/:workspaceId/students/:studentId` | No body. |
| `PATCH /api/workspaces/:workspaceId/students/:studentId` | Partial editable student fields; status transitions should use model-supported values. |
| `GET /api/workspaces/:workspaceId/students/:studentId/guardians` | No body. |
| `POST /api/workspaces/:workspaceId/students/:studentId/guardians` | Either link an existing same-workspace guardian or create/link one; choose one explicit request form before implementation. |

**Rules and tests:** Validate names, email/phone format, status, and IDs. Confirm
whether student email/phone uniqueness is desired. Enforce same-workspace ownership on
student and guardian links, primary-guardian uniqueness, and safe archival when
enrollments or invoices exist. Test duplicates, primary guardian replacement, and
cross-workspace IDs.

**Acceptance:** Authenticated workspace members can list and manage their own
students and guardian links only; paginated results are stable; invalid requests
return the agreed 4xx envelope; no hard deletion loses referenced history.

### Phase 2 — Subjects, groups, and enrollments

**Status update:** Implemented after this audit. The original audit inventory and
recommendations below remain historical; see
`BACKEND_PHASE_2_SUBJECTS_GROUPS_ENROLLMENTS.md` for the verified implementation and
contract.

**Dependencies:** Phase 1 supplies students; Phase 0 supplies access and API
conventions. Subject management is a prerequisite within this phase because groups
require `subjectId`.

**Likely files:** Add `subject.route.ts`, `subject.controller.ts`,
`subject.service.ts`, `subject.validation.ts`; add
`study-group.route.ts`, `study-group.controller.ts`, `study-group.service.ts`,
`study-group.validation.ts`; mount routes from `routes/index.ts`. Reuse
`Subject`, `StudyGroup`, and `Enrollment`.

**Proposed endpoints:**

| Method and path | Proposed body/query |
| --- | --- |
| `GET/POST /api/workspaces/:workspaceId/subjects` | List filters; create `{ name, description? }`. |
| `GET/PATCH /api/workspaces/:workspaceId/subjects/:subjectId` | Partial name/description/status update. |
| `GET/POST /api/workspaces/:workspaceId/groups` | List filters; create `{ subjectId, name, description?, monthlyFee, capacity? }`. |
| `GET/PATCH /api/workspaces/:workspaceId/groups/:groupId` | Partial editable group fields and supported status transitions. |
| `GET /api/workspaces/:workspaceId/groups/:groupId/enrollments` | Query: status and pagination. |
| `POST /api/workspaces/:workspaceId/groups/:groupId/enrollments` | `{ studentId, enrolledAt?, notes? }`. |
| `PATCH /api/workspaces/:workspaceId/enrollments/:enrollmentId` | `{ status, endedAt?, notes? }` subject to enrollment transition rules. |

**Rules and tests:** Validate Decimal128 input as a non-negative decimal string,
capacity bounds, same-workspace subject/student/group references, enrollment date/status
consistency, and unique active enrollment. Decide whether paused enrollment blocks a
second active enrollment and how group capacity is counted; enforce capacity
atomically to avoid concurrent over-enrollment.

**Acceptance:** No group can reference a subject from another workspace; enrollment
history is preserved; capacity and status rules are deterministic under concurrent
requests.

### Phase 3 — Sessions

**Dependencies:** Phase 2 provides groups.

**Likely files:** Add `session.route.ts`, `session.controller.ts`,
`session.service.ts`, and `session.validation.ts`; mount from `routes/index.ts`.
Reuse `Session`.

**Proposed endpoints:**

| Method and path | Proposed body/query |
| --- | --- |
| `GET /api/workspaces/:workspaceId/sessions` | Query: `groupId?`, `from?`, `to?`, `status?`, and pagination. |
| `POST /api/workspaces/:workspaceId/sessions` | `{ groupId, title?, startsAt, endsAt, notes? }`, with ISO 8601 timestamps. |
| `GET/PATCH /api/workspaces/:workspaceId/sessions/:sessionId` | Read or update allowed fields/status. |

**Rules and tests:** Validate start/end order, same-workspace active group, time-zone
interpretation, and allowed status transitions. The model has no recurrence or overlap
policy; do not add either without product approval. Test date boundaries, invalid
groups, and cancellation/completion rules.

**Acceptance:** Session queries are workspace-scoped and chronologically stable; all
returned dates have a consistent ISO 8601 representation.

### Phase 4 — Attendance

**Dependencies:** Phases 1–3 provide students, enrollments, and sessions.

**Likely files:** Add `attendance.route.ts`, `attendance.controller.ts`,
`attendance.service.ts`, and `attendance.validation.ts`; mount from `routes/index.ts`.
Reuse `AttendanceRecord`.

**Proposed endpoints:**

| Method and path | Proposed body/query |
| --- | --- |
| `GET /api/workspaces/:workspaceId/sessions/:sessionId/attendance` | Optional pagination/filtering if roster sizes require it. |
| `PUT /api/workspaces/:workspaceId/sessions/:sessionId/attendance/:studentId` | `{ status, lateMinutes?, notes? }`; idempotently create or update the unique student/session record. |
| `GET /api/workspaces/:workspaceId/students/:studentId/attendance` | Query: date range, status, group, and pagination. |

**Rules and tests:** Confirm the enrollment eligibility rule at the session time.
Verify that the session and student are in the same workspace and that the student
belongs to the session group under the approved enrollment policy. Validate
late-minute semantics and status transitions. Test duplicate/retried writes and
cross-workspace references.

**Acceptance:** A retry cannot create a duplicate record; attendance history and
session summaries agree; writes cannot mark a student for an unrelated session.

### Phase 5 — Invoices, payments, and allocations

**Dependencies:** Phases 1–2 provide students, groups, and enrollments.

**Likely files:** Add `invoice.route.ts`, `invoice.controller.ts`,
`invoice.service.ts`, `invoice.validation.ts`, `payment.route.ts`,
`payment.controller.ts`, `payment.service.ts`, and `payment.validation.ts`; mount from
`routes/index.ts`. Reuse `Invoice`, `Payment`, and `PaymentAllocation`.

**Proposed endpoints:**

| Method and path | Proposed body/query |
| --- | --- |
| `GET/POST /api/workspaces/:workspaceId/invoices` | List by student/status/period; create from same-workspace `{ studentId, enrollmentId, groupId, periodStart, periodEnd, totalAmount, dueDate?, description?, notes? }`. Invoice-number generation policy remains to be decided. |
| `GET/PATCH /api/workspaces/:workspaceId/invoices/:invoiceId` | Read or update permitted draft fields; use an explicit void transition rather than deletion. |
| `GET/POST /api/workspaces/:workspaceId/payments` | List by student/status/date; create `{ studentId, amount, method, status?, receivedAt?, reference?, notes? }`. |
| `GET /api/workspaces/:workspaceId/payments/:paymentId` | Payment details with allocations. |
| `POST /api/workspaces/:workspaceId/payments/:paymentId/allocations` | `{ invoiceId, amount }`. |

**Rules and tests:** Decide invoice numbering, whether zero-value payments are valid,
allowed state transitions, refund semantics, and whether unapplied payments are
allowed. Enforce same-workspace and same-student links, currency consistency, and
allocation totals so a payment or invoice cannot be over-allocated. Use transactions
for multi-document financial writes and Decimal128/string arithmetic, not binary
floating-point. Test duplicate invoice numbers, over-allocation, retries, voids,
refunds, and transaction rollback.

**Acceptance:** Balances are reproducible from invoices and allocations; all monetary
values serialize without precision loss; financial history is auditable and cannot
cross workspace or student boundaries.

### Phase 6 — Reports and dashboard integration

**Dependencies:** Phases 1–5 and approved metric definitions.

**Likely files:** Add a report/dashboard route, controller, service, and query
validator under corresponding `routes/`, `controllers/`, `services/`, and
`validators/` directories. No new model is assumed; use read-only aggregation queries
unless persistence is explicitly required.

**Proposed endpoints:**

| Method and path | Proposed query/response |
| --- | --- |
| `GET /api/workspaces/:workspaceId/dashboard/summary` | Query: date range. Return approved counts and totals for students, groups, sessions, attendance, and payments in a bounded summary DTO. |
| `GET /api/workspaces/:workspaceId/reports/attendance` | Query: date range, group, student, and status; return aggregate attendance counts/rates using agreed denominator rules. |
| `GET /api/workspaces/:workspaceId/reports/finance` | Query: date range, student, group, and invoice/payment status; return invoice, collected, allocated, and outstanding totals using approved financial definitions. |

**Rules and tests:** Define each metric, timezone, date inclusivity, canceled-session
handling, inactive/archived record handling, and outstanding-balance formula before
coding. Enforce workspace access and bounded date ranges. Test aggregates against
known fixtures and ensure filtering does not mix workspaces.

**Acceptance:** The dashboard uses only server-derived real data; totals reconcile
with source records; empty periods return explicit zero/empty values; large reports
are bounded and indexed.

## 9. Testing strategy

No backend test runner, test script, or backend test files are currently configured.
Before feature work, choose a test approach compatible with the project's
TypeScript/Node setup and an isolated MongoDB test database; do not point tests at
development or production data.

For each phase, add focused tests for:

1. Zod/request validation and response serialization, including dates and Decimal128.
2. Authentication-required, inactive-user, non-member, suspended-workspace, and
   cross-workspace access cases.
3. Not-found, duplicate-key, invalid-state, and malformed-ID responses.
4. Model/service invariants and concurrent writes where unique constraints or
   capacity/allocation rules apply.
5. Route integration with a disposable database, including transaction behavior.
6. Regression coverage for existing register/login/logout/status and workspace owner
   flows before changing shared error or authorization middleware.

Run the TypeScript check (`tsc --noEmit -p tsconfig.json`) and the new targeted backend
suite in CI. The TypeScript check passed in this audit; no backend test suite was
available to run.

## 10. Recommended first implementation task

After approval, begin with **Phase 0: establish reusable workspace authorization,
validation-error handling, and API error/DTO conventions**, then implement **Phase 1:
Students and guardians** using the existing models. This addresses tenant isolation
before adding access paths to the sensitive student and guardian data, avoids
duplicating model definitions, and gives later modules a tested route/service pattern.

Do not begin payments or reports until their relationship checks, status transitions,
financial invariants, and metric definitions have explicit product decisions.
