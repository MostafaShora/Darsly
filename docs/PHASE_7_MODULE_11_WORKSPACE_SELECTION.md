# Phase 7 Module 11 — Workspace Selection (F6)

## Original issue and audit findings

The integration audit found that users had no way to choose between multiple Workspace memberships. Workspace consumers used the shared service's first active membership, so switching context was not possible.

The frontend already uses `GET /api/workspaces/mine` (`/api/workspaces/mine` at runtime) to load the authenticated user's memberships. The response is a `data` array of Workspace records that includes each membership's status; suspended Workspaces are returned as well as active ones. The backend returns memberships newest first. Existing feature APIs already accept the selected Workspace ID, so no backend contract or authorization change was needed.

No existing browser-storage convention was present for Workspace selection. Existing state was held in the root-provided `WorkspaceService`.

## Implementation and selection strategy

- Added a shared navigation selector. It lists available Workspaces, labels suspended entries, and disables them. With only one membership, it shows the current Workspace without an unnecessary dropdown.
- The default is the first active membership in the API's existing newest-first order.
- A user's explicit choice is retained across `/mine` refreshes and route changes. It is reset when the authenticated user changes. If that chosen Workspace is no longer active, the service does not silently choose another; the UI requests an explicit active selection.
- Suspended-only and empty membership states continue through the existing onboarding/suspended flow. Activation remains owner-authorized and uses the existing activation endpoint and server refresh/verification behavior.
- Dashboard, Reports, Finance, Students, Guardians, Subjects, Groups/Enrollments, Sessions, Attendance, Invoices, and Payments now observe shared Workspace changes. Workspace-specific display state is cleared before data is loaded for the newly selected Workspace.
- Existing request-generation guards invalidate earlier reads so late responses from the previous Workspace cannot replace current results. APIs continue to receive the currently selected Workspace ID; the selector does not replace backend authorization.

## Tests

Focused coverage was added to the existing Angular test suite for empty and single-membership states, default and explicit selection, suspended-option rejection, preserving an explicit choice when it disappears, Dashboard and Students stale-response handling, and Workspace selector behavior. Existing onboarding, suspended-Workspace, and active-Workspace tests remain in the suite.

`npm test -- --watch=false` — **passed: 101 tests**.

## Verification

`npm run build` — **passed**.

`git diff --check` — **passed**.

## Limitations

The selected Workspace is shared in-memory state, consistent with the existing application convention. It survives in-app navigation and Workspace list refreshes but resets on a full page reload; the API's safe newest-first active default is then applied again. Browser persistence was not added because the project had no existing Workspace persistence convention.

Live API and browser verification were not performed.
