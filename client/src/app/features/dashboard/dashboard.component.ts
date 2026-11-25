import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { AuthService } from '../../core/services/auth.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { DashboardSummary, ReportService } from '../../core/services/report.service';
import { formatMoneyExact } from '../../core/utils/finance';

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
  imports: [LucideDynamicIcon, RouterLink],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly currentDate = new Date();

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
  private readonly workspaceService = inject(WorkspaceService);
  private readonly reportService = inject(ReportService);

  constructor() {
    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.dashboardLoading.set(true);
    this.dashboardError.set('');
    this.workspaceService.getActiveWorkspace().subscribe({
      next: (workspace) => {
        if (!workspace?._id) {
          this.dashboardLoading.set(false);
          this.dashboardError.set('لا تتوفر مساحة عمل نشطة.');
          return;
        }
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!timezone) {
          this.dashboardLoading.set(false);
          this.dashboardError.set('تعذر تحديد المنطقة الزمنية لهذا الجهاز.');
          return;
        }
        this.reportService.getDashboard(workspace._id, timezone).subscribe({
          next: (summary) => {
            this.summary.set(summary);
            this.dashboardLoading.set(false);
          },
          error: () => {
            this.dashboardError.set('تعذر تحميل ملخص لوحة التحكم.');
            this.dashboardLoading.set(false);
          },
        });
      },
      error: () => {
        this.dashboardError.set('تعذر تحميل مساحة العمل.');
        this.dashboardLoading.set(false);
      },
    });
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

  formatRate(value: number | null | undefined): string {
    if (value === null || value === undefined) return 'غير متاح';
    return `${new Intl.NumberFormat('ar-EG', {
      maximumFractionDigits: 1,
    }).format(value)}٪`;
  }
}
