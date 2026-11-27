# Phase 8 Module 8 — Account Type Selection

## User experience

`/sign-up` is now the Arabic RTL account-type selection page. It offers two paths:

- **Teacher** navigates to `/sign-up/teacher`, which reuses the existing teacher registration form and its current fields, validation, success behavior, and dashboard redirect. The form sends the optional `accountType: "teacher"` value.
- **Student** navigates to `/sign-up/student`, which accepts an existing teacher-issued invitation. It does not create a Student record or submit through generic `/auth/register`.

The Teacher form and the initial Student invitation step link back to account-type selection. Login and authenticated routes are unchanged.

## Account type semantics and API contracts

Account type is an onboarding choice, not an authorization role. The backend accepts only the optional literal `"teacher"` on generic registration; omitting it remains backward compatible. `"student"` and unknown values are rejected by `registerSchema`. The existing registration service continues to create teacher-capable accounts as before. Capabilities and access are assigned by the established backend workflows, never by the selection UI.

Student signup reuses the existing `/api/student-invitation-redemptions` contracts:

1. `POST /` with `{ "invitationSecret": "..." }` starts redemption and returns `{ "message": "...", "data": { "redemptionId": "...", "claimToken": "..." } }`.
2. `POST /:redemptionId/otp` and `POST /:redemptionId/verify` request and verify the code sent to the email already stored on the invited Student.
3. After successful OTP verification, the Student may either:
   - `POST /:redemptionId/register` with a password to create a student-only User; or
   - authenticate through the existing login flow, then `POST /:redemptionId/claim-existing-account` to link an existing account.
4. `POST /:redemptionId/status` returns the minimal redemption state. The UI displays pending, rejected, or active status and opens the Student Portal only when access is active.

The invitation service sends credentials on its HTTP requests. The existing-account claim route additionally relies on the existing JWT-cookie authentication. No API endpoint, database field, JWT payload, cookie, Passport strategy, or deployment setting was added or changed.

## Security and lifecycle

- Student onboarding requires a valid invitation targeting an existing Student. The Student's stored email is the OTP destination and must match an existing account when linking.
- OTP verification remains required before account creation or linking. Existing teacher approval remains required before a StudentAccountLink is activated.
- The backend revalidates invitation, Student, Workspace, and account ownership. The frontend does not submit Student, Workspace, User, or link IDs.
- A new Student User receives only the student capability through the existing redemption service. Linking an existing User preserves its other capabilities. Selecting Student alone grants no capability or portal access.
- Invitation and claim tokens are held in component memory only; they are not persisted to browser storage. Reloading after redemption loses the claim token. Since the backend allows one redemption per invitation, recovery may require the teacher to issue a new invitation.

## Tests and verification

Focused Angular tests:

```text
npx ng test --include src/app/features/auth/pages/account-type-selection/account-type-selection.component.spec.ts --include src/app/core/services/student-invitation.service.spec.ts --include src/app/features/auth/pages/student-invitation-sign-up/student-invitation-sign-up.component.spec.ts --watch=false
Test Files: 3 passed; Tests: 8 passed, 0 failed
```

Focused Phase 8 backend tests (excluding the environment-dependent `phase8-8.test.ts`):

```text
npx tsx --test test/phase8.test.ts test/phase8-2.test.ts test/phase8-3.test.ts test/phase8-4.test.ts test/phase8-6.test.ts test/phase8-9.test.ts test/phase8-10.test.ts test/phase8-11.test.ts
Tests: 80 passed, 0 failed
```

Additional verification:

- `npx tsc --noEmit -p tsconfig.json` — passed.
- `npx ng build --configuration development` — passed.
- `git diff --check` — passed.
- `npm test -- --watch=false` — 130 passed, 23 failed in the existing `src/app/app.spec.ts`. The failing tests report HTTP request mismatches: they expect relative `/api` URLs while `src/environments/environment.ts` uses the configured deployed API URL. The new focused signup tests pass. A pre-change baseline was not run, so these failures cannot be conclusively attributed to an earlier revision.
- `npm run build` — production build did not complete because the build could not retrieve the existing Google Fonts stylesheet (`fonts.googleapis.com` DNS/network unavailable).
- `npx ng build --configuration production --optimization=false` — compiled but failed the existing initial bundle budget: 19.73 MB against a 1 MB maximum.
- `npm test` in the backend — stopped at the existing test TypeScript check because five earlier test files import the missing `../src/app` module.
- A direct run including `test/phase8-8.test.ts` also encountered its existing `MONGO_URI` requirement; no database was configured or contacted. All other listed Phase 8 tests passed.

Tests use isolated fixtures/mocks; no OTP email was sent and no external provider or database was contacted.

## Limitations

Student self-registration remains intentionally unavailable without a teacher-issued invitation. The new frontend exposes the already-implemented invitation redemption and approval workflow; it does not change the backend lifecycle. Production build verification requires network access to the configured external font stylesheet, and the repository's existing bundle budget and suite setup issues remain outside this phase.
