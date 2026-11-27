import { Component, HostListener, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

type StudentPortalIcon =
  | 'layout-dashboard'
  | 'users-round'
  | 'book-open'
  | 'calendar-days'
  | 'clipboard-check';

interface StudentPortalNavigationItem {
  label: string;
  path: string;
  icon: StudentPortalIcon;
}

@Component({
  selector: 'app-student-portal-layout',
  standalone: true,
  imports: [LucideDynamicIcon, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './student-portal-layout.component.html',
})
export class StudentPortalLayoutComponent {
  readonly isMobileNavigationOpen = signal(false);
  readonly navigationItems: readonly StudentPortalNavigationItem[] = [
    { label: 'نظرة عامة', path: '/student/overview', icon: 'layout-dashboard' },
    { label: 'ملفي الشخصي', path: '/student/profile', icon: 'users-round' },
    { label: 'مجموعاتي', path: '/student/groups', icon: 'book-open' },
    { label: 'جدولي', path: '/student/schedule', icon: 'calendar-days' },
    { label: 'حضوري', path: '/student/attendance', icon: 'clipboard-check' },
  ];

  toggleMobileNavigation(): void {
    this.isMobileNavigationOpen.update((isOpen) => !isOpen);
  }

  closeMobileNavigation(): void {
    this.isMobileNavigationOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  closeNavigationOnEscape(): void {
    this.closeMobileNavigation();
  }
}
