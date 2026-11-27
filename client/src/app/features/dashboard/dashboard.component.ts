import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, map, of, Subscription, switchMap } from 'rxjs';
import { Session, StudyGroup, Subject } from '../../core/models/learning.models';
import { AuthService } from '../../core/services/auth.service';
import {
  WorkspaceAvailability,
  WorkspaceService,
} from '../../core/services/workspace.service';
import {
  DashboardActivityItem,
  DashboardSummary,
  ReportService,
} from '../../core/services/report.service';
import { LearningService } from '../../core/services/learning.service';
import { formatMoneyExact } from '../../core/utils/finance';
import { WorkspaceSelectorComponent } from '../workspace/workspace-selector.component';

type DashboardSection =
  'overview' | 'students' | 'groups' | 'schedule' | 'attendance' | 'payments' | 'reports';
type DashboardIcon =
  | 'layout-dashboard'
  | 'users-round'
  | 'book-open'
  | 'calendar-days'
  | 'clipboard-check'
  | 'wallet'
  | 'chart-no-axes-combined';

interface DashboardNavigationItem {
  id: DashboardSection;
  label: string;
  href: `#${string}`;
  icon: DashboardIcon;
}

interface DashboardMetric {
  id: 'students' | 'groups' | 'sessions' | 'payments';
  label: string;
  icon: DashboardIcon;
}

interface DashboardFeature {
  id:
    | 'students'
    | 'guardians'
    | 'subjects'
    | 'groups'
    | 'sessions'
    | 'attendance'
    | 'payments'
    | 'reports';
  label: string;
  description: string;
}

interface DashboardManagementLink {
  label: string;
  href: string;
}

interface DashboardUpcomingSession {
  session: Session;
  group: StudyGroup;
  subject: Subject;
}

const DASHBOARD_NAVIGATION: readonly DashboardNavigationItem[] = [
  { id: 'overview', label: 'نظرة عامة', href: '#overview', icon: 'layout-dashboard' },
  { id: 'students', label: 'الطلاب', href: '#students', icon: 'users-round' },
  { id: 'groups', label: 'المجموعات الدراسية', href: '#groups', icon: 'book-open' },
  { id: 'schedule', label: 'الحصص والجدول', href: '#schedule', icon: 'calendar-days' },
  { id: 'attendance', label: 'الحضور', href: '#attendance', icon: 'clipboard-check' },
  { id: 'payments', label: 'المدفوعات', href: '#payments', icon: 'wallet' },
  { id: 'reports', label: 'التقارير', href: '#reports', icon: 'chart-no-axes-combined' },
];

const DASHBOARD_METRICS: readonly DashboardMetric[] = [
  { id: 'students', label: 'الطلاب', icon: 'users-round' },
  { id: 'groups', label: 'المجموعات الدراسية', icon: 'book-open' },
  { id: 'sessions', label: 'الحصص', icon: 'calendar-days' },
  { id: 'payments', label: 'المدفوعات', icon: 'wallet' },
];

const DASHBOARD_FEATURES: readonly DashboardFeature[] = [
  {
    id: 'students',
    label: 'الطلاب',
    description: 'إدارة ملفات الطلاب وبيانات التواصل والحالة.',
  },
  {
    id: 'guardians',
    label: 'أولياء الأمور',
    description: 'إدارة جهات اتصال أولياء الأمور وربطهم بملفات الطلاب.',
  },
  {
    id: 'subjects',
    label: 'المواد الدراسية',
    description: 'إدارة المواد وربطها بالمجموعات الدراسية.',
  },
  {
    id: 'groups',
    label: 'المجموعات الدراسية',
    description: 'إدارة المجموعات والتسجيلات وسعتها.',
  },
  {
    id: 'sessions',
    label: 'الجلسات',
    description: 'إنشاء الجلسات ومراجعة مواعيدها وحالاتها.',
  },
  {
    id: 'attendance',
    label: 'الحضور',
    description: 'تسجيل الحضور ومراجعته حسب الجلسة أو ملف الطالب.',
  },
  {
    id: 'payments',
    label: 'المدفوعات',
    description: 'التحصيل والأرصدة المستحقة والمدفوعات غير المخصّصة.',
  },
  {
    id: 'reports',
    label: 'التقارير والأداء',
    description: 'عرض تقارير الحضور والمالية وتنزيل جدول أو طباعته إلى PDF.',
  },
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [LucideDynamicIcon, RouterLink, WorkspaceSelectorComponent],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly currentDate = new Date();
  private readonly destroyRef = inject(DestroyRef);

  readonly teacher = this.authService.currentUser;
  readonly teacherName = computed(() => this.teacher()?.name ?? '');
  readonly teacherEmail = computed(() => this.teacher()?.email ?? '');
  readonly teacherInitials = computed(() => {
    const nameParts = this.teacherName().trim().split(/\s+/u);
    const initials = nameParts
      .slice(0, 2)
      .map((part) => Array.from(part)[0] ?? '')
      .join('');
    return initials || 'م';
  });
  readonly today = new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(this.currentDate);
  readonly todayDateIso = [
    this.currentDate.getFullYear(),
    String(this.currentDate.getMonth() + 1).padStart(2, '0'),
    String(this.currentDate.getDate()).padStart(2, '0'),
  ].join('-');
  readonly navigationItems = DASHBOARD_NAVIGATION;
  readonly managementLinks: readonly DashboardManagementLink[] = [
    { label: 'إدارة الطلاب', href: '/students' },
    { label: 'أولياء الأمور', href: '/guardians' },
    { label: 'المواد الدراسية', href: '/subjects' },
    { label: 'المجموعات', href: '/groups' },
    { label: 'إدارة الجلسات', href: '/sessions' },
    { label: 'إدارة الحضور', href: '/attendance' },
    { label: 'الإدارة المالية', href: '/finance' },
  ];
  readonly metricCards = DASHBOARD_METRICS;
  readonly featureCards = DASHBOARD_FEATURES;
  readonly activeSection = signal<DashboardSection>('overview');
  readonly activeSectionLabel = computed(
    () =>
      DASHBOARD_NAVIGATION.find((item) => item.id === this.activeSection())?.label ?? 'نظرة عامة',
  );
  readonly isMobileNavigationOpen = signal(false);
  readonly isSigningOut = signal(false);
  readonly signOutError = signal('');
  readonly summary = signal<DashboardSummary | null>(null);
  readonly dashboardLoading = signal(false);
  readonly dashboardError = signal('');
  readonly upcomingSessions = signal<DashboardUpcomingSession[]>([]);
  readonly upcomingSessionsLoading = signal(false);
  readonly upcomingSessionsError = signal('');
  readonly recentActivity = signal<DashboardActivityItem[]>([]);
  readonly recentActivityLoading = signal(false);
  readonly recentActivityError = signal('');
  readonly workspaceAvailability = signal<WorkspaceAvailability | null>(null);
  readonly workspaceLoading = signal(true);
  readonly workspaceError = signal('');
  private readonly workspaceService = inject(WorkspaceService);
  private readonly reportService = inject(ReportService);
  private readonly learningService = inject(LearningService);
  private workspaceRequestId = 0;
  private workspaceSubscription: Subscription | null = null;

  constructor() {
    this.loadDashboard();
  }

  retryWorkspace(): void {
    this.loadDashboard(true);
  }

  private loadDashboard(refreshWorkspace = false): void {
    const workspaceLoadRequestId = ++this.workspaceRequestId;
    this.workspaceSubscription?.unsubscribe();
    this.summary.set(null);
    this.dashboardLoading.set(false);
    this.dashboardError.set('');
    this.upcomingSessions.set([]);
    this.upcomingSessionsLoading.set(false);
    this.upcomingSessionsError.set('');
    this.recentActivity.set([]);
    this.recentActivityLoading.set(false);
    this.recentActivityError.set('');
    this.workspaceLoading.set(true);
    this.workspaceError.set('');
    this.workspaceAvailability.set(null);
    const availability$ =
      this.workspaceService.watchWorkspaceAvailability?.(refreshWorkspace) ??
      this.workspaceService.getWorkspaceAvailability(refreshWorkspace);
    this.workspaceSubscription = availability$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (availability) => {
          const requestId = ++this.workspaceRequestId;
          this.workspaceAvailability.set(availability);
          this.workspaceLoading.set(false);
          this.summary.set(null);
          this.dashboardError.set('');
          this.upcomingSessions.set([]);
          this.upcomingSessionsError.set('');
          this.recentActivity.set([]);
          this.recentActivityError.set('');
          if (availability.kind !== 'active') {
            this.dashboardLoading.set(false);
            this.upcomingSessionsLoading.set(false);
            this.recentActivityLoading.set(false);
            return;
          }
          this.loadUpcomingSessions(availability.workspace._id, requestId);
          this.loadRecentActivity(availability.workspace._id, requestId);
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (!timezone) {
            this.dashboardLoading.set(false);
            this.dashboardError.set('تعذر تحديد المنطقة الزمنية لهذا الجهاز.');
          } else {
            this.dashboardLoading.set(true);
            this.reportService
              .getDashboard(availability.workspace._id, timezone)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: (summary) => {
                  if (!this.isCurrentWorkspaceRequest(requestId, availability.workspace._id)) {
                    return;
                  }
                  this.summary.set(summary);
                  this.dashboardLoading.set(false);
                },
                error: () => {
                  if (requestId !== this.workspaceRequestId) return;
                  this.dashboardError.set('تعذر تحميل ملخص لوحة التحكم.');
                  this.dashboardLoading.set(false);
                },
              });
          }
        },
        error: () => {
          if (workspaceLoadRequestId !== this.workspaceRequestId) return;
          this.summary.set(null);
          this.dashboardLoading.set(false);
          this.workspaceLoading.set(false);
          this.workspaceAvailability.set(null);
          this.workspaceError.set('تعذر تحميل مساحة العمل.');
        },
      });
  }

  retryDashboardData(): void {
    this.loadDashboard(true);
  }

  formatSessionDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'تاريخ غير متاح';
    return new Intl.DateTimeFormat('ar-EG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  sessionStatusLabel(status: Session['status']): string {
    return status === 'scheduled' ? 'مجدولة' : status === 'completed' ? 'مكتملة' : 'ملغاة';
  }

  activityDescription(activity: DashboardActivityItem): string {
    if (activity.type === 'attendance') {
      return `سُجّل حضور: ${this.attendanceStatusLabel(activity.status)}`;
    }
    return `سُجّلت دفعة: ${this.formatMoney(activity.amount)} ج.م`;
  }

  activityStatusLabel(activity: DashboardActivityItem): string {
    if (activity.type === 'attendance') return this.attendanceStatusLabel(activity.status);
    switch (activity.status) {
      case 'completed':
        return 'مكتملة';
      case 'pending':
        return 'قيد الانتظار';
      case 'failed':
        return 'فاشلة';
      case 'refunded':
        return 'مستردة';
    }
  }

  private loadUpcomingSessions(workspaceId: string, requestId: number): void {
    this.upcomingSessionsLoading.set(true);
    this.learningService
      .listSessions(workspaceId, {
        page: 1,
        pageSize: 5,
        from: new Date().toISOString(),
        status: 'scheduled',
      })
      .pipe(
        switchMap(({ items }) => {
          if (!this.isCurrentWorkspaceRequest(requestId, workspaceId)) return of([]);
          return items.length
            ? forkJoin(
                items.map((session) =>
                  this.learningService.getGroup(workspaceId, session.groupId).pipe(
                    switchMap((group) =>
                      this.learningService
                        .getSubject(workspaceId, group.subjectId)
                        .pipe(map((subject) => ({ session, group, subject }))),
                    ),
                  ),
                ),
              )
            : of([]);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (sessions) => {
          if (!this.isCurrentWorkspaceRequest(requestId, workspaceId)) return;
          this.upcomingSessions.set(sessions);
          this.upcomingSessionsLoading.set(false);
        },
        error: () => {
          if (requestId !== this.workspaceRequestId) return;
          this.upcomingSessions.set([]);
          this.upcomingSessionsLoading.set(false);
          this.upcomingSessionsError.set('تعذر تحميل الحصص القادمة.');
        },
      });
  }

  private loadRecentActivity(workspaceId: string, requestId: number): void {
    this.recentActivityLoading.set(true);
    this.reportService
      .getDashboardActivity(workspaceId, 5)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (activity) => {
          if (!this.isCurrentWorkspaceRequest(requestId, workspaceId)) return;
          this.recentActivity.set(activity);
          this.recentActivityLoading.set(false);
        },
        error: () => {
          if (requestId !== this.workspaceRequestId) return;
          this.recentActivity.set([]);
          this.recentActivityLoading.set(false);
          this.recentActivityError.set('تعذر تحميل النشاط الأخير.');
        },
      });
  }

  private isCurrentWorkspaceRequest(requestId: number, workspaceId: string): boolean {
    const currentAvailability = this.workspaceAvailability();
    return (
      requestId === this.workspaceRequestId &&
      currentAvailability?.kind === 'active' &&
      currentAvailability.workspace._id === workspaceId
    );
  }

  private attendanceStatusLabel(status: 'present' | 'absent' | 'late' | 'excused'): string {
    switch (status) {
      case 'present':
        return 'حاضر';
      case 'absent':
        return 'غائب';
      case 'late':
        return 'متأخر';
      case 'excused':
        return 'بعذر';
    }
  }

  toggleMobileNavigation(): void {
    this.isMobileNavigationOpen.update((isOpen) => !isOpen);
  }

  closeMobileNavigation(): void {
    this.isMobileNavigationOpen.set(false);
  }

  setActiveSection(section: DashboardSection): void {
    this.activeSection.set(section);
    this.closeMobileNavigation();
  }

  @HostListener('document:keydown.escape')
  closeNavigationOnEscape(): void {
    this.closeMobileNavigation();
  }

  signOut(): void {
    if (this.isSigningOut()) {
      return;
    }

    this.isSigningOut.set(true);
    this.signOutError.set('');

    this.authService.logout().subscribe({
      next: () => {
        this.isSigningOut.set(false);
        void this.router.navigateByUrl('/sign-in');
      },
      error: () => {
        this.isSigningOut.set(false);
        this.signOutError.set('تعذر تسجيل الخروج. تحقق من اتصالك وحاول مرة أخرى.');
      },
    });
  }

  formatMoney(value: string | undefined): string {
    return formatMoneyExact(value);
  }

}
