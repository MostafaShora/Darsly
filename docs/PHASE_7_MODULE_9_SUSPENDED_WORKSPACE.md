# Phase 7 Module 9 — Suspended Workspace Handling (F2)

## Root cause and audit notes

The integration audit identified a Dashboard and Reports fallback that could choose `workspaces[0]` when no active Workspace existed. In the current checkout before this module, that fallback had already been removed: `WorkspaceService.getActiveWorkspace()` selected only an active Workspace, and Dashboard and Reports did not send their data requests when it returned `null`.

The remaining F2 gap was that those pages lost the distinction between an empty membership list and a suspended Workspace, and the onboarding page displayed suspended state without a recovery action. This module centralizes the availability classification and provides a guarded owner recovery flow.

## API contracts and authorization checked

- `GET /api/workspaces/mine` returns `{ message, data }`; `data` is a Workspace array. The backend filters to active memberships but includes suspended Workspace records so members can see their status. The existing Workspace response includes `ownerId` and `suspensionType`.
- `PATCH /api/workspaces/:workspaceId/activate` accepts no request body and returns `{ message, data: workspace }`.
- Backend `activateWorkspaceService()` requires an active user, valid Workspace ID, active membership with role `owner`, and matching `workspace.ownerId`. It rejects already-active Workspaces, administrative suspensions, and inconsistent/incomplete owner-suspension metadata. The existing access middleware also requires active Workspace status for feature APIs.
- The authenticated user response exposes `user.id`. The UI offers activation only when this matches `workspace.ownerId` and `suspensionType` is `owner`. `/mine` establishes active membership; the backend creates the owner membership with role `owner`, and no role-change path exists in the inspected backend. The backend remains authoritative and verifies both conditions on activation.

## State handling

`WorkspaceService` now classifies availability as `active`, `suspended`, or `unavailable`; request failures remain explicit errors. Selection continues to use the first active Workspace only, never the first list item as a fallback. Dashboard and Reports consume the shared classification, request data only for an active Workspace, clear report/summary data when the Workspace is refreshed as unavailable or suspended, and expose a status refresh/retry path.

The existing route guard sends authenticated users without an active Workspace to `/workspace/onboarding`. That screen now shows activation only for a matching owner and owner-initiated suspension. Activation is user-triggered, duplicate submissions are blocked, and the UI reloads `/mine` and verifies the same Workspace is active before navigating to Dashboard. Administrative suspensions and non-owner views show guidance without an activation action.

## Files changed

- `client/src/app/core/models/workspace.models.ts`
- `client/src/app/core/services/workspace.service.ts`
- `client/src/app/features/dashboard/dashboard.component.ts`
- `client/src/app/features/dashboard/dashboard.component.html`
- `client/src/app/features/reports/reports.component.ts`
- `client/src/app/features/reports/reports.component.html`
- `client/src/app/features/workspace/workspace-onboarding.component.ts`
- `client/src/app/features/workspace/workspace-onboarding.component.html`
- `client/src/app/app.spec.ts`
- `docs/PHASE_7_MODULE_9_SUSPENDED_WORKSPACE.md`

This module changed no backend, authentication, deployment, environment, database, or dependency files. The final worktree inspection found `backend/src/app.ts` deleted and `backend/src/index.ts` modified, although both were clean at the initial inspection. These changes were not made by this module; their origin was not established, and they were left untouched.

## Tests and verification

- `npm test -- --watch=false` from `client` — passed; 91 tests.
- `npm run build` from `client` — passed; Angular production build completed.
- `git diff --check` — passed.

Focused mocked tests cover active-only Workspace selection, suspended and empty states, Dashboard and Reports API gating, clearing stale data, owner and non-owner activation UI, server-confirmed activation refresh, duplicate prevention, and activation errors. No real database, external service, or live Workspace activation was used.

## Remaining limitations

- Workspace membership role is not included in `/mine`; the activation action uses the authenticated ID and Workspace `ownerId` plus owner suspension metadata. The backend independently enforces the active owner role and remains the final authorization boundary.
- A suspended Workspace state is refreshed on route guard navigation or explicit status refresh; the frontend does not poll for server-side status changes.
- No live/manual browser workflow or backend test suite was run.
