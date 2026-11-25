# Backend Phase 4: Invoices and Payments

## Scope and implementation

Phase 4 adds workspace-scoped invoice, payment, and payment-allocation APIs for
the individual-teacher workspace model. It does not add center, branch, or
multi-teacher behavior, and does not change authentication, frontend code, or
existing API response envelopes.

Invoice amounts use the workspace's existing EGP currency and the associated
StudyGroup's `monthlyFee`. Proration counts calendar days inclusively, divides
each covered day by the actual number of days in that calendar month, sums the
unrounded portions, then rounds half-up once to two decimal places. Decimal
arithmetic uses integer/BigInt operations rather than floating-point arithmetic.
Zero-value invoices and payments are rejected.

Invoice numbers are generated as `INV-000001`, incrementing independently for
each workspace. The `InvoiceNumberCounter` update and invoice creation occur in
one MongoDB transaction. New invoices are always `draft`; callers cannot set the
amount, number, workspace, or associations directly.

## Endpoints

All routes are mounted under `/api/workspaces/:workspaceId`, require the existing
workspace-access middleware, and use the authenticated workspace context rather
than a client-supplied `workspaceId`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/invoices` | List invoices |
| `POST` | `/invoices` | Create a draft invoice |
| `GET` | `/invoices/:invoiceId` | Read one invoice |
| `PATCH` | `/invoices/:invoiceId` | Update a draft's student, enrollment, or billing period |
| `POST` | `/invoices/:invoiceId/issue` | Issue a draft |
| `POST` | `/invoices/:invoiceId/void` | Void an invoice when permitted |
| `GET` | `/invoices/:invoiceId/allocations` | List valid allocations to an invoice |
| `GET` | `/payments` | List payments |
| `POST` | `/payments` | Record a completed payment |
| `GET` | `/payments/:paymentId` | Read a payment and its valid allocations |
| `GET` | `/payments/:paymentId/allocations` | List valid allocations from a payment |
| `POST` | `/payments/:paymentId/allocations` | Add an immutable allocation |

### Request contracts

`POST /invoices` accepts:

```json
{
  "studentId": "MongoDB ObjectId",
  "enrollmentId": "MongoDB ObjectId",
  "periodStart": "YYYY-MM-DD",
  "periodEnd": "YYYY-MM-DD",
  "dueDate": "Optional ISO 8601 timestamp with timezone offset",
  "description": "Optional string",
  "notes": "Optional string",
  "status": "Optional draft only"
}
```

The Enrollment must be active when the invoice is created or issued. Its Student
and StudyGroup must belong to the same workspace; the StudyGroup determines the
monthly fee and the invoice's group association.

`PATCH /invoices/:invoiceId` accepts a non-empty subset of `studentId`,
`enrollmentId`, `periodStart`, and `periodEnd`. The resulting enrollment and
group references must be workspace-consistent. The amount is recalculated from
the group's current monthly fee. Only drafts can be edited. Issued invoices are
immutable; a draft can be issued explicitly, and an invoice can be voided only
when it has no allocations. Voiding is terminal.

`POST /payments` accepts:

```json
{
  "studentId": "MongoDB ObjectId",
  "amount": "Positive decimal string",
  "method": "cash | bank_transfer | card | wallet | other",
  "receivedAt": "Optional ISO 8601 timestamp with timezone offset",
  "reference": "Optional string or null",
  "notes": "Optional string"
}
```

The API records a payment as `completed`. There is no payment update, deletion,
refund, or status-change endpoint.

`POST /payments/:paymentId/allocations` accepts
`{ "invoiceId": "MongoDB ObjectId", "amount": "Positive decimal string" }`.
Amounts must fit Decimal128 precision. An allocation requires a completed
payment and issued invoice for the same Student and workspace. Allocation is
explicit and immutable; partial allocation is allowed, and any unallocated
payment balance remains available.

Invoice list filters are `studentId`, `status` (`draft | issued | void`), `from`,
`to` (calendar dates filtering `periodStart`), `page`, and `pageSize`. Payment
list filters are `studentId`, `status` (the existing Payment model values),
`from`, `to` (timezone-offset timestamps filtering `receivedAt`), `page`, and
`pageSize`. Pagination defaults to page 1 and page size 20, with a maximum page
size of 100. Date ranges are inclusive and reject `from > to`.

## Responses, DTOs, and errors

Successful responses retain `{ "message": "...", "data": ... }`. List responses
place `items` and `{ page, pageSize, totalItems, totalPages }` under `data`.
Single-resource and allocation responses place a DTO or DTO array under `data`.
DTOs serialize ObjectIds as strings, dates as UTC ISO timestamps (invoice
periods as `YYYY-MM-DD`), and Decimal128 values as decimal strings. They omit
`workspaceId` and Mongoose internals.

Invoice DTOs contain the stored invoice status and derived
`paymentStatus` (`unpaid`, `partially_paid`, or `paid`) for issued invoices;
`paymentStatus` is `null` for drafts and void invoices. `allocatedAmount` and
`outstandingAmount` are derived from valid allocations. Payment DTOs include
derived `allocatedAmount` and `unallocatedAmount`; payment detail additionally
includes the valid allocation DTOs. Allocations are counted only when their
payment is completed, invoice is issued, Student matches, and amount is
positive.

Zod validators reject malformed ObjectIds, unknown body fields, invalid
calendar dates, timestamps without timezone offsets, unsupported statuses or
methods, invalid date ranges, and non-positive amounts. Model validation also
requires positive Payment amounts. Missing or cross-workspace resources return
404; invalid requests return 400; state and balance conflicts return 409.
Duplicate-key errors continue through the existing error middleware and map to
the established 409 `ERR_CONFLICT` response.

## Workspace isolation and financial integrity

Each resource read and write is scoped by `workspaceId` from the authorized
workspace context. Invoice Student and Enrollment are independently checked;
Enrollment must point to the same Student and StudyGroup in that workspace.
Payment Student references are checked within the workspace. Allocation
creation independently loads the Payment, Invoice, Student, Enrollment, and
StudyGroup under the same workspace and confirms the two records refer to the
same Student.

Allocation creation runs in a MongoDB transaction. It compare-and-set updates
the Payment and Invoice `updatedAt` values before reading allocation totals and
creating the immutable allocation. Requested amounts cannot exceed either the
payment's unallocated balance or the invoice's outstanding balance. Invoice
number increments and invoice creation are also transactional. These
multi-document transactions require a MongoDB deployment that supports
transactions (for example, a replica set).

## Index deployment note

The existing unique Invoice index on `(workspaceId, invoiceNumber)` is retained.
The new per-workspace InvoiceNumberCounter has a unique index on `workspaceId`.
To allow incremental allocations for the same Payment/Invoice pair, the
PaymentAllocation compound index on `(workspaceId, paymentId, invoiceId)` is now
non-unique. Updating the Mongoose schema does not convert an already-created
unique MongoDB index. Before deploying this behavior to a database that has the
old unique index, an operator must inspect the collection, drop the old index,
and create the same key pattern as a non-unique index. For the default Mongoose
collection name, the index is normally named
`workspaceId_1_paymentId_1_invoiceId_1`:

```javascript
db.paymentallocations.dropIndex("workspaceId_1_paymentId_1_invoiceId_1");
db.paymentallocations.createIndex({
  workspaceId: 1,
  paymentId: 1,
  invoiceId: 1
});
```

Run this only after confirming the deployed collection and index name and
following the environment's database change procedure. No database was accessed
or migration executed as part of this phase. If the unique index remains, a
second incremental allocation for the same pair will still fail in that
database, notwithstanding the updated application schema.

## Tests and known limitations

`backend/test/phase4.test.ts` uses the project's Node `node:test` and `tsx`
setup, an ephemeral HTTP server, and Mongoose stubs. It covers exact calendar
proration and rounding, index definitions, per-workspace numbering, invoice
validation and lifecycle, duplicate-key handling, list filters and derived
balances, positive payment validation, explicit/repeated allocations,
over-allocation rejection, relationship checks, and workspace query scopes.

Verification completed from `backend`:

```text
npm test       passed: TypeScript test type-check and all 60 tests
npm run build  passed: TypeScript production build
```

`git diff --check` also passed from the repository root.

The tests do not connect to development or production MongoDB. They verify the
transaction/session arguments and compare-and-set filters passed to Mongoose,
but cannot prove real MongoDB transaction atomicity, rollback, transient
write-conflict retries, counter behavior under concurrent inserts, or concurrent
allocation balance enforcement. Those behaviors require integration tests
against an isolated transaction-capable MongoDB replica set before claiming
database-level concurrency guarantees. No such claim is made here.

## Implementation files

- `backend/src/models/invoice-number-counter.model.ts`
- `backend/src/models/payment.model.ts`
- `backend/src/models/payment-allocation.model.ts`
- `backend/src/validators/money.validation.ts`,
  `backend/src/validators/invoice.validation.ts`, and
  `backend/src/validators/payment.validation.ts`
- `backend/src/utils/money.ts`
- `backend/src/dtos/invoice.dto.ts` and `backend/src/dtos/payment.dto.ts`
- `backend/src/services/invoice.service.ts`,
  `backend/src/services/payment.service.ts`,
  `backend/src/services/payment-allocation.service.ts`, and
  `backend/src/services/financial-summary.service.ts`
- `backend/src/controllers/invoice.controller.ts` and
  `backend/src/controllers/payment.controller.ts`
- `backend/src/routes/invoice.route.ts`, `backend/src/routes/payment.route.ts`,
  and `backend/src/routes/workspace.route.ts`
- `backend/test/phase4.test.ts`; `backend/package.json` includes the file in
  `npm test`.
