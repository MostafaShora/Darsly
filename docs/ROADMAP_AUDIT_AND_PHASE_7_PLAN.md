# Darsly Roadmap Audit and Phase 7 Plan

## 1. Current Project Status

### Audit snapshot

- Branch: `main`
- Commit: `c47d7cf` (`feat: Add timezone formatting for report dates and timestamps in reports component`)
- The working tree was clean before this report was created.
- No application source was changed for this audit. No database connection or migration was attempted.

### Architecture

- **Backend:** TypeScript, Express 5, Mongoose 9, Zod, cookie-based JWT authentication, and workspace-scoped route middleware. The source contains 15 Mongoose models, 10 route modules, controllers, domain services, validators, and DTO serializers.
- **Frontend:** Angular 22 standalone components, Angular Router, Signals, RxJS, Reactive Forms, Tailwind CSS, and the existing Lucide integration. Current application routes cover the landing page, sign-in, sign-up, dashboard, and reports.
- **Tests:** Backend uses Node's test runner with `tsx`; frontend uses Vitest through Angular's test command. The backend suite uses model/service stubs and does not connect to MongoDB.

### Implemented capability versus usable product flow

The backend has workspace-scoped domain APIs for students and guardians, subjects and groups, enrollments, sessions and attendance, invoices and payments, and dashboard/report reads. The Angular app currently exposes authentication, dashboard, and reports; it does not expose teacher-facing CRUD pages for those operational domains. As a result, most of the domain APIs are not yet usable through the normal teacher interface.

The Dashboard consumes the authenticated teacher and report summary. Its schedule and several management sections remain explicit placeholders. The Reports page is connected to the report APIs and supports filtered report viewing and local export/printing. There is no activity-feed model or API.

## 2. Completed Phases

The following status reflects the current source, not the age or wording of a historical plan.

| Area | Verified implementation | Remaining product gap |
| --- | --- | --- |
| Foundation and authentication | Registration, login, logout, status, JWT cookie handling, workspace creation/list/read/update/suspension, active membership checks, request validation, and common API helpers. | No password recovery, membership invitation/management UI, or platform administration experience. The workspace service still validates its own request input rather than using the same route-level Zod pattern used by feature routes. |
| Students and guardians | Workspace-scoped student and guardian APIs, student-guardian links, primary-contact constraints, search/list pagination, and DTO serialization. | No Angular management pages or guardian sign-in/portal. Guardian notification preference data does not send notifications. |
| Subjects, groups, and enrollments | APIs for subject/group management and enrollment create/list/read/update, including workspace reference checks, status/date rules, capacity checks, and transaction-backed capacity changes. | No Angular setup or enrollment-management pages. |
| Sessions and attendance | APIs for one-time sessions, date/group/status filtering, session attendance, student attendance history, and attendance correction. Attendance requires eligible active enrollment and does not synthesize missing records as absences. | No teacher schedule or attendance-taking page. No recurrence, overlap policy, or saved teacher timezone preference is implemented. |
| Invoices, payments, and allocations | APIs for invoice drafts/issuance/voiding, payment records, explicit allocations, exact decimal handling, and related summaries. | No invoice/payment operations UI. Refunds, reversals, and correction workflows are not represented by the current API. The actual deployed allocation-index state has not been inspected. |
| Reports and dashboard | Workspace-scoped dashboard, attendance, and finance read endpoints; timezone-aware report ranges; historical finance safeguards; Angular report filters and exports. | Dashboard schedule and operational sections remain placeholders. Reports are read-only and depend on records being created through APIs or other means. |

### Reporting definitions already present

- Attendance rate is `(present + late) / (present + absent + late)`. Excused records and sessions that are cancelled or have not started are excluded; an unrecorded student is not treated as absent. A zero denominator produces an unavailable rate.
- Group occupancy counts active enrollments. Unlimited capacity has no percentage.
- Finance reports distinguish invoice issue time, payment receipt time, allocation creation time, and invoice void time. Missing historical lifecycle timestamps can make historical totals unavailable rather than definitive.
- Report dates use the teacher browser's IANA timezone, convert local period boundaries to UTC, and serialize stored dates as UTC timestamps.

## 3. Incomplete Features and Technical Debt

### Product gaps

- The core teacher workflows for maintaining students, guardians, subjects, groups, enrollments, sessions, and attendance have APIs but no Angular management interface.
- The Dashboard's today's schedule and recent activity are not implemented as live sections. No activity model/feed exists.
- There is no invoice/payment operations UI, guardian/student portal, notification delivery, or account/workspace settings experience.
- Workspace membership models include roles and statuses, but invitation and membership-management endpoints are not mounted.
- Workspace currency is currently fixed to EGP. Teacher timezone is inferred from the browser rather than saved as a preference.

### Technical and operational risks

- **Database integration is unverified.** Tests stub Mongoose operations. They do not prove replica-set transactions, write-conflict retries, concurrency behavior, deployed indexes, or real aggregation behavior.
- **Index state is unknown.** The current PaymentAllocation schema declares a non-unique compound index to permit incremental allocations. Documentation describes a controlled replacement of a legacy unique index, but no database was queried; the index actually present in any deployment is unknown. Do not enable repeated same-pair allocations in a database until its index is inspected and migrated under an approved operational procedure.
- **JWT/cookie lifetime mismatch remains in current code.** `JWT_EXPIRES_IN` defaults to 15 minutes while the cookie `maxAge` is seven days. This is unrelated to Phase 7 UI scope and should be handled as a separate, explicitly approved authentication correction.
- **Schedule policy is intentionally incomplete.** Sessions are individual time ranges; recurrence and overlap rules are not implemented. The current session service verifies the group exists in the workspace but does not check the group's active status when creating a session; confirm the intended policy before adding UI-side restrictions.
- **Financial mutation boundaries are limited.** Existing APIs do not expose refund/reversal operations or a correction history for immutable allocations. A future finance UI must not invent those behaviors.
- **Historical documentation is inconsistent.** `BACKEND_AUDIT_AND_API_PLAN.md`, `BACKEND_INTEGRATION_NOTES.md`, `FRONTEND_AUDIT.md`, and `DASHBOARD_IMPLEMENTATION.md` contain pre-implementation statements that domain/report APIs are missing. The older roadmap also labels financial work as Phase 5, while current approved project history identifies it as Phase 4 and reports/dashboard as Phase 6. Treat current source and the later phase implementation reports as authoritative; reconcile stale documentation in a separate documentation task.
- A source search found no application `TODO`/`FIXME` markers, but the explicit UI placeholders above remain incomplete features.

## 4. Integration Testing Gaps

1. Add a disposable, isolated MongoDB replica-set test environment before relying on transaction-backed workflows. Cover workspace creation, primary guardian changes, enrollment capacity under concurrent writes, and payment allocation atomicity/duplicate-index behavior.
2. Exercise complete API flows against real MongoDB in that test environment: workspace → student/guardian → subject/group → enrollment → session → attendance → report. Include negative cross-workspace references at every boundary.
3. Verify deployed index definitions and query plans against representative test data. Do not infer the live database state from Mongoose schema declarations.
4. Add end-to-end checks for the Angular-to-API workflows when their management pages are introduced. Current frontend tests are unit/component tests; no automated browser-to-real-API integration environment is configured.
5. Backend `npm test` passed **70/70** during this audit. Frontend `npm test -- --watch=false` initially had the 10,000-row export test exceed Vitest's five-second timeout while running alongside backend tests; rerunning the frontend suite alone passed **11/11**. This points to a test-duration margin issue, not a reproduced functional failure. Keep the export-limit behavior covered without relying on an unusually tight timing threshold.
6. These test results do not establish production database connectivity, transaction support, or index state. No production or development database was accessed.

## 5. Phase 7 Proposal

### Recommended Phase 7: Teacher Core Operations

Build the missing Angular workflows for **Students and Guardians, Subjects and Groups/Enrollments, Sessions, and Attendance**, using the existing workspace APIs. This is the highest-value next product phase because the platform currently has domain APIs and reports but lacks the normal teacher interface for creating and maintaining the data those reports depend on. Keep a disposable MongoDB integration suite as a release gate for the workflows that depend on transactions and indexes.

### Problem and beneficiaries

Teachers cannot currently perform the routine operations that populate the system through the web app. The primary beneficiaries are teachers managing their own workspace. Guardians are managed as teacher-owned contacts in this phase; they do not receive accounts or direct access.

### Proposed functionality

1. **Students and guardians:** paginated/searchable student list, create/edit, supported status changes, student details, guardian contacts, and student-guardian relationship management.
2. **Subjects, groups, and enrollments:** subject/group setup, group details and capacity visibility, group enrollment roster, enrollment creation, and supported enrollment status transitions.
3. **Sessions:** date-range schedule/list, group and status filters, session create/edit, and explicit status changes supported by the existing API. Keep the initial schedule to individual sessions; do not assume recurrence or conflict policy.
4. **Attendance:** session roster, persisted attendance display, and record/correction actions using the existing status and late-minute contract. Missing attendance records must remain “not recorded,” not silently become absences.
5. **Shared UX:** loading, empty, validation, and API error states; keyboard operation; Arabic RTL and responsive layouts; preserve existing auth/workspace boundaries and do not display fabricated records or statistics.

### Scope and out of scope

**In scope:** Angular pages and navigation for the four operational areas; Reactive Forms for create/edit; using current paginated APIs; workspace-safe client request construction; focused component/API contract tests; database-backed integration tests in a disposable replica set before release.

**Out of scope:** backend business-rule changes, new models/indexes, recurrence and schedule-overlap rules, student/guardian authentication, notification delivery, invoice/payment operations, refund/reversal behavior, multi-currency, and authentication changes. Any confirmed API gap must be proposed separately before changing its contract.

## 6. Scope and Out of Scope

Phase 7 should expose existing capabilities without changing Phase 1–6 business rules. It should not replace working APIs with static client data, add new dependencies without approval, or change auth, JWT, cookies, or workspace authorization.

The frontend should use the existing design system and standalone component conventions. Keep forms accessible, use the existing pagination/filter contracts, and explicitly represent statuses and empty data. Do not add recurrence, automatic absence marking, or restrictions beyond the current API unless product rules are approved.

## 7. Proposed API and Data Model Changes

### Existing APIs to reuse

All paths below are under `/api/workspaces/:workspaceId` and are already mounted:

- Students: `GET/POST /students`, `GET/PATCH /students/:studentId`; guardian-link list/create/update/remove under `/students/:studentId/guardians`.
- Guardians: `GET/POST /guardians`, `GET/PATCH /guardians/:guardianId`.
- Subjects: `GET/POST /subjects`, `GET/PATCH /subjects/:subjectId`.
- Groups and enrollments: `GET/POST /groups`, `GET/PATCH /groups/:groupId`, group enrollment list/create under `/groups/:groupId/enrollments`, and enrollment list/read/update under `/enrollments`.
- Sessions and attendance: `GET/POST /sessions`, `GET/PATCH /sessions/:sessionId`, session attendance list/create/update under `/sessions/:sessionId/attendance`, and student history under `/students/:studentId/attendance`.

### Data/API posture

- No model or index change is proposed. Reuse existing workspace-scoped models, status values, DTOs, validators, and pagination.
- First verify that current list/detail DTOs provide enough data for the UI without unbounded requests. Session attendance currently lists persisted records; the roster is based on group enrollments. Compose those paginated sources before considering a new endpoint.
- If real roster sizes or measured client request volume make composition unsuitable, propose an additive workspace-scoped session-roster read endpoint that returns active eligible enrollments with any persisted attendance for that session. It must not synthesize attendance records or modify existing attendance semantics. This endpoint is conditional, not part of the approved API contract.
- Before designing the schedule page, decide whether sessions may be created for inactive/archived groups. The current service checks workspace ownership/existence, not group status.

## 8. Frontend Impact

Proposed guarded routes:

- `/students` and student detail/edit views.
- `/groups` for subjects, groups, and enrollment management.
- `/sessions` for the date-range schedule and session management.
- A session attendance view reachable from `/sessions`.

The current dashboard links and feature cards should navigate only to implemented pages; unavailable finance and activity features must remain clearly marked as not connected until their phases are approved. Date entry/display should use the browser's IANA timezone and the existing ISO-offset API contracts. Keep workspace identity explicit in every request and preserve current cookie-based authentication.

## 9. Acceptance Criteria

1. Teachers can create, list, search, view, and update the supported student/contact records in their active workspace using real APIs.
2. Teachers can manage subjects, groups, and enrollments using existing status/capacity rules; no hard deletion is introduced.
3. Teachers can list and manage individual sessions and record/correct attendance under the existing eligibility rules.
4. Every list is paginated; filters, empty results, loading, validation failures, and server failures have clear accessible UI states.
5. Cross-workspace identifiers never reveal or mutate foreign records; backend authorization remains authoritative.
6. No absent record is inferred from missing attendance, no schedule recurrence/overlap rule is invented, and no fake data is presented.
7. Arabic RTL and responsive layouts work across the new flows; keyboard focus and form errors are usable.
8. Backend contract tests and Angular tests pass. Replica-set integration tests verify transactions, indexes, and cross-workspace behavior in an isolated test database before release.
9. Existing auth behavior, report calculations, and Phase 1–6 API contracts remain unchanged unless an approved, separately tested correction is required.

## 10. Risks and Dependencies

- Depends on the existing workspace access middleware and APIs from the student, guardian, group, enrollment, session, and attendance phases.
- API DTOs may require client-side composition for a session roster. Measure and keep requests paginated; only propose a new roster endpoint if required by actual response shapes or performance.
- MongoDB transaction support and the PaymentAllocation index migration remain deployment prerequisites for the affected workflows. They are not verified by the local mocked tests.
- Current sessions are UTC instants with browser-local input/display; no saved timezone preference exists. DST and local-day boundaries need focused frontend/API tests.
- Clarify whether group status affects session creation and whether multi-workspace selection is a supported teacher journey.
- Financial mutation pages should follow as a separate phase after invoice/payment/refund and allocation-correction behavior is specified.
- The JWT expiry/cookie lifetime mismatch, stale documentation, and production hardening are separate concerns and must not be silently bundled into Phase 7.

## 11. Suggested Future Phases

1. **Phase 8 — Financial operations UI:** invoice creation/issuance/voiding, payment entry, and allocation workflows using existing APIs; first define how refunds, reversals, and corrections should work.
2. **Phase 9 — Notifications and guardian experience:** decide event triggers, delivery channels/provider, consent meaning for `canReceiveNotifications`, authentication, access scope, retention, and failure/retry behavior before implementation.
3. **Phase 10 — Workspace settings and collaboration:** teacher timezone/currency preferences, workspace selection, and member invitation/role management. Currency changes require an explicit financial migration/business policy.
4. **Phase 11 — Audit history and exports:** define immutable audit events, retention, access controls, and export scope. Treat backups and restore drills primarily as operational infrastructure, not as a UI feature.
5. **Cross-cutting pre-release readiness:** resolve the JWT/cookie lifetime contract in a separately approved security task; run isolated replica-set integration tests; verify index migrations and backup/restore procedures; and review production error handling, rate limits, and security headers.

### Open decisions before Phase 7 approval

- Should sessions be allowed for inactive or archived groups?
- Is the initial schedule intentionally limited to individual sessions, with no recurrence or overlap detection?
- Should teacher timezone remain browser-derived, or become a workspace/teacher preference later?
- Which student/group fields and status transitions should be editable from the UI?
- Is workspace selection needed if a user can later hold multiple active memberships?
- What is the approved attendance UX for students without an attendance record: explicit per-student marking only, or a separately confirmed bulk action?

**Recommendation:** Approve Phase 7 as the teacher's core student-to-attendance workflow, with database-backed integration testing as a release gate. Defer financial operations, notifications, and guardian access until their remaining business rules are approved. No Phase 7 implementation is included in this report.
