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
  {
    path: 'reports',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/reports/reports.component').then(
        (module) => module.ReportsComponent,
      ),
  },
  {
    path: 'sessions/:sessionId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/sessions/sessions.component').then(
        (module) => module.SessionsComponent,
      ),
  },
  {
    path: 'sessions',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/sessions/sessions.component').then(
        (module) => module.SessionsComponent,
      ),
  },
  {
    path: 'subjects/:subjectId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/subjects/subjects.component').then(
        (module) => module.SubjectsComponent,
      ),
  },
  {
    path: 'subjects',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/subjects/subjects.component').then(
        (module) => module.SubjectsComponent,
      ),
  },
  {
    path: 'groups/:groupId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/groups/groups.component').then(
        (module) => module.GroupsComponent,
      ),
  },
  {
    path: 'groups',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/groups/groups.component').then(
        (module) => module.GroupsComponent,
      ),
  },
  {
    path: 'students/:studentId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/students/students.component').then(
        (module) => module.StudentsComponent,
      ),
  },
  {
    path: 'students',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/students/students.component').then(
        (module) => module.StudentsComponent,
      ),
  },
  {
    path: 'guardians/:guardianId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/guardians/guardians.component').then(
        (module) => module.GuardiansComponent,
      ),
  },
  {
    path: 'guardians',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/guardians/guardians.component').then(
        (module) => module.GuardiansComponent,
      ),
  },
];
