# Phase 8 Module 3 — OTP Verification and Teacher Approval

## Scope and implementation status

This module adds the backend redemption lifecycle for a Phase 8.2 invitation. A `StudentAccountLink` is activated only after the Student's stored email has been verified and an active Workspace owner or teacher has approved the request. Existing teacher registration, login, JWT, cookies, Passport, Workspace membership, and authorization behavior are unchanged.

**Email delivery uses the official Resend Node.js SDK.** The provider implements the existing injectable `StudentInvitationEmailProvider` interface. It reads `RESEND_API_KEY` and `RESEND_FROM_EMAIL` only when a delivery is requested, so applications can start without mail configuration; OTP requests fail closed with HTTP 503 and a safe configuration message if either value is missing or invalid. Resend rejection, network, and timeout errors are mapped to a sanitized service-unavailable response. The OTP challenge is marked `failed`, not `sent`, after a delivery error.

The SDK requires Node.js 20 or newer. The request has a 10-second abort timeout and no automatic retry. A successful response means Resend accepted the email; it does not guarantee inbox delivery. The sender is formatted as `Darsly <RESEND_FROM_EMAIL>`. The isolated English template includes only the access explanation, OTP, five-minute expiry, and do-not-share warning. There is no backend email localization convention, so template localization remains future work.

## Lifecycle and stored state

`StudentInvitationRedemption` stores the invitation, Workspace, and Student references; a one-way claim-token hash; optional authenticated `userId`; OTP challenge metadata; and terminal approval/rejection metadata. It does not store raw claim tokens, OTP values, or Student email addresses. OTP and email bindings are HMACs using a domain-separated key derived from the existing `JWT_SECRET`.

The state sequence is:

1. `claimed` — a valid invitation secret has created the unique redemption record.
2. `otp_pending` — an OTP challenge is reserved for email delivery.
3. `otp_verified` — the current code was verified and consumed; teacher approval is now possible.
4. `approved` — a teacher approved, but no authenticated or newly registered User is bound yet.
5. `consumed` — both OTP verification and teacher approval succeeded, the StudentAccountLink is active, and the invitation is consumed.
6. `rejected` — a teacher rejected the request and the invitation is revoked. A new invitation is required.

OTP delivery status is separately tracked as `none`, `sending`, `sent`, `failed`, `locked`, or `verified`. Resending replaces the previous hash and increments a challenge version, so an older delayed email cannot produce a valid code. Verification increments the attempt counter atomically; the fifth incorrect attempt locks the challenge and clears its hash. Successful verification clears the OTP hash. The code expires after five minutes. Per-redemption resend remains limited to once per 60 seconds and three sends in a rolling hour.

### Shared OTP abuse limits

MongoDB-backed shared event counters additionally prevent creating another redemption or invitation from resetting the OTP budget. The subject key combines the Student record ID and normalized Student email; a separate key applies to the IP address obtained from Express `req.ip`. Request-body identity and IP fields are never used. Keys are HMACed with a domain-separated key derived from the existing `JWT_SECRET`; raw email addresses and IP addresses are not persisted.

Each configurable limit is a rolling 60-minute window, updated with one conditional MongoDB pipeline using MongoDB server time (`$$NOW`). A unique key-hash index arbitrates concurrent first writes; concurrent updates to an existing key are atomic. Exceeding a limit returns HTTP 429. Invalid/missing client IP or limiter configuration/storage failure fails closed with HTTP 503. The existing per-redemption send cooldown and attempt lock remain additional checks.

Defaults and rationale:

| Environment variable | Default per hour | Rationale |
|---|---:|---|
| `STUDENT_INVITATION_OTP_SUBJECT_SEND_LIMIT_PER_HOUR` | 3 | Preserves the existing three-send budget across redemptions for one Student/email. |
| `STUDENT_INVITATION_OTP_IP_SEND_LIMIT_PER_HOUR` | 15 | Allows five independent student flows behind a shared IP at the existing three-send budget each. |
| `STUDENT_INVITATION_OTP_SUBJECT_FAILURE_LIMIT_PER_HOUR` | 5 | Preserves the existing five-attempt ceiling across resends and redemptions for one Student/email. |
| `STUDENT_INVITATION_OTP_IP_ATTEMPT_LIMIT_PER_HOUR` | 25 | Allows five independent student flows behind a shared IP at the existing five-attempt ceiling each. |

Values must be positive integers no greater than 100. This cap bounds the per-key event array; expired counter documents are removed asynchronously by MongoDB's TTL monitor after their latest event's window ends. No cleanup job or in-memory per-instance state is needed. Both shared send quotas count requests attempted against the email provider, not confirmed deliveries: a timeout can happen after the provider accepted a message, so releasing that quota could enable duplicate sends and abuse. Failed delivery still clears the challenge and never marks it `sent`. The IP verification quota counts each valid challenge submission; the shared Student/email verification budget retains only incorrect-code attempts.

The approval queue contains only OTP-verified requests whose invitations and Students remain active in that Workspace. Approval and rejection conditionally update only `otp_verified` records, so simultaneous terminal decisions cannot both succeed.

## Account binding and authorization

- A new account can be created only after OTP verification. It uses the Student's current stored email/name and is explicitly created with `capabilities: ["student"]`; it is never passed through the legacy capability helper. Existing teacher registration remains unchanged.
- An existing account must authenticate through the existing JWT cookie flow and its normalized email must exactly match the Student's current stored email.
- Existing accounts receive the student capability only when access is activated. Legacy users without a capabilities field retain the existing implicit teacher capability when the student capability is added.
- A new or existing User may be bound before teacher approval, but this does not create access. StudentAccountLink activation occurs only after both conditions have passed.
- All redemption operations recheck the invitation, active Student, and active Workspace. Approval routes use the authorized Workspace context and require an active owner/teacher membership. Student data and email are not returned in public redemption responses.
- StudentAccountLink's unique indexes remain the final duplicate-claim protection. A duplicate-key error aborts the transaction and returns a generic conflict.

## Transaction and concurrency behavior

Creating a student account, binding it to an approved redemption, granting its student capability, creating the active link, consuming the invitation, and marking the redemption consumed are transactional. Approval is also transactional; it activates access in the same transaction when a User is already bound. Every query and write in these finalization flows receives the same MongoDB session, and no parallel operations are issued inside a transaction.

Unsupported transactions fail closed. There is no ordinary-read/write fallback. Session cleanup runs in `finally`. The schema declares a unique `{ invitationId: 1 }` index and a non-unique `{ workspaceId: 1, state: 1, createdAt: -1 }` index for redemption records. Schema declarations do not establish that deployed indexes exist; no index build or database connection was run.

## API routes

Public redemption endpoints are mounted under `/student-invitation-redemptions`:

- `POST /` — accepts an invitation secret and returns a redemption ID plus a one-time claim token.
- `POST /:redemptionId/otp` — requests email delivery and applies the per-redemption plus shared Student/email and IP limits.
- `POST /:redemptionId/verify` — verifies a six-digit OTP.
- `POST /:redemptionId/register` — creates a student-only User after verification.
- `POST /:redemptionId/claim-existing-account` — requires JWT authentication and binds only an account with the matching Student email.
- `POST /:redemptionId/status` — returns minimal lifecycle status to a caller with the claim token.

Teacher approval endpoints are mounted under `/workspaces/:workspaceId/student-invitation-approvals`:

- `GET /` — paginated, Workspace-scoped OTP-verified requests.
- `POST /:redemptionId/approve` — approves one pending request.
- `POST /:redemptionId/reject` — rejects one pending request and revokes its invitation.

## Tests and operational limitations

`backend/test/phase8-3.test.ts`, `backend/test/phase8-4.test.ts`, and `backend/test/phase8-6.test.ts` use mocked Mongoose methods and a mocked Resend boundary; none connects to MongoDB or calls Resend. They cover one redemption per invitation, claim-token hashing, OTP reservation and expiry, one-time verification/replay protection, lockout, transaction-session use during activation, provider success and failure, hashed shared limiter keys, cross-redemption subject budgets, IP budgets, concurrent conditional reservations, TTL cleanup declarations, fail-closed storage errors, and failed-delivery challenge cleanup. No real Resend delivery was attempted.

## Resend configuration and deployment

1. Create a Resend account and API key in the [Resend API keys dashboard](https://resend.com/api-keys). Store the key as a deployment secret; do not commit it.
2. Verify the sending domain in [Resend Domains](https://resend.com/domains) and configure the sender address on that verified domain.
3. Configure these environment variables in the runtime secret manager (values below are placeholders):

   ```text
   RESEND_API_KEY=<your-resend-api-key>
   RESEND_FROM_EMAIL=<sender@your-verified-domain>
   ```

4. Follow the [Resend Node.js SDK guide](https://resend.com/docs/send-with-nodejs). In a non-production environment, use a test invitation and designated mailbox, then confirm the accepted request and delivery event in Resend before enabling the flow for users.

There is no `.env.example` in the repository, so none was added. Production sending requires a verified sender domain, correctly provisioned secrets, a successful end-to-end email check, verified MongoDB transaction support, and deployed/verified schema indexes, including the shared limiter's unique key and TTL indexes. These deployment checks were not performed here. Configure the four `STUDENT_INVITATION_OTP_*_LIMIT_PER_HOUR` variables only when a deployment needs values different from the defaults above. The repository's broader backend test type-check remains blocked by pre-existing imports of the missing `backend/src/app` module; focused Phase 8 tests and backend source type-check can be run independently.
