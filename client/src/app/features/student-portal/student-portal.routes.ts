import { Routes } from '@angular/router';
import { studentAccessGuard } from '../../core/guards/student-access.guard';

export const STUDENT_PORTAL_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'overview',
  },
  {
    path: '',
    loadComponent: () =>
      import('./layout/student-portal-layout.component').then(
        (module) => module.StudentPortalLayoutComponent,
      ),
    children: [
      {
        path: 'overview',
        canActivate: [studentAccessGuard],
        loadComponent: () =>
          import('./pages/overview/student-portal-overview.component').then(
            (module) => module.StudentPortalOverviewComponent,
          ),
      },
      {
        path: 'profile',
        canActivate: [studentAccessGuard],
        loadComponent: () =>
          import('./pages/profile/student-portal-profile.component').then(
            (module) => module.StudentPortalProfileComponent,
          ),
      },
      {
        path: 'groups',
        canActivate: [studentAccessGuard],
        loadComponent: () =>
          import('./pages/groups/student-portal-groups.component').then(
            (module) => module.StudentPortalGroupsComponent,
          ),
      },
      {
        path: 'schedule',
        canActivate: [studentAccessGuard],
        loadComponent: () =>
          import('./pages/schedule/student-portal-schedule.component').then(
            (module) => module.StudentPortalScheduleComponent,
          ),
      },
      {
        path: 'attendance',
        canActivate: [studentAccessGuard],
        loadComponent: () =>
          import('./pages/attendance/student-portal-attendance.component').then(
            (module) => module.StudentPortalAttendanceComponent,
          ),
      },
      {
        path: 'select-context',
        loadComponent: () =>
          import('./pages/context-selection/student-context-selection.component').then(
            (module) => module.StudentContextSelectionComponent,
          ),
      },
    ],
  },
];
