import { Routes } from '@angular/router';

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
        loadComponent: () =>
          import('./pages/overview/student-portal-overview.component').then(
            (module) => module.StudentPortalOverviewComponent,
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/profile/student-portal-profile.component').then(
            (module) => module.StudentPortalProfileComponent,
          ),
      },
      {
        path: 'groups',
        loadComponent: () =>
          import('./pages/groups/student-portal-groups.component').then(
            (module) => module.StudentPortalGroupsComponent,
          ),
      },
      {
        path: 'schedule',
        loadComponent: () =>
          import('./pages/schedule/student-portal-schedule.component').then(
            (module) => module.StudentPortalScheduleComponent,
          ),
      },
      {
        path: 'attendance',
        loadComponent: () =>
          import('./pages/attendance/student-portal-attendance.component').then(
            (module) => module.StudentPortalAttendanceComponent,
          ),
      },
    ],
  },
];
