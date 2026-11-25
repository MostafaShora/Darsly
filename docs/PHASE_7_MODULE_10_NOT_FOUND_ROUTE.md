# Phase 7 Module 10 — Not Found Route

## Root cause

The Angular route table had no wildcard route, so unknown application URLs did not resolve to a purpose-built Darsly page.

## Implementation

- Added a standalone, lazy-loaded Arabic Not Found page with RTL layout, the existing Darsly logo, a clear 404 message, and links to the Dashboard and public home page.
- Registered the unguarded `**` route after all existing routes.
- The Dashboard link relies on the existing guards: unauthenticated users are sent through the existing sign-in flow, and authenticated users without an active Workspace are sent to Workspace onboarding. The Not Found page does not duplicate authentication or Workspace selection logic.

## Routes and API contracts

No API or backend changes were made. The page itself makes no requests. Its Dashboard navigation uses existing route guards and contracts:

- `GET /api/auth/status` for authentication status.
- `GET /api/workspaces/mine` for active Workspace access.
- The existing Dashboard summary request only after the guards confirm an active Workspace.

Tests use Angular's HTTP testing utilities and mocked responses; they do not contact a development or production backend.

## Files changed

- `client/src/app/app.routes.ts`
- `client/src/app/app.spec.ts`
- `client/src/app/features/not-found/not-found.component.ts`
- `client/src/app/features/not-found/not-found.component.html`
- `docs/PHASE_7_MODULE_10_NOT_FOUND_ROUTE.md`

## Tests and verification

- `npm test -- --watch=false` — passed, 95 tests.
- `npm run build` — passed; Angular production bundles generated successfully.
- `git diff --check` — passed.

The test coverage verifies unknown URL rendering, the existing public routes, Dashboard navigation with an active Workspace, and the existing sign-in and onboarding guard destinations.

## Remaining limitations

The route and guard behavior were verified with mocked HTTP responses. No manual browser session or live backend was used. Deployment-level SPA fallback behavior for direct requests to unknown URLs was not changed or verified.
