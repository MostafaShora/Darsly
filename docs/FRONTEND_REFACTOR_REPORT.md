# Darsly Frontend Refactor Report

## Files changed

- `client/src/styles.css`
- `client/src/app/features/landing/components/navbar/navbar.component.html`
- `client/src/app/features/landing/components/hero/hero.component.html`
- `client/src/app/features/landing/components/features/features.component.html`
- `client/src/app/features/landing/components/teacher-journey/teacher-journey.component.html`
- `client/src/app/features/landing/components/before-after/before-after.component.html`
- `client/src/app/features/landing/components/daily-workflow/daily-workflow.component.html`
- `client/src/app/features/landing/components/audience/audience.component.html`
- `client/src/app/features/landing/components/final-cta/final-cta.component.html`
- `client/src/app/features/landing/components/footer/footer.component.html`
- `client/src/app/app.spec.ts`
- `docs/FRONTEND_AUDIT.md`
- `docs/BACKEND_INTEGRATION_NOTES.md`

## Components reorganized

The existing standalone landing feature structure was retained because it already matches the intended simple feature-based architecture. No component files or public component names were renamed or moved.

The following presentation templates were converted to Tailwind-first utility styling:

- Navbar
- Hero
- Features
- Teacher Journey
- Before/After
- Daily Workflow
- Audience
- Final CTA
- Footer

The journey signal/computed implementation remains unchanged, so active-step selection, next/previous controls, progress dots, and character image synchronization retain their existing behavior.

## CSS migrated to Tailwind

Tailwind CSS 4 was already integrated correctly through:

- `tailwindcss` 4.1.12
- `@tailwindcss/postcss` 4.1.12
- `.postcssrc.json`
- `@import "tailwindcss"` in `src/styles.css`

The migration uses Tailwind utilities for:

- Grid and flex layouts
- Spacing and sizing
- Responsive breakpoints
- Text size and weight
- Colors
- Borders and rounded corners
- Shadows
- Positioning
- State-dependent classes
- Standard transitions

## Remaining custom CSS

The global stylesheet was reduced from approximately 1,388 lines to a small set of global concerns and complex visual definitions:

- Tailwind import
- Root font and color setup
- HTML/body/reset behavior
- Shared section width
- Shared eyebrow and live-dot markers
- Hero glow, 3D character, floating cards, and orbit decorations
- Journey character stage, halo, image mix-blend/filter, and character-enter animation
- Audience orb
- Responsive sizing for character and decorative stage elements
- Reduced-motion behavior

These custom rules remain only where a visual effect or animation would be less accurate or substantially less readable as utilities.

## Responsive changes

- Navbar now stays visible on mobile and hides only its in-page navigation.
- Hero uses a deliberate stacked mobile layout and the desktop RTL grid composition remains text right and character left.
- Features use two columns on mobile, three columns on medium screens, and five columns on large screens.
- Before/After uses one column on mobile and two columns on medium and larger screens.
- Daily Workflow uses two columns on mobile and four columns on desktop.
- Audience stacks below the tablet breakpoint and preserves decorative positioning on larger screens.
- Footer uses a mobile-safe single-column link layout before expanding to three columns.
- Teacher Journey switches to two-column step navigation on mobile and a 300 px plus content layout on desktop.
- Journey character stage retains its image and enter animation at responsive heights.

## Backend contracts preserved

- No backend files were modified.
- No API endpoint, environment property, request shape, response shape, authentication behavior, or route contract was changed.
- Existing `apiBaseUrl: '/api'` environment values remain unchanged.
- No frontend HTTP calls or fake API responses were introduced.
- Backend auth and workspace routes are documented without implementation.

## Build and verification results

- Baseline Angular build passed.
- Post-refactor Angular production build passed.
- Angular unit test suite passed: 1 test file, 2 tests.
- The development server started successfully at `http://127.0.0.1:4200/`.
- Root route smoke check returned HTTP 200.
- All seven landing image assets returned HTTP 200:
  - `teacher-3d.png`
  - `journey-1.webp`
  - `journey-2.webp`
  - `journey-3.webp`
  - `journey-4.webp`
  - `journey-5.webp`
  - `journey-6.webp`
- No `any` usages were found in the frontend TypeScript source.

## Known limitations

- Browser-based visual verification at 320, 375, 390, 430, 768, 1024, 1280, 1440, and 1600 px was not performed. The responsive decisions are implemented and build-tested, but visual overflow at every breakpoint is not claimed as visually verified.
- Browser console automation was not available during this implementation.
- The page currently has no router-backed landing route; `AppComponent` continues to compose the landing sections as before.
- Backend integration remains intentionally deferred until endpoint payload and error contracts are confirmed in a frontend integration task.
