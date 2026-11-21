import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

type DashboardLanguage = 'ar' | 'en';

const DASHBOARD_COPY = {
  ar: {
    workspace: 'مساحة عمل المدرّس',
    overview: 'نظرة عامة',
    students: 'الطلاب',
    groups: 'المجموعات والحصص',
    schedule: 'جدول اليوم',
    attendance: 'الحضور',
    payments: 'المدفوعات',
    reports: 'التقارير',
    welcome: 'أهلًا بعودتك،',
    welcomeDescription: 'مساحتك التعليمية في مكان واحد. ستظهر بياناتك هنا عند توصيل أقسام المنصة.',
    account: 'الحساب',
    signedIn: 'تم تسجيل الدخول',
    notConnected: 'غير متصل بعد',
    statsDescription: 'سيظهر الملخص هنا عند توفر بيانات هذا القسم.',
    scheduleDescription: 'الحصص القادمة',
    scheduleEmpty: 'جدول الحصص غير متاح حاليًا',
    scheduleEmptyDescription: 'لا توجد واجهة برمجية للحصص متصلة بلوحة التحكم حتى الآن.',
    scheduleCharacterAlt: 'مدرس يشير إلى تقويم ومجموعة من الطلاب',
    activity: 'النشاط الأخير',
    activityEmpty: 'سجل النشاط غير متاح حاليًا',
    activityEmptyDescription: 'سيظهر آخر النشاط عند توفر مصدر بيانات لهذا القسم.',
    sections: 'أقسام المنصة',
    sectionsDescription: 'انتقل إلى القسم الذي تريد مراجعته.',
    studentsDescription: 'إدارة ملفات الطلاب وإحصاءاتهم غير متصلة بعد.',
    groupsDescription: 'إدارة المجموعات والحصص غير متصلة بعد.',
    attendanceDescription: 'ملخص الحضور وسجلاته غير متصلين بعد.',
    paymentsDescription: 'ملخص المدفوعات والمستحقات غير متصل بعد.',
    reportsDescription: 'التقارير ومؤشرات الأداء غير متصلة بعد.',
    language: 'English',
    menu: 'فتح القائمة',
    closeMenu: 'إغلاق القائمة',
    signOut: 'تسجيل الخروج',
    signingOut: 'جارٍ تسجيل الخروج...',
    signOutError: 'تعذر تسجيل الخروج. تحقق من اتصالك وحاول مرة أخرى.',
    dateLabel: 'تاريخ اليوم',
    navigation: 'التنقل الرئيسي',
    pageTitle: 'لوحة تحكم المدرّس',
    goTo: 'الانتقال إلى',
    characterAlt: 'مدرس يرحب بك في لوحة Darsly',
  },
  en: {
    workspace: 'Teacher workspace',
    overview: 'Overview',
    students: 'Students',
    groups: 'Groups & sessions',
    schedule: "Today's schedule",
    attendance: 'Attendance',
    payments: 'Payments',
    reports: 'Reports',
    welcome: 'Welcome back,',
    welcomeDescription:
      'Your teaching workspace, in one place. Connected platform data will appear here as features become available.',
    account: 'Account',
    signedIn: 'Signed in',
    notConnected: 'Not connected yet',
    statsDescription: 'A summary will appear here when this section has connected data.',
    scheduleDescription: 'Upcoming sessions',
    scheduleEmpty: 'Session schedule is not available yet',
    scheduleEmptyDescription: 'No sessions API is connected to the dashboard at this time.',
    scheduleCharacterAlt: 'A teacher pointing to a class calendar and students',
    activity: 'Recent activity',
    activityEmpty: 'Activity history is not available yet',
    activityEmptyDescription: 'Recent activity will appear here when a data source is available.',
    sections: 'Platform sections',
    sectionsDescription: 'Choose a section to review.',
    studentsDescription: 'Student records and statistics are not connected yet.',
    groupsDescription: 'Group and session management is not connected yet.',
    attendanceDescription: 'Attendance summaries and records are not connected yet.',
    paymentsDescription: 'Payment summaries and outstanding balances are not connected yet.',
    reportsDescription: 'Reports and performance insights are not connected yet.',
    language: 'العربية',
    menu: 'Open navigation',
    closeMenu: 'Close navigation',
    signOut: 'Sign out',
    signingOut: 'Signing out...',
    signOutError: 'Could not sign out. Check your connection and try again.',
    dateLabel: "Today's date",
    navigation: 'Main navigation',
    pageTitle: 'Teacher dashboard',
    goTo: 'Go to',
    characterAlt: 'A welcoming Darsly teacher character',
  },
} as const;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  readonly language = signal<DashboardLanguage>('ar');
  readonly copy = computed(() => DASHBOARD_COPY[this.language()]);
  readonly isArabic = computed(() => this.language() === 'ar');
  readonly activeSection = signal('overview');
  readonly isMobileNavigationOpen = signal(false);
  readonly isSigningOut = signal(false);
  readonly signOutError = signal('');
  readonly teacherName = computed(() => this.authService.currentUser()?.name ?? '');
  readonly teacherEmail = computed(() => this.authService.currentUser()?.email ?? '');
  readonly teacherInitials = computed(() => {
    const name = this.teacherName().trim();
    return Array.from(name).slice(0, 2).join('') || 'D';
  });
  readonly today = computed(() =>
    new Intl.DateTimeFormat(this.isArabic() ? 'ar-EG' : 'en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date()),
  );
  readonly navigationItems = computed(() => [
    { id: 'overview', label: this.copy().overview },
    { id: 'students', label: this.copy().students },
    { id: 'groups', label: this.copy().groups },
    { id: 'schedule', label: this.copy().schedule },
    { id: 'attendance', label: this.copy().attendance },
    { id: 'payments', label: this.copy().payments },
    { id: 'reports', label: this.copy().reports },
  ]);
  readonly overviewCards = computed(() => [
    { id: 'students', label: this.copy().students },
    { id: 'groups', label: this.copy().groups },
    { id: 'attendance', label: this.copy().attendance },
    { id: 'payments', label: this.copy().payments },
  ]);
  readonly featureCards = computed(() => [
    {
      id: 'students',
      label: this.copy().students,
      description: this.copy().studentsDescription,
    },
    {
      id: 'groups',
      label: this.copy().groups,
      description: this.copy().groupsDescription,
    },
    {
      id: 'attendance',
      label: this.copy().attendance,
      description: this.copy().attendanceDescription,
    },
    {
      id: 'payments',
      label: this.copy().payments,
      description: this.copy().paymentsDescription,
    },
    {
      id: 'reports',
      label: this.copy().reports,
      description: this.copy().reportsDescription,
    },
  ]);

  private readonly originalDocumentLanguage = this.document.documentElement.lang;
  private readonly originalDocumentDirection = this.document.documentElement.dir;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.document.documentElement.lang = this.originalDocumentLanguage;
      this.document.documentElement.dir = this.originalDocumentDirection;
    });
  }

  toggleLanguage(): void {
    const nextLanguage = this.isArabic() ? 'en' : 'ar';
    this.language.set(nextLanguage);
    this.document.documentElement.lang = nextLanguage;
    this.document.documentElement.dir = nextLanguage === 'ar' ? 'rtl' : 'ltr';
    this.signOutError.set('');
  }

  closeMobileNavigation(): void {
    this.isMobileNavigationOpen.set(false);
  }

  setActiveSection(sectionId: string): void {
    this.activeSection.set(sectionId);
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
        this.signOutError.set(this.copy().signOutError);
      },
    });
  }
}
