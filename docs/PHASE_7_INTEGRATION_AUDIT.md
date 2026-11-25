# Darsly Phase 7 Integration Audit

**Audit date:** 2026-11-25  
**Mode:** Read-only application audit. The only created file is this report.

## 1. Repository state

- Branch: `main`
- HEAD: `71fcfd36ed3bf61baa53502a6a82e56e5009945a`
- HEAD message: `feat(finance): implement payments management component and associated routes`
- Initial `git status --short`: clean.
- Recent Phase 7 commits:
  - Students and Guardians: `dfe77c1`, with follow-up `8142c9c`.
  - Subjects, Groups, and Enrollments: `fdcff10`.
  - Sessions: `d077b1e`.
  - Attendance: `b090167`.
  - Finance: `71fcfd3`.
- No branch or Git state changes were made. At completion, the expected status is this new report as untracked; no application files are changed.

## 2. Modules and evidence reviewed

Reviewed the Angular routes, auth guard, dashboard, reports, all Phase 7 feature components and templates, shared API services/models/utilities, and the single frontend test file. Compared their requests and response types with backend routes, validators, DTOs, workspace-access code, relevant services, tests, and Phase 7 documentation.

Audited modules:

1. Students and Guardians.
2. Subjects, Groups, and Enrollments.
3. Sessions.
4. Attendance.
5. Finance: Invoices, Payments, and Allocations.

This was static source inspection plus mocked frontend tests and a production build. **No workflow was manually verified in a running application.** No backend tests, server, database, migrations, or production/development services were run or accessed.

## 3. Navigation and routing

`client/src/app/app.routes.ts` protects all authenticated module routes with `authGuard`. Routes exist for Dashboard, Reports, Finance, Invoices, Payments, Students, Guardians, Subjects, Groups, Sessions, and Attendance.

- Students, Guardians, Subjects, Groups, and Sessions use their `:id` route for both details and the literal `new`; their components explicitly treat `new` as create mode and do not request a record with that ID.
- Invoice and Payment creation have explicit `/new` routes before their parameter routes.
- Related-page links exist across Dashboard, Reports, Student details, Groups, Sessions, Attendance, and Finance. Collection/detail pages provide return-to-list or dashboard links; most do not preserve list filters or page position.
- Direct Angular route matching is present in source. Whether browser refresh works on a deployed host depends on its SPA fallback/rewrite configuration, which was not runtime-tested.
- There is no wildcard/not-found route. An unmatched URL has no designed in-app not-found page.
- **Confirmed P2 issue:** Invoice and Payment detail components read route IDs from `ActivatedRoute.snapshot` only in their constructors. If Angular reuses the same `invoices/:invoiceId` or `payments/:paymentId` route while the parameter changes, the component does not subscribe to the new ID and may keep showing the previous record. No existing test covers changing between two IDs on the same route. See `InvoicesComponent` and `PaymentsComponent` in `client/src/app/features/finance/`.

## 4. Workflow integration findings

The frontend services use `/api/workspaces/:workspaceId/...`, send credentials, and unwrap the backend `{ message, data }` envelopes. The reviewed frontend DTO shapes match the backend DTOs for the fields used by these workflows.

| Workflow | Frontend path and APIs | Contract and integration assessment |
|---|---|---|
| Students and Guardians | `StudentsComponent`, `GuardiansComponent`, `PeopleService`; student/guardian list, create, read, update, and student-guardian list/create/update/delete routes. | Student and Guardian fields/statuses match backend validators/DTOs. Relationship payloads use `relationship`, `isPrimary`, and `receivesNotifications`; backend maps the latter to `canReceiveNotifications`. Backend relationship service enforces duplicate constraints and replaces the primary link transactionally. Guardian-to-student listing is not supported by the API; the UI documents that limitation instead of fabricating links. |
| Subjects, Groups, Enrollments | `SubjectsComponent`, `GroupsComponent`, `LearningService`; `/subjects`, `/groups`, group `/enrollments`, and workspace `/enrollments/:enrollmentId`. | Search, status, pagination, and request fields match validators. Group DTO `monthlyFee` remains a string and `capacity` nullable. Enrollment transitions use existing statuses. Backend capacity counts active enrollments and checks reactivation; the UI submits through those endpoints and surfaces conflicts. Related subject/student reads use the same workspace ID. |
| Sessions | `SessionsComponent`, `LearningService`; list/create/read/update `/sessions` routes and group lookup. | Query filters and write/update fields match session validators/DTOs. Local date-time values are validated and converted to UTC through the shared local date utility; end-after-start is checked in the UI and backend. Supported statuses are the existing session states. The session component does not issue attendance requests. |
| Attendance | `AttendanceComponent`, `LearningService`, `PeopleService`; session list/detail, group roster, session attendance list/create/update, student attendance history, and related student/group reads. | Request paths, filters, status values, and DTO fields align. The UI limits new records to eligible active enrollments and supported session states; backend remains authoritative for uniqueness and eligibility. History uses the API's recorded-at date range. |
| Finance | `InvoicesComponent`, `PaymentsComponent`, `FinanceOverviewComponent`, `FinanceService`; invoices list/create/read/update/issue/void/allocations, payments list/create/read/allocations, and related student/enrollment/group/dashboard reads. | Request/response fields match the existing validators and DTOs. Invoice creation is draft-only; payment creation does not send a status; allocation is explicit. Amounts remain decimal strings without floating-point parsing. Backend remains authoritative for issue/void eligibility, allocation limits, and balances. No payment edit/refund or allocation delete API is present. |
| Dashboard and Reports | `DashboardComponent`, `ReportsComponent`, `ReportService`; dashboard summary, attendance report, and finance report endpoints. | The timezone query and report filters match backend validators. Money values use strings. Export fetches report pages and checks maximum record counts and changes in totals/duplicate IDs. Export outputs HTML with an `.html` filename; the UI labels this as an HTML table. PDF output is browser print/save, not server-generated PDF. Interactive report tables are incomplete: attendance and payment rows show only page 1, and invoice/allocation rows are not rendered in the Finance tab (details in §8). |

### Dashboard scope supported by current data

The dashboard summary API supplies aggregate counts and financial/attendance values, not individual upcoming sessions or a recent-activity feed. The Dashboard schedule section is an informational link to Sessions, not a loaded schedule; its activity panel displays attendance/finance summary values. These are explicit limitations of the current UI/API combination, not evidence of runtime failure.

## 5. Workspace availability investigation — high priority

### Confirmed application path

1. Signup calls `AuthService.register()` → `POST /api/auth/register`.
2. Backend `registerService()` creates a User only; it does not create a Workspace or membership.
3. `WorkspaceService.getMyWorkspaces()` calls `GET /api/workspaces/mine` and unwraps `data`. `getActiveWorkspace()` selects the first item whose workspace `status` is `active`.
4. Dashboard and Reports independently call `/mine` and prefer an active workspace, but fall back to `workspaces[0]` when none is active.
5. The other management pages use `getActiveWorkspace()`. With an empty list (or only suspended workspaces), they display a no-active-workspace state and do not call their feature APIs.
6. Backend provides authenticated `POST /api/workspaces` with a `{ name, description? }` body. `createWorkspaceService()` creates an active Workspace and active owner membership. **No frontend Workspace creation/onboarding component, route, or service call exists.**

### Root-cause conclusion

- **Confirmed implementation gap:** A teacher who signs up through the provided UI receives an account but is not guided to create a Workspace. Without a Workspace created elsewhere, `/workspaces/mine` yields no active Workspace and the management modules cannot be used. This is a confirmed blocker for self-service onboarding.
- **Not established for the current user:** The audit did not call `/auth/status` or `/workspaces/mine` in a running app and did not inspect any live account/membership data. Therefore it cannot determine whether this user's actual situation is no Workspace, inactive membership, suspended Workspace, an authentication/API failure, or an external setup/deployment issue.
- Runtime evidence needed to distinguish these causes: sanitized HTTP status and response shape for `/api/auth/status` and `/api/workspaces/mine`; if `/mine` is `200` with an empty list, a read-only support/admin check of whether the authenticated user has any membership and its status is needed. A browser network error/status `0` or server error would instead point toward connectivity, cookie, CORS, or service availability and should be diagnosed from that evidence.

### Workspace status and membership edge cases

- `getMyWorkspacesService()` includes only memberships with `status: "active"`; invited or suspended memberships are omitted. Workspace resource access also requires active membership.
- `/mine` can return a Workspace whose own status is `suspended` when the membership is active. Management APIs require an active Workspace.
- Backend exposes `PATCH /api/workspaces/:workspaceId/activate` for an owner-suspended Workspace, but the frontend has no Workspace settings/activation UI or corresponding service method.
- **Confirmed P1 issue:** When the only returned Workspace is suspended, Dashboard and Reports select it through their `workspaces[0]` fallback and then call endpoints that require an active Workspace. They show a generic summary/report failure. Other feature pages instead show “no active Workspace.” The behavior is inconsistent and does not offer reactivation.

## 6. Workspace isolation and data consistency

- Feature components resolve a Workspace and pass its ID to list, detail, write, and related-entity requests. Related lookups within Students/Guardians, Groups, Sessions, Attendance, and Finance use the same component Workspace ID. No hardcoded Workspace IDs or persistent stale IDs were found.
- There is no shared Workspace selection signal/store or user-facing selector. Each feature independently requests `/mine` and selects the first active Workspace. This is not evidence of cross-Workspace disclosure; it does mean a user who belongs to multiple active Workspaces cannot choose which one to use. There is no Workspace-switch interaction whose stale-ID behavior could be tested.
- The client Workspace ID is only a route parameter, not an authorization boundary. Backend workspace middleware derives the user from JWT authentication and requires active membership and an active Workspace for feature endpoints.
- Backend tests include workspace-scoped lookup/reference checks across the Phase 1–6 suites. They are test evidence, not proof of behavior against a live MongoDB deployment. No real database was contacted.

## 7. Dates, money, pagination, and errors

- Session and payment date-time input uses local browser values converted to ISO UTC. Report date boundaries use local-day boundaries; report display/export formats timestamps with the browser's IANA timezone. Existing tests cover a non-UTC timezone (`America/Los_Angeles`) and the session local-time/DST behavior. No manual timezone verification occurred.
- Invoice period dates remain calendar-date strings; Finance and report money values remain decimal strings. The reviewed finance display and validation helpers do not use `Number`/`parseFloat` to calculate money.
- Feature list pages use backend pagination and distinguish loading, empty, and request-error states. Workspace errors are also represented separately from empty feature lists, although there is no Workspace creation action in those empty states.
- Reports export code retrieves all pages up to 10,000 rows per collection and rejects changed total counts, duplicate IDs, or mismatched final row counts. Existing tests cover all-page attendance and finance exports, the 10,000-row boundary, and changed totals.
- **Potential P2 export consistency limitation (not reproduced):** Page collection is not a server-side snapshot. If records are inserted/deleted between pages while each collection's total remains unchanged and no duplicate ID is returned, the current checks may not detect a mixed-time export. No snapshot/cursor contract was found.

## 8. Regression, automated tests, and documentation

### Checks run in this audit

- `cd client && npm test -- --watch=false` — **passed: 1 test file, 55 tests**.
- `cd client && npm run build` — **passed: Angular production build**.
- `git diff --check` — **passed** for the tracked diff; this new untracked report was separately checked for trailing whitespace with `rg` and passed.
- Backend tests/build were not run; this was a frontend-only audit, and no backend files changed.

Frontend tests use mocked API services/HTTP requests. They cover feature request paths and payloads, selected Workspace IDs in component calls, route guards, create-mode handling for tested routes, several loading/empty/error cases, date formatting/conversion, financial string precision, and report export pagination. This does **not** constitute end-to-end testing against a live backend, MongoDB, browser session, or real Workspace.

### Documentation comparison

- Module 1, Module 2, Module 4, and Module 5 documentation exists and generally matches the inspected UI/API boundaries.
- **Confirmed P2 documentation gap:** No `docs/PHASE_7_MODULE_3_SESSIONS.md` is tracked, although the Sessions UI and tests exist. The Module 4 document discusses session references but is not a dedicated Module 3 implementation record.
- Module 1 documentation correctly notes the missing guardian-to-students API. Module 5 correctly identifies browser print/PDF and HTML export behavior and does not present them as server-generated Excel/PDF.

## 9. Findings and recommended actions

| ID / severity | Finding and evidence | Status | Recommended next action |
|---|---|---|---|
| F1 — **P0 for self-service signup** | No self-service Workspace onboarding. `client/src/app/features/auth/pages/sign-up/sign-up.component.ts` (`SignUpComponent.submit()`) registers then navigates to `/dashboard`; `backend/src/services/auth.service.ts` (`registerService()`) creates only a User. `client/src/app/core/services/workspace.service.ts` only reads `/workspaces/mine`; `backend/src/routes/workspace.route.ts` supports `POST /`. | Confirmed code gap; whether it is the current user's cause is unverified. | Add an approved onboarding flow using the existing create endpoint, or provision Workspace/membership through a documented setup path. Do not infer this user's account state without runtime evidence. |
| F2 — **P1** | Suspended-workspace selection inconsistency. `client/src/app/features/dashboard/dashboard.component.ts` (`loadDashboard()`) and `client/src/app/features/reports/reports.component.ts` (constructor) use a first-item fallback; feature pages require an active Workspace through `client/src/app/core/services/workspace.service.ts` (`getActiveWorkspace()`). `backend/src/services/workspace.service.ts` includes suspended workspaces in `/mine`; `backend/src/middlewares/workspace-access.middleware.ts` enforces active status for feature access; `backend/src/routes/workspace.route.ts` exposes activation but the frontend has no UI. | Confirmed conditional behavior. | Make suspended/no-active states explicit and provide an owner-authorized recovery path using the existing activation API, if product-approved. |
| F3 — **P1** | Reports interactive data is incomplete. `client/src/app/features/reports/reports.component.ts` (`ReportsComponent.load()`) requests only page 1 (`pageSize: 100`); `client/src/app/features/reports/reports.component.html` has no pagination controls, renders attendance items and Finance payment items only, and does not render the Finance invoices or allocations collections returned by the API. Summary totals can therefore describe more data than the visible table. Export does fetch all pages and all three Finance collections. | Confirmed. | Add pagination for visible collections and invoice/allocation tables, or explicitly disclose the display cap and which records are export-only. |
| F4 — **P2** | Finance detail views read IDs from route snapshots only: `client/src/app/features/finance/invoices.component.ts` and `client/src/app/features/finance/payments.component.ts` constructors; no `paramMap` subscription exists for those dynamic routes. | Confirmed static lifecycle risk; not manually reproduced. | Observe route parameter changes and reload/reset detail state, with a regression test for navigating between two IDs on the same parameter route. |
| F5 — **P2** | No wildcard route in `client/src/app/app.routes.ts`, so invalid URLs have no designed not-found experience. | Confirmed. | Add a not-found route if desired; ensure it does not shadow authenticated routes. |
| F6 — **P2** | No Workspace selector; feature components independently call `client/src/app/core/services/workspace.service.ts` (`getActiveWorkspace()`). Backend `backend/src/services/workspace.service.ts` (`getMyWorkspacesService()`) may return multiple active memberships. | Confirmed limitation; impact depends on user memberships. | Decide whether multiple-workspace users are supported; if so, add a shared selection/context flow rather than independent selection. |
| F7 — **P2** | Dashboard schedule area in `client/src/app/features/dashboard/dashboard.component.html` is a navigation placeholder, not a list of today/upcoming sessions; `client/src/app/core/services/report.service.ts`'s summary DTO has no recent-activity feed. | Confirmed current scope/data limitation, not a runtime defect. | If the dashboard is expected to show upcoming sessions/activity, consume the existing sessions endpoint where suitable or define the needed API contract before claiming the feature is present. |
| F8 — **P2 / suspicion** | `client/src/app/features/reports/reports.component.ts` (`fetchAllAttendance()`, `fetchAllFinance()`) validates totals, duplicate IDs, and row counts but has no snapshot token; a same-count replacement during collection could evade detection. | Potential consistency issue; not reproduced. | Consider a stable server snapshot/cursor or a documented best-effort consistency guarantee before relying on exports as point-in-time records. |
| F9 — **P2** | Dedicated Phase 7 Module 3 Sessions documentation is absent from `docs/`; the tracked Phase 7 reports include Modules 1, 2, 4, and 5. | Confirmed documentation gap. | Add a Sessions implementation report when documentation work is authorized; do not rewrite historical reports. |

## 10. Limitations and unverified behavior

- No application browser session was available for this audit, and no account-specific Workspace response was obtained. No claim is made that any workflow was manually verified.
- Deployment SPA rewrites, live cookies/CORS, actual API availability, actual Workspace/membership records, MongoDB transactions, and production data isolation were not runtime-verified.
- Mocked frontend tests prove tested client behavior only. The backend suites were not executed as part of this audit.
- RTL/responsive styles and accessible labels are present in inspected templates, but no screen-reader, keyboard-only, or viewport/browser accessibility session was performed.

## 11. Suggested next implementation step

First resolve Workspace onboarding: obtain sanitized runtime evidence for `/auth/status` and `/workspaces/mine` for the affected account, then implement the smallest approved onboarding/recovery path using the existing Workspace API. This addresses the confirmed self-service blocker without assuming the current account's cause or changing authentication, backend rules, or deployment configuration. Afterward, prioritize the suspended-workspace handling and report-table pagination findings.
