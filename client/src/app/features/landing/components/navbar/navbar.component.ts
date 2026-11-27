import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import type { AuthUser } from '../../../../core/models/auth.models';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { AuthService } from '../../../../core/services/auth.service';
import { StudentContextService } from '../../../../core/services/student-context.service';

type AccountState = 'checking' | 'anonymous' | 'authenticated' | 'unavailable';
type DestinationState = 'hidden' | 'loading' | 'available' | 'empty' | 'error';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [LucideDynamicIcon, RouterLink],
  templateUrl: './navbar.component.html',
})
export class NavbarComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly studentContextService = inject(StudentContextService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private destinationsLoadedFor: string | null = null;

  @ViewChild('accountMenuTrigger') private accountMenuTrigger?: ElementRef<HTMLButtonElement>;

  readonly mobileMenuOpen = signal(false);
  readonly accountMenuOpen = signal(false);
  readonly accountState = signal<AccountState>('checking');
  readonly teacherAreaState = signal<DestinationState>('hidden');
  readonly studentAreaState = signal<DestinationState>('hidden');
  readonly accountError = signal('');
  readonly signOutError = signal('');
  readonly isSigningOut = signal(false);
  readonly user = this.authService.currentUser;

  ngOnInit(): void {
    this.loadAccountSummary();
  }

  retryAccountSummary(): void {
    this.loadAccountSummary();
  }

  private loadAccountSummary(): void {
    this.accountState.set('checking');
    this.accountError.set('');
    this.authService.getAccountStatus().subscribe({
      next: ({ user }) => {
        this.destinationsLoadedFor = null;
        this.teacherAreaState.set('hidden');
        this.studentAreaState.set('hidden');
        this.accountState.set('authenticated');
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.authService.clearCurrentUser();
          this.accountState.set('anonymous');
          return;
        }
        this.accountError.set('تعذّر التحقق من الحساب. أعد المحاولة قبل المتابعة.');
        this.accountState.set('unavailable');
      },
    });
  }

  private loadDestinations(user: AuthUser): void {
    if (this.destinationsLoadedFor === user.id) return;
    this.destinationsLoadedFor = user.id;
    const capabilities = user.capabilities;
    if (!capabilities) {
      this.teacherAreaState.set('error');
      this.studentAreaState.set('error');
      return;
    }

    this.teacherAreaState.set(capabilities.teacher ? 'loading' : 'hidden');
    this.studentAreaState.set(capabilities.student ? 'loading' : 'hidden');

    if (capabilities.teacher) {
      this.workspaceService.getMyWorkspaces().subscribe({
        next: (workspaces) => {
          this.teacherAreaState.set(
            workspaces.some((workspace) => workspace.status === 'active')
              ? 'available'
              : 'empty',
          );
        },
        error: (error: unknown) => {
          this.teacherAreaState.set('error');
          this.handleDestinationAuthError(error);
        },
      });
    }

    if (capabilities.student) {
      this.studentContextService.getActiveContexts().subscribe({
        next: (contexts) => {
          this.studentAreaState.set(contexts.length > 0 ? 'available' : 'empty');
        },
        error: (error: unknown) => {
          this.studentAreaState.set('error');
          this.handleDestinationAuthError(error);
        },
      });
    }
  }

  private handleDestinationAuthError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.authService.clearCurrentUser();
      this.accountState.set('anonymous');
      this.closeAccountMenu();
    }
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleAccountMenu(): void {
    const opening = !this.accountMenuOpen();
    this.accountMenuOpen.set(opening);
    if (opening) {
      const user = this.user();
      if (user) this.loadDestinations(user);
    }
  }

  closeAccountMenu(): void {
    this.accountMenuOpen.set(false);
  }

  retryDestinations(): void {
    this.destinationsLoadedFor = null;
    const user = this.user();
    if (user) this.loadDestinations(user);
  }

  signOut(): void {
    if (this.isSigningOut()) return;

    this.isSigningOut.set(true);
    this.signOutError.set('');
    this.authService.logout().subscribe({
      next: () => {
        this.isSigningOut.set(false);
        this.closeAccountMenu();
        void this.router.navigateByUrl('/sign-in');
      },
      error: () => {
        this.isSigningOut.set(false);
        this.signOutError.set('تعذّر تسجيل الخروج. تحقّق من الاتصال وحاول مرة أخرى.');
      },
    });
  }

  @HostListener('document:click', ['$event'])
  closeAccountMenuOnOutsideClick(event: Event): void {
    if (
      this.accountMenuOpen() &&
      event.target instanceof Node &&
      !this.host.nativeElement.contains(event.target)
    ) {
      this.closeAccountMenu();
    }
  }

  @HostListener('document:keydown.escape')
  closeMenusOnEscape(): void {
    if (this.accountMenuOpen()) {
      this.closeAccountMenu();
      this.accountMenuTrigger?.nativeElement.focus();
    }
    this.closeMobileMenu();
  }
}
