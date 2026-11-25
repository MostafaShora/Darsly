import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { workspaceGuard } from './core/guards/workspace.guard';
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
    path: 'workspace/onboarding',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/workspace/workspace-onboarding.component').then(
        (module) => module.WorkspaceOnboardingComponent,
      ),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (module) => module.DashboardComponent,
      ),
  },
  {
    path: 'reports',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/reports/reports.component').then(
        (module) => module.ReportsComponent,
      ),
  },
  {
    path: 'finance',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/finance/finance-overview.component').then(
        (module) => module.FinanceOverviewComponent,
      ),
  },
  {
    path: 'invoices/new',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/finance/invoices.component').then(
        (module) => module.InvoicesComponent,
      ),
  },
  {
    path: 'invoices/:invoiceId',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/finance/invoices.component').then(
        (module) => module.InvoicesComponent,
      ),
  },
  {
    path: 'invoices',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/finance/invoices.component').then(
        (module) => module.InvoicesComponent,
      ),
  },
  {
    path: 'payments/new',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/finance/payments.component').then(
        (module) => module.PaymentsComponent,
      ),
  },
  {
    path: 'payments/:paymentId',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/finance/payments.component').then(
        (module) => module.PaymentsComponent,
      ),
  },
  {
    path: 'payments',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/finance/payments.component').then(
        (module) => module.PaymentsComponent,
      ),
  },
  {
    path: 'attendance/sessions/:sessionId',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/attendance/attendance.component').then(
        (module) => module.AttendanceComponent,
      ),
  },
  {
    path: 'attendance/students/:studentId',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/attendance/attendance.component').then(
        (module) => module.AttendanceComponent,
      ),
  },
  {
    path: 'attendance',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/attendance/attendance.component').then(
        (module) => module.AttendanceComponent,
      ),
  },
  {
    path: 'sessions/:sessionId',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/sessions/sessions.component').then(
        (module) => module.SessionsComponent,
      ),
  },
  {
    path: 'sessions',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/sessions/sessions.component').then(
        (module) => module.SessionsComponent,
      ),
  },
  {
    path: 'subjects/:subjectId',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/subjects/subjects.component').then(
        (module) => module.SubjectsComponent,
      ),
  },
  {
    path: 'subjects',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/subjects/subjects.component').then(
        (module) => module.SubjectsComponent,
      ),
  },
  {
    path: 'groups/:groupId',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/groups/groups.component').then(
        (module) => module.GroupsComponent,
      ),
  },
  {
    path: 'groups',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/groups/groups.component').then(
        (module) => module.GroupsComponent,
      ),
  },
  {
    path: 'students/:studentId',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/students/students.component').then(
        (module) => module.StudentsComponent,
      ),
  },
  {
    path: 'students',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/students/students.component').then(
        (module) => module.StudentsComponent,
      ),
  },
  {
    path: 'guardians/:guardianId',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/guardians/guardians.component').then(
        (module) => module.GuardiansComponent,
      ),
  },
  {
    path: 'guardians',
    canActivate: [authGuard, workspaceGuard],
    loadComponent: () =>
      import('./features/guardians/guardians.component').then(
        (module) => module.GuardiansComponent,
      ),
  },
];
