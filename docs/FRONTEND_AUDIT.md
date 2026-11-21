# Darsly Frontend Architecture and Dashboard Audit

## Architecture

- The application lives in `client/` and uses Angular 22, standalone components, Angular Router, Signals, RxJS, and Reactive Forms.
- `src/main.ts` bootstraps `AppComponent` with `appConfig`; `app.routes.ts` defines the public landing page, sign-in, sign-up, and protected `/dashboard` route.
- Feature code is organized under `features/landing`, `features/auth`, and `features/dashboard`. Shared auth contracts and the auth service live under `core/models` and `core/services`.
- Tailwind CSS 4 is installed. Shared landing-page styles remain in global `src/styles.css`; the dashboard uses Tailwind utilities and has no component-specific stylesheet.
- Cairo is loaded from Google Fonts in the document and global stylesheet.
- The public landing page remains static and is composed from standalone sections. Its journey content and illustrations are local.

## Authentication and data

- The frontend preserves the existing `/api` base URL and JWT cookie contract. Auth requests use `withCredentials: true`.
- `AuthService` exposes the existing register, login, logout, and status requests. The status route is used by `authGuard`; authenticated identity is held in an Angular signal.
- Successful sign-in and registration navigate to `/dashboard`. The dashboard displays only the authenticated user's name and email returned by the existing auth contract.
- Backend routes currently expose authentication and workspace operations. Student, group, session, attendance, payment, and reporting models exist in the backend, but those domains have no API routes or dashboard data services.
- Dashboard statistics, schedule, activity, attendance, payments, and reports are therefore explicitly marked as not connected. No sample values or charts are shown.
- The backend was not modified.

## Visual system, assets, and motion

- The dashboard is Arabic-only and RTL, using the existing emerald, white, soft-gray, and dark-neutral palette. The authenticated teacher's identity and the existing Darsly logo and welcome illustration are used.
- The Journey section uses typed Lucide icon identifiers and all six existing step illustrations; no images were replaced or renamed.
- Responsive layouts cover desktop, tablet, and mobile. Dashboard and Journey styling uses Tailwind utilities; global reduced-motion support remains in place.
- The existing Lucide Angular integration provides the dashboard and Journey icons. No chart or animation dependencies were added.

## Verification

- `npm run build` succeeds for the production configuration.
- `npm test -- --watch=false` passes the existing test file, including auth-guard redirects, teacher identity, Journey image mapping, RTL navigation targets, and mobile menu keyboard behavior.
- The existing Angular test file was extended; no new spec file was created.
