# Backend Phase 6: Reports and Dashboard

## Scope

Phase 6 adds workspace-scoped read APIs and the Arabic-first Angular Dashboard
and Reports pages. It does not change Phase 1–4 creation or correction behavior.
It does not create educational-center, branch, or activity-feed functionality.

## Endpoints

All endpoints require existing JWT authentication and workspace access.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/workspaces/:workspaceId/dashboard/summary` | Current dashboard summary |
| `GET` | `/api/workspaces/:workspaceId/reports/attendance` | Paginated attendance report |
| `GET` | `/api/workspaces/:workspaceId/reports/finance` | Paginated finance report |

### Dashboard summary query

Optional `from`, `to`, and `timezone`.

- `from` and `to` are ISO 8601 timestamps with timezone offsets.
- Without `from`, the backend uses the first UTC day of the current month.
- Without `to`, the backend uses the current time.
- The frontend converts local teacher dates to ISO UTC boundaries.

### Attendance report query

- `from`, `to`: timezone-offset timestamps.
- `studentId`: optional workspace-owned Student ObjectId.
- `groupId`: optional workspace-owned StudyGroup ObjectId.
- `status`: optional `present`, `absent`, `late`, or `excused`.
- `page`, `pageSize`: existing pagination defaults and limits.

### Finance report query

- `from`, `to`: timezone-offset timestamps.
- `studentId`: optional workspace-owned Student ObjectId.
- `page`, `pageSize`: existing pagination defaults and limits.

## Workspace isolation

All service queries include `workspaceId` from
`req.workspaceContext`. Student and StudyGroup filters are independently checked
against that workspace. Attendance report Sessions are workspace-scoped and
filtered by their actual `startsAt`. Attendance records are loaded only for those
eligible Sessions. Finance allocations are loaded only under the workspace and
then validated against completed Payments and issued Invoices for matching
Students.

## Dashboard calculations

Student counts use Student `status`: active, inactive, and archived. A total
includes all three statuses.

Group occupancy counts only active Enrollments. Paused and cancelled Enrollments
do not consume capacity. Null capacity means unlimited: available places and
occupancy percentage are both `null`.

Session counts use Session `status` and `startsAt` inside the selected period.
The attendance summary:

- excludes cancelled Sessions;
- excludes Sessions that have not started;
- counts present, absent, late, and excused records;
- calculates `(present + late) / (present + absent + late)`;
- returns `null` instead of infinity or NaN when the denominator is zero;
- does not invent an absence for an unrecorded student.

Finance summary:

- issued Invoice lifecycle status is separate from derived payment status;
- draft and void Invoices are excluded;
- current outstanding is issued totals minus valid persisted allocations;
- collected money uses Payment `receivedAt`;
- unallocated money is completed Payment totals minus valid allocations;
- allocations do not reduce invoice outstanding until they exist.

## Historical finance limitation

The Invoice model has now gained an `issuedAt` timestamp. Issuing a Draft sets
`issuedAt` to the actual UTC issuance time. The first historical report
deployment may find existing issued invoices that have no `issuedAt`.

The report:

- includes an invoice in a past balance only when `issuedAt` is present and
  `issuedAt <= reporting end`;
- includes allocations only when `PaymentAllocation.createdAt <= reporting end`;
- includes Payments only when `receivedAt <= reporting end`;
- returns `historicalData.available: false` if legacy issued invoices lack
  `issuedAt`;
- never substitutes Invoice `createdAt` or the current Invoice status for a
  missing issue date.

A legacy record backfill is a separate deployment decision. The historical
outstanding and unallocated values for periods affected by missing `issuedAt`
must not be presented as definitive.

Invoice period data (`periodStart`/`periodEnd`) is billing coverage, not the
Invoice issue event.

## Attendance details

The Attendance report paginates persisted AttendanceRecords for eligible
Sessions. It resolves Student and StudyGroup names for DTO presentation, while
retaining IDs and UTC timestamps. A group filter is translated to workspace
Session IDs before records are queried.

## Finance details

The finance response separates:

- invoices issued during the selected period;
- Payments received during the period;
- Allocations created during the period;
- current and historical outstanding/unallocated indicators;
- payment methods aggregated from Payments received in the period.

The historical response does not convert unallocated payments into Invoice
settlement; it calculates Payments and allocations at the period end.

## Export

The Angular Reports page supports:

- Excel-compatible `.xls` export from the currently loaded, filtered report;
- PDF export through the browser print dialog and save-as-PDF, preserving
  Arabic RTL layout.

Exports contain only the currently selected workspace report and active filters.
The print/PDF window is generated locally and contains no internal Mongo fields.

## DTO and serialization

Successful responses retain `{ message, data }`. Decimal values are strings.
Attendance counts and nullable attendance rates are explicit. Dates are ISO UTC
strings. DTOs omit workspaceId and Mongoose internals.

## Tests

`backend/test/phase6.test.ts` uses Node `node:test`, `tsx`, and Mongoose stubs.
It covers:

- dashboard active/paused/cancelled Enrollment counts;
- limited and unlimited occupancy;
- attendance formula;
- excused exclusion and zero denominator;
- exact finance separation;
- historical issuedAt limitations.

No tests connect to MongoDB. The suite does not prove real MongoDB aggregation,
transaction, or concurrency behavior.

## Index and migration requirements

No migration was executed.

Invoice issuance now writes `issuedAt`; it may require the index:

```text
{ workspaceId: 1, status: 1, issuedAt: 1 }
```

This index is declared in the Invoice Mongoose schema. Existing collections may
need Mongoose/index deployment handling; no database was accessed in this phase.

Before relying on historical invoice balances, an approved migration must decide
whether and how any existing issued Invoice can receive a defensible `issuedAt`.
The only safe default is `null`, not an invented timestamp.

## Verification and limitations

The implementation uses read-only aggregation/model queries and exact decimal
string arithmetic from the existing money utilities. MongoDB integration and
real concurrent aggregation behavior remain unverified in this environment.
