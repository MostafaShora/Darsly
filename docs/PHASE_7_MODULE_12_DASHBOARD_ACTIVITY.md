# Phase 7 Module 12 — Dashboard Schedule & Recent Activity (F7)

## Audit findings

The F7 integration audit found that Dashboard's schedule panel linked to Sessions but did not show records. The existing summary endpoint (`GET /api/workspaces/:workspaceId/dashboard/summary`) returns aggregate counts and financial/attendance summaries only; it has no activity feed.

The existing Sessions endpoint (`GET /api/workspaces/:workspaceId/sessions`) supports `from`, `to`, `status`, `page`, and `pageSize`, returns persisted session DTOs, and sorts by `startsAt` ascending. Its route is Workspace-authorized. Session DTOs include `groupId`, `title`, `startsAt`, `endsAt`, and `status`; the existing group and subject detail APIs can provide related names.

No existing endpoint is a reliable unified recent-activity feed. Attendance and payment list endpoints are independently paginated, with different record and date semantics, and joining only a page from each would not provide a stable merged recent timeline. The summary endpoint is aggregate-only.

## Smallest justified API addition

Add a Workspace-authorized dashboard activity endpoint that merges a bounded number of persisted attendance and payment records by their database-generated `createdAt` timestamps. Each returned entry represents a stored record, not an inferred or fabricated action. The service filters both sources by the route's authorized Workspace ID. It does not claim to be a complete audit log; edits and other record types are not included.

## Implementation

- The Dashboard requests page 1 of scheduled sessions, with a page size of five and `from` set to the current timestamp. The existing API sorts by `startsAt` ascending. It enriches those records using existing Workspace-scoped group and subject detail endpoints to display title, date/time, group, subject, and status.
- Added `GET /api/workspaces/:workspaceId/dashboard/activity?limit=5`. Its bounded limit defaults to five and cannot exceed ten. It queries only attendance and payment records belonging to the authorized Workspace, uses their database-generated `createdAt` timestamps, merges them newest-first, and returns persisted record type/status plus the payment amount/method where applicable.
- Dashboard data is cleared as soon as the shared Workspace availability changes. Schedule and activity requests use the emitted active Workspace ID and a request generation guard so late results from an earlier Workspace cannot update the display. Each section has independent loading, empty, and error states with retry.
- The new backend endpoint is mounted behind the existing `requireWorkspaceAccess()` middleware. No authentication behavior, database schema, indexes, or authorization rules were changed.

## Tests and verification

- Frontend `npm test -- --watch=false` — **passed: 111 tests**. Coverage includes schedule and activity loading/empty/error states, Workspace-scoped requests, switching/clearing, and stale responses.
- Frontend `npm run build` — **passed**.
- Backend `npx tsx --test test/phase7.test.ts` — **passed: 2 tests**, covering Workspace filters, bounded newest-first merge, and limit validation. Tests use model mocks and no database.
- Backend `npx tsc --noEmit -p tsconfig.json` — **passed**.
- Backend `npm test` — **blocked before test execution** by existing TS2307 errors: five pre-existing test files import `../src/app`, which is not present in the backend source tree.
- Backend `npm run build` — source TypeScript compilation completed, but the package script then failed at its `cp ./package.json ./dist` step because `cp` is unavailable in this Windows environment.
- `git diff --check` — **passed**.

## Limitations

The activity endpoint intentionally reports only recent persisted attendance and payment records; it is not a complete audit log and does not include edits or other record types. The schedule shows at most five next scheduled sessions. Live API and browser verification were not performed.
