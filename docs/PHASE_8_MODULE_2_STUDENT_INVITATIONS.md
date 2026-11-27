# Phase 8 Module 2 — Student Invitations Foundation

## Scope and approved expiration policy

This module adds authenticated, Workspace-scoped teacher operations for invitations to existing active Student records. Phase 8.3 builds redemption, OTP verification, teacher approval, and StudentAccountLink activation on this model. Student Portal APIs remain out of scope.

The approved product policy is a fixed lifetime of **7 days from creation**. Teachers cannot select or modify the duration. `expiresAt` is set to exactly seven days after the model's `createdAt`. An invitation is expired when `now >= expiresAt`; its effective status is derived at response time rather than persisted as a mutable status.

## Model and indexes

`StudentInvitation` stores only:

- `workspaceId`, `studentId`, and `createdBy` references.
- `secretHash`, with Mongoose `select: false`.
- `expiresAt`, `revokedAt`, `revokedBy`, and `consumedAt`.
- Mongoose timestamps.

It does not copy Student profile fields or persist the raw invitation secret. Revocation is represented explicitly by `revokedAt` and `revokedBy`. Effective status is `consumed` when `consumedAt` is set, otherwise `revoked` when `revokedAt` is set, otherwise `expired` when `now >= expiresAt`, otherwise `active`.

The schema declares these indexes:

- `{ secretHash: 1 }` — unique, for future exact secret-hash lookup.
- `{ workspaceId: 1, createdAt: -1 }` — non-unique, for Workspace-scoped listing.
- `{ workspaceId: 1, studentId: 1, createdAt: -1 }` — non-unique, for Workspace/Student-scoped listing.

There is deliberately no unique Workspace/Student index, so a Student may receive later invitations after an earlier invitation expires or is revoked. No index creation was run, and deployed database indexes have not been verified.

## Secret handling

Creation uses Node.js `randomBytes(32)` and hex encoding to produce a 256-bit secret. The service stores only its SHA-256 hash. The raw secret is returned once in the create response as `invitationSecret`; list, detail, and revoke responses use a metadata DTO that omits both the hash and creator reference. The hash is excluded from normal Mongoose selections and is never logged.

No endpoint accepts or redeems invitation secrets in this module. A future redemption implementation must compare hashes in constant time and separately enforce all account, invitation, Student, and Workspace rules.

## API contract and authorization

All endpoints are mounted under `/workspaces/:workspaceId/student-invitations`. The Workspace router applies JWT authentication and `requireWorkspaceAccess()` before the invitation router. That existing boundary requires an active teacher-capable User, an active Workspace membership, and an active Workspace. Controllers use `workspaceContext.workspace._id` and `workspaceContext.userId`; Workspace and creator authorization are not taken from the body.

- `POST /workspaces/:workspaceId/student-invitations` — body `{ "studentId": "<ObjectId>" }`. The service confirms the Student is active and belongs to the authorized Workspace, then creates an invitation with effective status `active`. It returns minimal metadata plus the raw `invitationSecret`. Expiration is always seven days; supplied expiration fields are ignored by request validation.
- `GET /workspaces/:workspaceId/student-invitations?page=1&pageSize=20&studentId=<ObjectId>` — paginated Workspace-scoped metadata, optionally filtered by Student.
- `GET /workspaces/:workspaceId/student-invitations/:invitationId` — metadata scoped to the authorized Workspace. Expired and revoked records remain retrievable with their derived status.
- `PATCH /workspaces/:workspaceId/student-invitations/:invitationId/revoke` — atomically revokes only an unrevoked, unconsumed invitation with `expiresAt > now`, recording the authenticated User and revocation time. Foreign-Workspace or missing records return not found; expired, revoked, or consumed records return conflict.

Duplicate-key errors are converted to a conflict response; other database errors are propagated. Revocation performs a Workspace-scoped conditional update so concurrent attempts cannot revoke an already-revoked or expired invitation. No `StudentAccountLink` is created or activated.

## Tests and verification

`backend/test/phase8-2.test.ts` uses mocked Mongoose methods. It covers the existing teacher Workspace boundary, active Student/Workspace validation, trusted creator context, secure secret/hash handling, exact seven-day expiration and inclusive expiry, secret-free metadata, Workspace-scoped list/detail/revoke operations, revoked/expired behavior, duplicate-key handling, and absence of StudentAccountLink creation.

The tests do not connect to a database. No migrations, index creation, environment changes, or frontend changes are part of this module.

## Operational requirements and deferred work

Before deployment, use the approved database index-management process to create and verify the declared indexes, especially the unique `secretHash` index. This implementation does not verify production index state.

Student Portal APIs remain deferred. Phase 8.3 adds a one-redemption-per-invitation record and marks the invitation consumed only when the approved student link is activated. A rejected redemption revokes the invitation, so a teacher must issue a new invitation. No JWT, cookie, Passport, or existing authentication behavior was changed. The new redemption indexes must still be deployed through the approved index-management process and have not been verified in any database.
