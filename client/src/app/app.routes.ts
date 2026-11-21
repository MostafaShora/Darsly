import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { LANDING_ROUTES } from './features/landing/landing.routes';

export const routes: Routes = [
  ...LANDING_ROUTES,
  {
    path: 'sign-in',
    loadComponent: () =>
      import('./features/auth/pages/sign-in/sign-in.component').then(
        (module) => module.SignInComponent,
      ),
  },
  {
    path: 'sign-up',
    loadComponent: () =>
      import('./features/auth/pages/sign-up/sign-up.component').then(
        (module) => module.SignUpComponent,
      ),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (module) => module.DashboardComponent,
      ),
  },
];
