# Darsly Frontend Audit

## 1. Current project architecture

- The Angular application is in `client/`; the repository also contains an independent backend in `backend/`.
- The frontend uses Angular 22.0 with standalone components and the application builder.
- `src/main.ts` bootstraps `AppComponent` through `appConfig`.
- Routing is currently empty. `AppComponent` directly composes every landing-page section.
- A landing feature folder already exists with separate section components, static journey data, and a journey model.
- The frontend has no HTTP client usage, API services, domain services, or frontend models beyond the journey model.
- Tailwind CSS 4 is installed (`tailwindcss` and `@tailwindcss/postcss` 4.1.12) and loaded through `@tailwindcss/postcss` and `@import "tailwindcss"`.
- The baseline `npm run build` succeeds.

## 2. Existing component structure

The landing page is split into the following standalone components:

- Navbar
- Hero
- Features
- Teacher Journey
- Before/After
- Daily Workflow
- Audience
- Final CTA
- Footer

Supporting landing files include `features/landing/data/journey.data.ts` and `features/landing/models/journey.model.ts`.

The structure is already close to a simple feature-based architecture. It does not currently require widespread file movement. The main architecture weakness is that `AppComponent` owns all visual composition and the landing route file is empty, although the route is not currently needed.

## 3. Current styling approach

- Global `src/styles.css` contains approximately 1,388 lines of traditional CSS.
- The same stylesheet defines reset, typography, layout, every component, desktop rules, responsive rules, animations, and complex visual effects.
- No component-specific CSS or SCSS files exist, which is consistent with the migration constraints.
- Tailwind 4 is correctly configured through `.postcssrc.json`.
- Cairo is loaded locally through both `index.html` and the CSS import.
- CSS custom classes are the primary design system: `section-wrap`, `section-heading`, `primary-btn`, `feature-card`, journey panel classes, and similar classes.
- Assets are correctly stored under `public/assets` and are referenced with `/assets/...` or `assets/...`.

## 4. Responsive issues and file references

The stylesheet contains duplicated breakpoint blocks and some mobile behavior that may not be deliberate:

- `src/styles.css:733-768` and `src/styles.css:1312-1324` apply tablet adjustments twice.
- `src/styles.css:770-944` and `src/styles.css:1326-1386` apply mobile adjustments twice.
- `src/styles.css:91-96` fixes the hero to a 0.95/1.05 desktop split; at tablet widths this becomes a constrained pair of columns.
- `src/styles.css:208-293` positions the visual cards and teacher with fixed dimensions. On narrow screens (`src/styles.css:795-826`), cards can crowd a 320–375 px viewport.
- `src/styles.css:347-379` renders five feature cards in one row, then three at `900 px`, two at `650 px`. The 320 px layout should be verified for card text and fixed minimum heights.
- `src/styles.css:405-495` uses a 300 px steps column and 390 px panel minimum; this should be checked for tablet and mobile overflow.
- `src/styles.css:733-768` changes the journey panel to one column only at `900 px`, but `650 px` switches the entire journey to a single column.
- `src/styles.css:1030-1034` switches Before/After to one column only below `650 px`, leaving a potentially tight two-column row at 651–900 px.
- `src/styles.css:1135-1170` uses four workflow cards; at mobile it switches to two columns. Text and cards should be tested at 320 px.
- `src/styles.css:1177-1239` has audience chips positioned absolutely around a 230 px orb. At 320–375 px this needs clipping and overlap verification.
- `src/styles.css:1256-1309` footer links use three columns in the desktop layout and three 110 px minimum columns; the mobile override should be verified at 320 px.
- `src/styles.css:20-21` sets `min-width: 320px`, preserving 320 px but not allowing below-320 layouts.
- `src/styles.css:388-397` has decorative journey overflow hidden by design.
- Global `h1`, `h2`, and `.primary-btn` rules can unintentionally affect future application screens outside the landing page.

## 5. Potential architectural problems

- No route-level landing component/lazy route exists; the page is a monolithic root composition.
- The existing `landing.routes.ts` is empty despite a route-ready comment.
- `AppComponent` imports presentation components directly, so route composition is coupled to the root.
- Static journey content is already separated from the component.
- A stale `app.spec.ts` references `App` instead of `AppComponent` and stale Hello-client assertions. It should be updated or removed because it currently does not describe the actual application.
- Global CSS is not a maintainable design system and contains repeated media blocks.
- A small number of global element selectors (`h1`, `h2`, `a`, `button`) may affect future authenticated screens.
- No frontend API service or typed HTTP integration exists, so future backend integration has no presentation/data-access seam yet.
- The backend has validation and auth/workspace contracts, but these are not consumed by the frontend.
- No accessibility audit tooling is configured. Interactive journey controls should have explicit states and mobile target-size checks.

## 6. Backend integration points that must be preserved

- `src/environments/environment.ts` and `environment.development.ts` both preserve `apiBaseUrl: '/api'`.
- Backend auth routes are `/auth/register`, `/auth/login`, `/auth/logout`, and `/auth/status`.
- Workspace routes are `/workspaces`, `/workspaces/mine`, `/workspaces/:workspaceId`, `/workspaces/:workspaceId/suspend`, and `/workspaces/:workspaceId/activate`.
- Authentication behavior uses a JWT authentication cookie. The frontend must not invent or replace the cookie contract.
- Response shapes include a safe user object for auth and `message` plus `data` or `user` fields for operations.
- No frontend HTTP code or auth state currently exists, so no request or response contract has been altered.
- All future integration must remain in services and typed models; UI components must not call HTTP directly.

## 7. Recommended target architecture

Keep the existing landing feature and standalone component pattern. Add structure only where it reduces coupling:

- Keep `core/services`, `core/models`, and `core/constants` for future application-wide API/auth concerns.
- Keep shared UI primitives under `shared/components` or `shared/ui` only when reused.
- Keep landing static content and models inside `features/landing`.
- Optionally add a root landing route component later if routing becomes necessary. Do not create it only for file movement.
- Use Tailwind utilities in templates for layout, spacing, typography, borders, colors, and standard responsive behavior.
- Retain a small global stylesheet for Cairo/font setup, resets, document direction, Tailwind import, essential scrollbar/selection behavior, and genuinely complex visual effects.
- Do not create component-specific CSS/SCSS files.

## 8. Migration plan ordered by risk and priority

1. Establish the final global Tailwind and font/reset baseline, preserving existing values.
2. Consolidate duplicate responsive media blocks and verify no visual declaration is lost.
3. Convert isolated, low-risk components first: Navbar, Features, Daily Workflow, Audience, and Footer.
4. Convert static layout sections: Before/After and Final CTA.
5. Convert Hero carefully, preserving RTL copy on the right and the character on the left on desktop.
6. Convert Teacher Journey last, preserving signal state, image synchronization, navigation, and character-enter animation.
7. Remove obsolete global selectors only after their templates no longer depend on them.
8. Add future core services/models only when backend endpoints are consumed; do not invent integrations.
9. Update or replace the stale test; do not add unnecessary new spec files.
10. Run build and document the final verified state.
