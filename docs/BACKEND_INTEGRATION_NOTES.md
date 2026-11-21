# Darsly Backend Integration Notes

## Current frontend integration

The Angular frontend consumes the existing authentication API through `AuthService` and protects `/dashboard` with an auth-status check. Requests preserve the backend JWT cookie behavior with `withCredentials: true`; no bearer-token contract was introduced.

Environment values remain unchanged:

- `client/src/environments/environment.ts`: `apiBaseUrl: '/api'`, `production: true`
- `client/src/environments/environment.development.ts`: `apiBaseUrl: '/api'`, `production: false`

The dashboard uses the safe user returned by `/auth/status` for the teacher's name and email. It does not show fabricated student, group, session, attendance, payment, or report data.

## Existing backend endpoints

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/status`

Auth responses include `{ message, user }` (or `{ message }` for logout). Safe user fields are `id`, `name`, `email`, `status`, and `lastLoginAt`.

### Workspaces

- `POST /api/workspaces`
- `GET /api/workspaces/mine`
- `GET /api/workspaces/:workspaceId`
- `PATCH /api/workspaces/:workspaceId`
- `PATCH /api/workspaces/:workspaceId/suspend`
- `PATCH /api/workspaces/:workspaceId/activate`

Workspace routes require authentication and return `{ message, data }`.

## Unsupported dashboard domains

Backend models exist for students, groups, sessions, attendance, and payments, but no routes or controllers expose those operations. Reports and activity-feed APIs are also absent. The dashboard presents clearly labeled not-connected states for these sections until APIs and contracts are implemented.

No backend files were changed for the dashboard work.
