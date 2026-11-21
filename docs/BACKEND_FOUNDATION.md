# Darsly Backend Foundation

## Scope

Phase 0 adds shared backend primitives and automated regression tests. It does not add
student or other business APIs, change models, or connect to a database during tests.
The existing audit remains a record of the pre-Phase-0 baseline.

## Workspace authorization

`requireWorkspaceAccess()` is reusable on future routes after the existing JWT
authentication middleware. It obtains the user ID only from `req.user`, validates the
workspace ID, rechecks that the user is active, requires an active membership, and
requires an active workspace by default. `allowSuspended: true` is available only for
routes that intentionally need to view a suspended workspace.

Authorized handlers receive a typed `req.workspaceContext` containing the authenticated
user ID, workspace document, and active membership. The existing workspace service now
shares the active-user, membership, and workspace-resolution logic. Its existing
workspace detail route still permits members to view suspended workspaces; owner-only
updates and suspension/activation rules remain in the existing service.

This context does not replace resource-level tenant filters. Every future model lookup
and mutation must also include the workspace ID from this context so a resource ID
cannot cross workspace boundaries.

## Request validation

`validateRequest()` accepts Zod schemas for any combination of route `params`, `query`,
and `body`. Parsed output is stored on `req.validated`; consumers should use this
validated value rather than the unparsed input. Zod issues are converted to a safe
400 response with a field path and schema message.

Shared schemas in `backend/src/validators/common.validation.ts` define MongoDB
ObjectId validation and pagination query fields. Pagination defaults to page 1 and
page size 20, with a maximum page size of 100. `createPaginationMetadata()` returns
`page`, `pageSize`, `totalItems`, and `totalPages` (zero pages for an empty result).
These conventions are available for future list endpoints; existing workspace
responses were not changed.

## Error and response conventions

- Successful auth and workspace response bodies retain their existing shapes.
- Existing `AppError` responses retain `{ message, errorCode }`.
- Request-schema and Mongoose validation failures return 400. Zod detail paths are
  included only for request-schema failures.
- MongoDB duplicate-key errors return 409 with a generic conflict message.
- Malformed JSON returns 400.
- Unexpected errors return only `{ message: "Internal Server Error", errorCode:
  "ERR_INTERNAL" }`. Stack frames are logged server-side without logging the exception's
  first-line message; stack traces and raw errors are not sent to clients.

Date serialization uses `serializeDate()` and ISO 8601 UTC strings. Decimal128
serialization uses `serializeDecimal128()` and decimal strings to avoid floating-point
precision loss. These helpers do not change existing workspace document serialization.

## JWT configuration and security decisions

The insecure built-in JWT signing fallback has been removed. `JWT_SECRET` is now
required and must contain at least 32 UTF-8 bytes; configuration errors do not print the
configured value.

**Deployment requirement:** Set a persistent, high-entropy `JWT_SECRET` in every
environment before starting the updated backend. If the deployed secret is changed,
existing access tokens will no longer validate and users will need to authenticate
again. No configured secret value is recorded or displayed in this document.

The configurable JWT expiry and fixed cookie `maxAge` are still not aligned. This
existing behavior is intentionally unchanged in Phase 0 and should be addressed as a
separate, explicit authentication compatibility change.

## Test setup and commands

The backend uses Node's built-in `node:test` runner through the already-installed
`tsx`, with `tsconfig.test.json` type-checking source and tests; no package was added.
Run:

```powershell
cd backend
npm test
```

Tests use an ephemeral HTTP server and stub Mongoose model methods. They do not connect
to MongoDB or read application database data. The test process sets isolated
configuration before importing the app, and the app factory does not load dotenv.

The suite covers JWT configuration, auth register/login/logout/status and invalid
authentication, existing workspace create/list/read/update response contracts,
suspended-workspace visibility and access denial for workspace-scoped operations,
membership-derived context, malformed IDs, body/query validation, duplicate-key
mapping, safe unexpected-error responses, pagination metadata, and date/Decimal128
serialization.

## Compatibility decisions and verification

- The authenticated routes, successful response payloads, cookie name/flags, CORS
  setup, and workspace owner rules remain unchanged.
- Invalid auth payloads now produce 400 instead of falling through as 500; duplicate
  key races now produce 409. Unexpected errors no longer expose internal messages.
- Existing workspace detail reads still allow active members to see a suspended
  workspace. The new reusable middleware denies suspended workspaces by default.
- App setup moved into `backend/src/app.ts` so tests can create an Express app without
  starting the listener or connecting to MongoDB. `backend/src/index.ts` remains the
  runtime entry point and still starts the server and database connection.
- No request schema, model, route, or success response contract was changed.

Verification performed:

- `tsc --noEmit -p tsconfig.json` — passed.
- `npm test` — passed, 5 tests.
- Type-check of the test file and Express augmentation — passed.
- No frontend files or database data were changed.

## Remaining considerations

- Workspace creation still depends on MongoDB transaction support; this test suite
  stubs the transaction and does not verify a real replica-set deployment.
- Workspace API responses still serialize Mongoose documents directly. A future DTO
  migration should be separately planned to avoid changing existing response contracts.
- The new pagination and serialization helpers are conventions for future endpoints;
  no current business endpoint uses them yet.
- Future workspace-scoped services must include `workspaceId` in every resource query
  and verify referenced records belong to the same workspace.
- The JWT/cookie lifetime mismatch remains as noted above.
