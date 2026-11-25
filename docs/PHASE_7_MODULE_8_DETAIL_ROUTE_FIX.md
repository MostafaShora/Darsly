# Phase 7 Module 8 — Invoice and Payment Detail Route Fix

## Root cause

The invoice and payment components read `invoiceId` and `paymentId` once from `ActivatedRoute.snapshot` in their constructors. Angular reuses the same component for navigation between parameter values on the same route, so the component state and displayed record could remain tied to the previous ID.

Invoice and payment detail requests had request counters, but those counters were not connected to route changes. Invoice reference requests also lacked a stale-response guard.

## Files changed

- `client/src/app/features/finance/invoices.component.ts`
- `client/src/app/features/finance/payments.component.ts`
- `client/src/app/app.spec.ts`
- `docs/PHASE_7_MODULE_8_DETAIL_ROUTE_FIX.md`

No templates, routes, service contracts, backend files, or dependencies were changed.

## Implementation

Both components now observe `ActivatedRoute.paramMap` with `distinctUntilChanged()` and `takeUntilDestroyed()`. On detail ID changes, the component clears the previous record and related UI state, invalidates pending requests, and loads the new record using the existing workspace-scoped FinanceService methods.

Invoice reference and allocation requests, payment student and allocation requests, and detail actions are guarded so responses belonging to an earlier route cannot replace the current detail. Missing IDs show a localized detail error; API errors continue through the existing error-message handling.

## Tests

Added mocked route-observable tests in the existing `app.spec.ts` covering:

- Initial invoice and payment ID loading.
- Changing each ID while retaining the same component instance.
- Out-of-order responses not replacing the latest record.
- Loading state reset and API errors for the latest route.
- Existing invoice/payment detail actions and allocation behavior remain covered by the existing finance tests.

## Verification results

- `cd client && npm test -- --watch=false` — passed; 78 tests.
- `cd client && npm run build` — passed; Angular production build completed.
- `git diff --check` — passed.

No live backend, database, or manual browser workflow was used.

## Remaining limitations

Invalid non-empty IDs are passed to the existing detail endpoint; its server response is shown using current API error handling. No new client-side ID format or backend behavior was introduced.
