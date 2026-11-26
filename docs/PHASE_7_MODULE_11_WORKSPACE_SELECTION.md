# Phase 7 Module 11 — Workspace Selection (F6)

## Original issue and audit findings

The integration audit found that users had no way to choose between multiple Workspace memberships. Workspace consumers used the shared service's first active membership, so switching context was not possible.

The frontend already uses `GET /api/workspaces/mine` (`/api/workspaces/mine` at runtime) to load the authenticated user's memberships. The response is a `data` array of Workspace records that includes each membership's status; suspended Workspaces are returned as well as active ones. The backend returns memberships newest first. Existing feature APIs already accept the selected Workspace ID, so no backend contract or authorization change was needed.

No existing browser-storage convention was present for Workspace selection. Existing state was held in the root-provided `WorkspaceService`.

## Implementation and selection strategy

- Added a shared navigation selector. It lists available Workspaces, labels suspended entries, and disables them. With only one membership, it shows the current Workspace without an unnecessary dropdown.
- The default is the first active membership in the API's existing newest-first order.
- An explicit choice is saved in `localStorage` under a key scoped to the authenticated user ID. On initialization, the service waits for the latest `/api/workspaces/mine` response and restores the saved ID only when it matches an active membership in that response. Missing selections use the default; inaccessible or suspended IDs are removed and also fall back to the default. Browser storage is only a preference, never an authorization source.
- A user's explicit in-session choice is retained across `/mine` refreshes and route changes. It is reset when the authenticated user changes. If a previously valid choice later becomes unavailable during the same session, the service does not silently switch; the UI requests an explicit active selection.
- Suspended-only and empty membership states continue through the existing onboarding/suspended flow. Activation remains owner-authorized and uses the existing activation endpoint and server refresh/verification behavior.
- Dashboard, Reports, Finance, Students, Guardians, Subjects, Groups/Enrollments, Sessions, Attendance, Invoices, and Payments now observe shared Workspace changes. Workspace-specific display state is cleared before data is loaded for the newly selected Workspace.
- Existing request-generation guards invalidate earlier reads so late responses from the previous Workspace cannot replace current results. APIs continue to receive the currently selected Workspace ID; the selector does not replace backend authorization.

## Tests

Focused coverage was added to the existing Angular test suite for empty and single-membership states, valid stored selection, missing, invalid, and suspended stored selections, default and explicit selection, suspended-option rejection, preserving an explicit choice when it disappears, Dashboard and Students stale-response handling, and Workspace selector behavior. Existing onboarding, suspended-Workspace, and active-Workspace tests remain in the suite.

`npm test -- --watch=false` — **passed: 105 tests**.

## Verification

`npm run build` — **passed**.

`git diff --check` — **passed**.

## Limitations

If browser storage is unavailable or blocked, the selected Workspace still switches in shared in-memory state for the current page session; the selector reports that it could not persist the choice. Live API and browser verification were not performed.
