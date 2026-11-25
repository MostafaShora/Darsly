# Phase 7 Module 5 — Finance Management

## Scope and implementation

Teacher-facing Angular workflows were added for the existing invoice, payment, and payment-allocation APIs. The implementation is frontend-only and uses the active workspace returned by the existing workspace service. All finance requests include that workspace ID in the existing workspace-scoped route; backend workspace authorization remains authoritative.

### Routes

- `/finance` — financial overview using the existing dashboard summary, draft invoice count, and latest completed payments.
- `/invoices` — paginated invoice list with supported status, billing-period-start, and student filters.
- `/invoices/new` — create a draft invoice from a selected student and active enrollment.
- `/invoices/:invoiceId` — invoice details, supported draft edit, issue, and eligible void actions.
- `/payments` — paginated payment list with supported status, received-date, and student filters.
- `/payments/new` — record a payment.
- `/payments/:paymentId` — payment details and explicit allocations to eligible issued invoices.

Every route uses the existing `authGuard`.

## Existing API contracts reused

All paths below are under `/api/workspaces/:workspaceId`.

### Invoices

- `GET /invoices`: `page`, `pageSize`, `studentId`, `status` (`draft|issued|void`), `from`, and `to`. The date filters apply to `periodStart`; the existing list order is by period start, not issue timestamp.
- `POST /invoices`: `studentId`, `enrollmentId`, `periodStart`, `periodEnd`, and optional `dueDate`, `description`, and `notes`. The UI does not send a status; the backend creates a draft and computes the final amount.
- `GET /invoices/:invoiceId`
- `PATCH /invoices/:invoiceId`: only `studentId`, `enrollmentId`, `periodStart`, and `periodEnd` are editable. The UI offers this only for drafts.
- `POST /invoices/:invoiceId/issue`
- `POST /invoices/:invoiceId/void`
- `GET /invoices/:invoiceId/allocations`

### Payments and allocations

- `GET /payments`: `page`, `pageSize`, `studentId`, `status` (`pending|completed|failed|refunded`), `from`, and `to`. Date filters apply to `receivedAt`; results are ordered by receipt time.
- `POST /payments`: `studentId`, decimal-string `amount`, `method` (`cash|bank_transfer|card|wallet|other`), and optional `receivedAt`, `reference`, and `notes`. The backend assigns `completed`; there is no client status control.
- `GET /payments/:paymentId`
- `GET /payments/:paymentId/allocations`
- `POST /payments/:paymentId/allocations`: `invoiceId` and decimal-string `amount`.

Related existing references:

- `GET /students` and `GET /students/:studentId` for searchable student selection and names.
- `GET /enrollments` and `GET /enrollments/:enrollmentId` for invoice enrollment selection/details.
- `GET /groups/:groupId` for the current group name and monthly fee.
- `GET /dashboard/summary?timezone=<IANA timezone>` for server-produced financial overview values.

Frontend list requests use a page size of 20, within the backend maximum of 100. Allocation requests preserve decimal strings without floating-point parsing or client-side balance arithmetic. Backend eligibility, balance, and capacity-independent financial rules remain authoritative.

## Forms and behavior

- Invoice creation requires a student, an active enrollment, and an ordered calendar-date period. The current group monthly fee is displayed as reference only; the final invoice total is returned by the backend.
- Draft editing sends only supported changed fields. Issued invoices cannot be edited in the UI.
- Issue and void actions require confirmation and update the displayed invoice only after an API response. Issued invoices are offered for voiding only when the server DTO reports `unpaid`; the backend still enforces the no-allocation rule.
- Payment creation validates a positive decimal string with at most two fractional digits and 34 significant digits. Optional browser-local date/time values are converted through a shared core date utility to UTC ISO timestamps.
- Allocation selection is limited in the UI to the same student's issued invoices with a positive server-reported outstanding amount. The UI does not split or auto-allocate payments and does not predict whether the requested amount fits. Backend conflict/validation messages are shown.
- Unallocated payments are explicitly described as neither automatic credit nor a balance applied to an invoice.
- Dashboard and Reports financial display helpers preserve decimal strings exactly instead of converting them to JavaScript `Number`.

## Tests

Focused tests were added to the existing `client/src/app/app.spec.ts` (no separate spec files):

- Workspace-scoped finance request paths, query parameters, credentials, and exact decimal-string payload preservation.
- Invoice creation validation, active-enrollment selection, and `/invoices/new` avoiding an invoice lookup for `new`.
- Supported invoice filters and issue/void action updates.
- Payment precision validation and submission without a client-selected status.
- Allocation request scope and explicit backend rejection without optimistic balance changes.
- Finance routes in the existing authenticated-route guard checks.

Verification results:

- `npm test -- --watch=false` — passed (55 tests).
- `npm run build` — passed.
- `git diff --check` — passed.

## Limitations

- The invoice DTO does not expose a stored monthly fee or an amount-preview endpoint. The current group fee shown during creation is not presented as a historical invoice fee, and invoice totals are not estimated in Angular.
- Invoice list filtering uses only the supported `periodStart` dates; there is no invoice text-search endpoint and no sort-by-`issuedAt` option.
- Payment list has no text-search endpoint.
- Allocation-list endpoints do not expose pagination. The UI displays the API response as returned and does not fetch beyond it.
- The backend exposes no payment edit/delete/refund workflow, and the UI does not invent one. Payment allocation also remains explicit and cannot be edited or removed through the current contract.
- `from`/`to` for payment lists are converted from browser-local day boundaries to UTC instants using the existing date utilities; finance timestamps are displayed in browser-local time. Invoice periods remain calendar-date strings and are rendered without timezone conversion.

## Change boundaries

No backend files, API contracts, authentication behavior, or dependencies were changed. No database migration or database connection was used. No commit or push was created.
