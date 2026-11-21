# Backend Phase 1: Students and Guardians

## Scope and compatibility

Phase 1 adds workspace-scoped Student and Guardian APIs and management of
StudentGuardian relationships. Existing authentication and workspace endpoints and
their response formats are unchanged. No model schema, index, database record, or
dependency was changed. The APIs use the existing Mongoose models and Phase 0
authorization, validation, error, pagination, and serialization conventions.

All endpoints require the existing JWT authentication and an active workspace
membership. The workspace must be active. The authenticated principal is resolved
again by the shared workspace middleware; services receive the workspace ID only
from `req.workspaceContext`. Client-supplied `workspaceId` fields are not accepted
by the request schemas and cannot control record ownership.

## Endpoints

All paths are prefixed with `/api/workspaces/:workspaceId`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/students` | List students |
| `POST` | `/students` | Create a student |
| `GET` | `/students/:studentId` | Read a student |
| `PATCH` | `/students/:studentId` | Update a student |
| `GET` | `/guardians` | List guardians |
| `POST` | `/guardians` | Create a guardian |
| `GET` | `/guardians/:guardianId` | Read a guardian |
| `PATCH` | `/guardians/:guardianId` | Update a guardian |
| `GET` | `/students/:studentId/guardians` | List a student's guardian links |
| `POST` | `/students/:studentId/guardians` | Link a guardian to a student |
| `PATCH` | `/students/:studentId/guardians/:guardianId` | Update a link |
| `DELETE` | `/students/:studentId/guardians/:guardianId` | Remove a link only |

Students and Guardians are not hard-deleted by these APIs. Removing a relationship
does not delete either profile.

### Request fields

Student creation accepts `name` (required), `phone`, `email`, `schoolName`, `grade`,
`status`, and `notes`. Updates accept any non-empty subset. Student status is
`active`, `inactive`, or `archived`.

Guardian creation accepts `name` and `phone` (required), plus `alternatePhone`,
`email`, `relationship`, and `notes`. Updates accept any non-empty subset.
Profile-level relationship is one of `father`, `mother`, `brother`, `sister`,
`relative`, or `other`.

Student listing accepts `page` (default 1), `pageSize` (default 20, maximum 100),
`search` (maximum 100 characters), and `status`. Guardian listing accepts the same
pagination and `search` fields. Search is literal, case-insensitive substring
matching over the supported name/contact/profile fields.

Creating a student-guardian link accepts `guardianId` (required), optional
link-level `relationship`, `isPrimary`, and `receivesNotifications`. Link updates
accept a non-empty subset of those optional fields. `receivesNotifications` maps to
the existing model field `canReceiveNotifications`; guardian profile relationship
and link relationship remain separate values.

### Response conventions

Responses use `{ "message": "...", "data": ... }`. List `data` is:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

Profile DTOs expose an `id` rather than the raw MongoDB `_id`, omit `workspaceId`,
serialize timestamps as ISO 8601 UTC strings, and represent absent optional contact
fields as `null`. Student and Guardian model defaults for `schoolName`, `grade`,
and `notes` are returned as empty strings. Link DTOs contain a Guardian summary, the
link relationship, `isPrimary`, `receivesNotifications`, and timestamps.

Invalid input and malformed MongoDB IDs return 400. Missing or cross-workspace
resources return 404. Inactive workspace membership returns 403; a suspended
workspace is unavailable through these routes. Duplicate database key conflicts,
including duplicate links or competing primary links, return 409 using the shared
safe error handler.

## Workspace and relationship integrity

Every Student and Guardian read, update, and list query is scoped by the authorized
workspace ID. Each relationship operation verifies that both referenced records
belong to that workspace and scopes link queries by workspace, student, and guardian.
Cross-workspace identifiers are reported as not found.

The existing unique indexes remain the database authority for duplicate relationship
and single-primary constraints. When setting a primary guardian, the service clears
the prior primary and sets the new link in a MongoDB transaction. It does not choose
a replacement when a primary link is removed or demoted. This transaction requires
a transaction-capable MongoDB deployment (normally a replica set); standalone
deployment support must be confirmed before release.

No automatic guardian merging or unique phone/email rule was introduced. The existing
models do not enforce unique Student or Guardian contact information, so duplicate
profiles remain possible by design.

## Implementation files

- `backend/src/routes/workspace.route.ts` — mounts the authenticated, workspace-gated
  feature routers.
- `backend/src/routes/student.route.ts` and `backend/src/routes/guardian.route.ts` —
  feature route definitions and validation middleware.
- `backend/src/controllers/student.controller.ts` and
  `backend/src/controllers/guardian.controller.ts` — HTTP response envelopes and DTO
  mapping.
- `backend/src/services/student.service.ts`,
  `backend/src/services/guardian.service.ts`, and
  `backend/src/services/student-guardian.service.ts` — workspace-scoped queries and
  relationship integrity.
- `backend/src/validators/student.validation.ts` and
  `backend/src/validators/guardian.validation.ts` — Zod request schemas.
- `backend/src/dtos/student.dto.ts` and `backend/src/dtos/guardian.dto.ts` — explicit
  response DTOs.
- `backend/test/phase1.test.ts` — HTTP-level tests with mocked persistence.
- `backend/package.json` — includes the Phase 1 test file in the existing test
  command.

The existing model files and indexes were inspected and reused without modification.

## Testing and verification

Run from `backend`:

```powershell
npm test
npx tsc --noEmit -p tsconfig.json
npm run build
```

The added tests cover workspace membership and suspended-workspace denial, malformed
IDs and invalid request bodies, workspace-derived create ownership, Student CRUD and
list pagination/search, Guardian CRUD/list serialization, relationship creation and
primary transaction behavior, notification-field mapping, relationship listing and
removal, and duplicate-key conflict mapping. Tests use an ephemeral HTTP server and
mocked Mongoose methods; they do not connect to MongoDB.

The primary-link tests verify service transaction flow with a mocked session. They do
not verify transaction behavior against a real replica set or establish deployment
topology. That remains an operational verification before production use.
