# Phase 8 Module 1 — Student Identity & Authorization

## Scope

This module adds the backend foundation for distinguishing teacher and student capabilities and associating an authenticated User with existing Student records. It does not add invitation creation, OTP delivery, student registration endpoints, public Student APIs, or Student Portal UI.

## User capability semantics

`User.capabilities` accepts `teacher` and `student`; a User may hold both. The field has no default so existing database records without it remain distinguishable from explicitly provisioned student-only Users.

`hasUserCapability()` interprets a missing capability field as `teacher` for backward compatibility. An explicitly populated array is authoritative: `["student"]` is student-only, while `["teacher", "student"]` is dual-capability. The public teacher registration flow always writes `["teacher"]`; the registration schema does not accept capability assignments. JWT claims, cookies, and authentication response fields are unchanged.

`grantUserCapabilityService()` is an internal server-side helper. When adding `student` to a legacy User with no field, it persists both capabilities so the legacy teacher capability is preserved. No public route grants `student`; a future trusted registration/approval flow must make that assignment explicitly.

## StudentAccountLink schema and indexes

`StudentAccountLink` stores only `userId`, `studentId`, `workspaceId`, `status`, and timestamps. Its lifecycle is `pending` (default), `active`, or `inactive`. Pending and inactive links do not authorize Student access. There are no duplicated Student profile fields or public DTOs for link records.

Unique indexes enforce:

- `{ workspaceId, studentId }`: a Student record can be claimed by at most one User.
- `{ userId, studentId }`: the same User/Student pair cannot be linked twice.

The non-unique `{ userId, status }` index supports listing multiple links for the same User and status, including multiple active or pending links across Workspaces.

The service also checks for an existing link before insertion and maps duplicate-key races to a conflict. Link creation verifies that the active Student belongs to the supplied Workspace and creates the link as pending. The database indexes are the final concurrency protection.

## Student link lifecycle and access rules

The link service requires an active User with the `student` capability. Resolving a particular Student link requires the authenticated User ID plus a matching active link, then independently verifies that the Student is active and belongs to the link's Workspace and that the Workspace is active. The list helper returns only active Student/Workspace access contexts and skips inactive Students or suspended Workspaces. Missing or ineligible access returns a non-disclosing not-found error.

No client-facing Student endpoint is added. Callers must derive `userId` from the authenticated request; a caller-supplied Student or Workspace ID is never sufficient proof of ownership. The service returns Student/Workspace access context, not the raw link record.

`active` means the link is authorized to access Student data. This module does not activate links or implement verification/approval. A future flow must only activate after the approved OTP and teacher-approval steps.

## Teacher capability enforcement

Teacher capability checks are added at these existing boundaries:

- Workspace creation and the current user's Workspace listing require teacher capability.
- Workspace membership resolution requires teacher capability before checking the existing active membership.
- Workspace lookup, updates, suspension and activation preserve their existing membership/owner checks and also require teacher capability.
- All Student, Guardian, Group, Subject, Enrollment, Session, Attendance, Invoice, Payment, allocation, report and dashboard routes continue through `requireWorkspaceAccess()`, so they require both teacher capability and existing Workspace membership.

Legacy Users with no capability field retain teacher access. Users with both capabilities retain all existing teacher functionality. Workspace membership remains required; teacher capability does not replace tenant authorization. No Student is inserted into `WorkspaceMember`.

The `/auth` routes remain generic authentication routes. Public registration continues to create teacher-capable accounts; login, logout, status, JWT contents, cookie policy and Passport User loading are unchanged.

## Security assumptions and deferred work

- Student capability is only trustworthy when assigned by a trusted server-side flow. No public capability assignment endpoint exists.
- A pending link cannot authorize Student access, even if its User has the student capability.
- Student and Workspace status are checked at access time, so later deactivation/suspension blocks access.
- The service does not use matching Student names, emails or phone numbers.
- Invitation tokens, OTP verification, teacher approval, rate limiting, invitation expiry/revocation, registration UI, portal APIs, and Student-facing DTOs are deferred.
- Production MongoDB transaction support remains unverified. This module deliberately introduces no transaction-dependent workflow.

## Tests and verification

`backend/test/phase8.test.ts` contains 22 isolated tests using mocked Mongoose methods. It covers legacy and explicit capabilities, capability grants, registration capability filtering, Workspace creation/access checks, tenant validation, link uniqueness and races, multiple active and pending links across Workspaces, and inactive/suspended records.

Verification performed:

- Focused `phase8.test.ts`: **22 passed, 0 failed**.
- Backend source TypeScript check (`tsc --noEmit -p tsconfig.json`): **passed**.
- Full `npm test`: **blocked before execution** by five existing test imports of the missing `backend/src/app` module in `foundation.test.ts` and `phase1`–`phase4.test.ts`. The Phase 8 test itself produced no test-compilation error.
- No development or production database was accessed. The focused tests mock database model methods and do not call `mongoose.connect()`.

## Migration and deployment considerations

No migration or database operation was run. Existing User records need no immediate migration because a missing capability field means teacher. New StudentAccountLink indexes must be present in the target database before link creation is enabled; deploy through the project's approved index-management process and verify index creation rather than assuming it occurred.

Do not enable link activation or redemption until the trusted OTP/approval workflow is implemented and operational controls are agreed. This module does not establish production MongoDB transaction compatibility.
