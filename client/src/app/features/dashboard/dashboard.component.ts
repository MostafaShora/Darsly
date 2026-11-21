import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { AuthService } from '../../core/services/auth.service';

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
  id: 'students' | 'groups' | 'attendance' | 'payments' | 'reports';
  label: string;
  description: string;
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
    description: 'لا تتوفر بيانات هذا القسم في لوحة التحكم بعد.',
  },
  {
    id: 'groups',
    label: 'المجموعات الدراسية',
    description: 'لا تتوفر بيانات هذا القسم في لوحة التحكم بعد.',
  },
  {
    id: 'attendance',
    label: 'الحضور',
    description: 'لا توجد واجهة برمجية متاحة لملخص الحضور أو سجلاته حتى الآن.',
  },
  {
    id: 'payments',
    label: 'المدفوعات',
    description: 'لا تتوفر بيانات هذا القسم في لوحة التحكم بعد.',
  },
  {
    id: 'reports',
    label: 'التقارير والأداء',
    description: 'لا تتوفر واجهة للتقارير أو إحصاءات الأداء في المشروع حاليًا.',
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
}
