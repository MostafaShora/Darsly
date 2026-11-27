# Phase 8 Module 4 — Student Context Access

## Scope

This phase adds authenticated account-capability data, StudentAccountLink context discovery and selection, and reusable request-time student-access validation. It does not add Student Overview, Profile, Groups, Schedule, or Attendance data endpoints.

## Trusted account capabilities

`GET /api/auth/status` now includes a `user.capabilities` summary:

```json
{
  "teacher": true,
  "student": false,
  "owner": true
}
```

Teacher and Student capabilities come from the trusted User model and existing `hasUserCapability` behavior. A User with no explicit capability array continues to have legacy Teacher capability; that does not imply Student capability. Owner is reported only when an active owner Workspace and a matching active owner membership exist. Capability values are informational and do not replace Workspace membership or StudentAccountLink authorization.

The login and registration response shapes, JWT claims, cookies, Passport behavior, and teacher registration flow are unchanged.

## Student context APIs

Both operations require the existing JWT-cookie authentication:

- `GET /api/student-contexts` lists eligible contexts for the authenticated User.
- `POST /api/student-contexts/selection` accepts `{ "studentAccountLinkId": "<id>" }` and validates a selection.

Each response contains only a StudentAccountLink ID and safe Student/Workspace display names. It excludes Student IDs, Workspace IDs, notes, guardian details, and full model documents. Contexts are ordered by link creation time and ID. A User without Student capability receives an empty list; selection still requires Student capability and an owned active link.

For each context, the backend rechecks the authenticated User, active StudentAccountLink ownership/status, active linked Student in the link's Workspace, and active Workspace. Invalid, foreign, inactive, or stale selection references return the generic `Student access not found` response.

## Future protected Student endpoints

Selection is stateless. The frontend stores the selected link ID only as a per-User convenience hint and validates it through the API. Future Student-specific requests must send the selected link in the `X-Student-Account-Link` header. The value is not authorization proof.

Mount `passportAuthenticateJwt` and `requireStudentAccess` on each future Student data route. The middleware resolves the User from Passport, revalidates the link and related record statuses on every request, and attaches a typed `req.studentContext` containing only trusted identifiers and display names. It ignores client-supplied Student and Workspace IDs for access resolution. Teacher Workspace middleware remains separate. No Student data route is mounted in this phase.

No new database indexes are declared. Context lookups use existing StudentAccountLink, Workspace, and WorkspaceMember indexes. No database connection or deployment/index check was performed.

## Frontend behavior

The Student route tree uses the existing authentication guard and a dedicated Student access guard. The guard fetches the active context list, validates a saved selection through the selection endpoint, selects the sole active context when there is exactly one, and sends multiple/no-context states to `/student/select-context`. API failures remain distinct from a confirmed empty list; expired authentication follows the existing sign-in redirect.

The existing landing Navbar displays account capabilities from `/auth/status`. Teacher navigation appears only after `/workspaces/mine` returns an active eligible Workspace. Student navigation appears only after `/student-contexts` returns at least one validated context. The two context services and their local-storage keys are independent. Account settings remain visibly unavailable because no settings route/API exists; the existing logout flow is reused.

The Student pages remain data placeholders. Real student data access requires future endpoints to derive records exclusively from `req.studentContext`, apply explicit response DTO allowlists, and scope all records to that Student and Workspace.
