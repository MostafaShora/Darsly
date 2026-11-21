# Darsly Frontend Architecture and Dashboard Audit

## Architecture

- The application lives in `client/` and uses Angular 22, standalone components, Angular Router, Signals, RxJS, and Reactive Forms.
- `src/main.ts` bootstraps `AppComponent` with `appConfig`; `app.routes.ts` defines the public landing page, sign-in, sign-up, and protected `/dashboard` route.
- Feature code is organized under `features/landing`, `features/auth`, and `features/dashboard`. Shared auth contracts and the auth service live under `core/models` and `core/services`.
- Tailwind CSS 4 is installed. The project keeps its main visual system in the global `src/styles.css`; there are no component-specific stylesheets.
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

- The dashboard uses the existing emerald, white, soft-gray, and dark-neutral palette, and supports Arabic RTL and English LTR with a language toggle.
- The welcoming teacher image and schedule illustration use existing assets under `public/assets`; the existing Darsly logo is reused without replacing or editing it.
- Responsive layouts cover desktop, tablet, and mobile. Dashboard transitions, staggered entrance, and session-verification skeletons are CSS-only. The global `prefers-reduced-motion` rule disables animation and transitions.
- No animation or chart dependencies were added.

## Verification

- `npm run build` succeeds for the production configuration.
- `npm test -- --watch=false` passes the existing test file (5 tests), including auth-guard redirects, teacher identity, public routes, and language direction.
- The existing Angular test file was extended; no new spec file was created.
