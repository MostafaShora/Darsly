# Darsly Backend Integration Notes

## Current frontend readiness

The current frontend is a static landing page. It has no HTTP calls and no authentication or workspace UI flows.

Preserved environment contracts:

- `src/environments/environment.ts`: `apiBaseUrl: '/api'`, `production: true`
- `src/environments/environment.development.ts`: `apiBaseUrl: '/api'`, `production: false`

These values must not be renamed or replaced until a proven integration change is made.

## Existing backend areas

The backend exposes auth and workspace capabilities.

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/status`

The backend uses a JWT authentication cookie. Browser integration must preserve credential/cookie behavior and must not assume that auth should be implemented with a manually created bearer header.

Known auth response shapes:

- Register/login: `{ message, user }`
- Logout: `{ message }`
- Auth status: `{ message, user }`
- Safe user fields: `id`, `name`, `email`, `status`, `lastLoginAt`

Actual backend validation and user models remain the source of truth.

### Workspaces

- `POST /api/workspaces`
- `GET /api/workspaces/mine`
- `GET /api/workspaces/:workspaceId`
- `PATCH /api/workspaces/:workspaceId`
- `PATCH /api/workspaces/:workspaceId/suspend`
- `PATCH /api/workspaces/:workspaceId/activate`

Workspace routes require authentication. Current workspace responses use `{ message, data }` for successful operations.

## Landing page integration

The landing page is presentation-only and has no backend dependency:

- Hero, Features, Before/After, Daily Workflow, Audience, Final CTA, and Footer remain static.
- Journey steps remain static data in `features/landing/data/journey.data.ts`.
- Journey character assets remain local files under `public/assets`.

No fake API responses or placeholder backend calls should be added to these components.

## Recommended future integration

Future API code should be placed in typed application services under `src/app/core/services`.

Recommended service boundaries:

- `AuthService`: register, login, logout, status
- `WorkspaceService`: workspace CRUD and status changes

Recommended typed models under `src/app/core/models` should be derived from observed backend contracts rather than invented.

UI components should consume observable/service state and must not call `HttpClient` directly.

## Missing frontend work

No frontend auth models, auth state, HTTP interceptors, route guards, workspace models, or workspace services exist yet.

Before implementing them, confirm and type:

- Exact validation fields for registration and login
- Cookie and CORS requirements
- Error response structure
- Workspace request payload fields
- Workspace response fields
- Workspace member and role behavior
- Protected route behavior
