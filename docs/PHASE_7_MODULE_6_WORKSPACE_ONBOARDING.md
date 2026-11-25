# Phase 7 Module 6 — Workspace Onboarding

## User flow

After authentication, protected application routes check the user's Workspace list. If an active Workspace is available, the existing Dashboard flow continues. If there is no usable Workspace, the user is routed to `/workspace/onboarding`.

The onboarding page handles these states:

- Loading the Workspace list, with a retry action on load failure.
- An active Workspace, which proceeds to the Dashboard.
- No active or suspended Workspace, which shows the create form.
- One or more suspended Workspaces, which explains that access is blocked and does not offer activation or replacement creation.
- Workspace creation and post-create verification, with separate loading, success, and error feedback.

The form requires a trimmed name of 2–120 characters and accepts an optional description of up to 1000 characters. Creation errors preserve the entered values. Submission is disabled while a request is pending, and a successful create response is never automatically resubmitted.

After `POST /api/workspaces` succeeds, the frontend refreshes `/api/workspaces/mine`, confirms that the returned Workspace ID appears with active status, and requests that Workspace by ID. The Dashboard opens only after the refreshed list and details response both confirm active access.

## Routes, components, and services

- `/workspace/onboarding` — authenticated onboarding route.
- Existing Workspace-protected routes — Dashboard, Reports, Finance, Invoices, Payments, Attendance, Sessions, Subjects, Groups, Students, and Guardians. These resolve the Workspace access state before loading the module.
- `WorkspaceOnboardingComponent` — reactive onboarding form and empty, suspended, loading, error, and verification states.
- `WorkspaceService` — shared Workspace list, create, and details requests; determines active and suspended Workspace states.
- `workspaceGuard` — sends authenticated users without an active Workspace to onboarding.
- Dashboard and Reports — use the shared active-Workspace service method rather than independently falling back to the first Workspace, which could be suspended.

## Existing API contracts used

All requests use the existing authenticated Workspace API and `withCredentials: true`:

- `GET /api/workspaces/mine` → `{ message, data: Workspace[] }`
- `POST /api/workspaces` with `{ name, description? }` → `{ message, data: Workspace }`
- `GET /api/workspaces/:workspaceId` → `{ message, data: Workspace }`

The frontend does not add API fields or status values. The existing active Workspace status is `active`; suspended Workspaces are treated as inaccessible. Backend ownership, membership, and authorization checks remain authoritative.

## Error and empty-state behavior

- Empty Workspace list: display the creation form.
- Suspended-only list: explain the suspended state; do not activate or create a replacement.
- Failure loading `/mine`: display the API/network error and allow retry.
- Validation or create failure: show the server/network message and keep the form values.
- Created Workspace absent or inactive in refreshed `/mine`: do not navigate; allow verification retry without another create request.
- Workspace details request failure or inactive/mismatched details: do not navigate; show a retry action.
- Malformed successful create response without a Workspace ID: do not resubmit; allow reloading the Workspace list and direct the user to support if verification remains unavailable.

## Tests and verification

Focused cases were added to the existing `client/src/app/app.spec.ts` (no separate spec file):

- Active and empty Workspace lists.
- Trimmed required-name validation.
- Successful creation, `/mine` refresh, details verification, and Dashboard navigation.
- Server validation and network errors while preserving form values.
- Workspace-list loading retry.
- Suspended Workspace state.
- Missing created Workspace from refreshed `/mine`, with no navigation or duplicate create.
- Duplicate-submit prevention while the create request is pending.
- Authenticated Dashboard routing and redirect to onboarding when no active Workspace exists.
- Workspace API paths, request body, response envelope, and credential inclusion.

Results:

- `npm test -- --watch=false` — passed, 68 tests.
- `npm run build` — passed (Angular production build).
- `git diff --check` — passed.

No live Workspace creation or running-backend workflow was tested. Tests use mocked services or Angular's HTTP testing utilities and do not access a database.

## Limitations

- Suspended Workspace activation is intentionally unsupported because this module does not add or assume authorization for an activation API.
- Workspace selection continues to use the first active Workspace, matching the existing service behavior; this module does not add a Workspace switcher.
- If the create request succeeds on the server but the response is lost, the client cannot determine the created ID from that failed response. The form preserves values and reports the network error; retrying creation may require user judgment. No idempotency endpoint or key exists in the contract used here.
- A user whose `/mine` response is empty while a hidden/inactive membership already exists may receive a backend conflict on creation. The frontend displays that server error and does not attempt to alter membership state.

## Change boundary

This module changes the Angular frontend only and does not modify backend source, authentication/session behavior, database configuration, or dependencies. It does not create database records during tests and no commit or push was made. The working tree also contains an unrelated change to `backend/package.json`; it was preserved and is not part of this module.
