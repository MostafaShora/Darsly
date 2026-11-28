import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  LucideBookOpen,
  LucideLayoutDashboard,
  LucideLogOut,
  provideLucideIcons,
} from '@lucide/angular';
import { signal } from '@angular/core';
import { of, tap } from 'rxjs';
import { vi } from 'vitest';
import { Router } from '@angular/router';
import { AuthUser } from '../../../../core/models/auth.models';
import { ActiveStudentContext } from '../../../../core/models/student-context.models';
import { Workspace } from '../../../../core/models/workspace.models';
import { AuthService } from '../../../../core/services/auth.service';
import { StudentContextService } from '../../../../core/services/student-context.service';
import {
  WorkspaceAccessState,
  WorkspaceService,
} from '../../../../core/services/workspace.service';
import { NavbarComponent } from './navbar.component';

describe('NavbarComponent account dropdown', () => {
  let fixture: ComponentFixture<NavbarComponent>;
  let currentUser: ReturnType<typeof signal<AuthUser | null>>;
  let workspaceAccessState: ReturnType<typeof signal<WorkspaceAccessState | null>>;
  let userResponse: AuthUser;
  let workspaces: Workspace[];
  let contexts: ActiveStudentContext[];
  let authService: {
    currentUser: ReturnType<typeof signal<AuthUser | null>>;
    getAccountStatus: ReturnType<typeof vi.fn>;
    clearCurrentUser: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let workspaceService: {
    workspaceAccessState: ReturnType<typeof signal<WorkspaceAccessState | null>>;
    getMyWorkspaces: ReturnType<typeof vi.fn>;
  };
  let studentContextService: { getActiveContexts: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    currentUser = signal<AuthUser | null>(null);
    workspaceAccessState = signal(null);
    userResponse = {
      id: 'user-1',
      name: 'Student Teacher',
      email: 'account@example.test',
      status: 'active',
      lastLoginAt: null,
      capabilities: { teacher: true, student: false, owner: false },
    };
    workspaces = [
      {
        _id: 'workspace-1',
        name: 'Teacher Workspace',
        slug: 'teacher-workspace',
        status: 'active',
        currency: 'EGP',
        description: '',
      },
    ];
    contexts = [
      {
        studentAccountLinkId: 'link-1',
        studentName: 'Student Profile',
        workspaceName: 'Student Workspace',
      },
    ];
    authService = {
      currentUser,
      getAccountStatus: vi.fn(() =>
        of({ message: 'Authenticated user', user: userResponse }).pipe(
          tap(({ user }) => currentUser.set(user)),
        ),
      ),
      clearCurrentUser: vi.fn(() => currentUser.set(null)),
      logout: vi.fn(() => of({ message: 'logged out' })),
    };
    workspaceService = {
      workspaceAccessState,
      getMyWorkspaces: vi.fn(() =>
        of(workspaces).pipe(
          tap((loadedWorkspaces) => {
            const activeWorkspace = loadedWorkspaces.find(
              (workspace) => workspace.status === 'active',
            ) ?? null;
            workspaceAccessState.set({
              workspaces: loadedWorkspaces,
              activeWorkspace,
              suspendedWorkspaces: loadedWorkspaces.filter(
                (workspace) => workspace.status === 'suspended',
              ),
            });
          }),
        ),
      ),
    };
    studentContextService = {
      getActiveContexts: vi.fn(() => of(contexts)),
    };

    await TestBed.configureTestingModule({
      imports: [NavbarComponent],
      providers: [
        provideRouter([]),
        provideLucideIcons(
          LucideBookOpen,
          LucideLayoutDashboard,
          LucideLogOut,
        ),
        { provide: AuthService, useValue: authService },
        { provide: WorkspaceService, useValue: workspaceService },
        { provide: StudentContextService, useValue: studentContextService },
      ],
    }).compileComponents();
  });

  const render = (): void => {
    fixture = TestBed.createComponent(NavbarComponent);
    fixture.detectChanges();
  };

  const openAccountMenu = (): HTMLElement => {
    const trigger = fixture.nativeElement.querySelector(
      'button[aria-controls="darsly-account-menu"]',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    return trigger;
  };

  it('shows the teacher area only for a Teacher account with an active Workspace', () => {
    userResponse = {
      ...userResponse,
      capabilities: { teacher: true, student: false, owner: true },
    };
    render();
    openAccountMenu();

    const menu: HTMLElement = fixture.nativeElement.querySelector('#darsly-account-menu');
    expect(menu.textContent).toContain('معلم');
    expect(menu.textContent).toContain('مالك مساحة عمل');
    expect(menu.querySelector('a[href="/dashboard"]')).not.toBeNull();
    expect(menu.querySelector('a[href="/student/overview"]')).toBeNull();
    expect(studentContextService.getActiveContexts).not.toHaveBeenCalled();
  });

  it('shows compact account identity and the selected workspace in the dropdown', () => {
    render();
    const trigger = openAccountMenu();
    const menu: HTMLElement = fixture.nativeElement.querySelector('#darsly-account-menu');

    expect(trigger.textContent).toContain('ST');
    expect(menu.textContent).toContain('account@example.test');
    expect(menu.textContent).toContain('Teacher Workspace');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('shows the Student Portal only when the backend returns an active Student context', () => {
    userResponse = {
      ...userResponse,
      capabilities: { teacher: false, student: true, owner: false },
    };
    render();
    openAccountMenu();

    const menu: HTMLElement = fixture.nativeElement.querySelector('#darsly-account-menu');
    expect(menu.textContent).toContain('طالب');
    expect(menu.querySelector('a[href="/student/overview"]')).not.toBeNull();
    expect(menu.querySelector('a[href="/dashboard"]')).toBeNull();
    expect(workspaceService.getMyWorkspaces).not.toHaveBeenCalled();
  });

  it('shows both authorized areas for a combined account without merging their context services', () => {
    userResponse = {
      ...userResponse,
      capabilities: { teacher: true, student: true, owner: false },
    };
    render();
    openAccountMenu();

    const menu: HTMLElement = fixture.nativeElement.querySelector('#darsly-account-menu');
    expect(menu.querySelector('a[href="/dashboard"]')).not.toBeNull();
    expect(menu.querySelector('a[href="/student/overview"]')).not.toBeNull();
    expect(workspaceService.getMyWorkspaces).toHaveBeenCalledOnce();
    expect(studentContextService.getActiveContexts).toHaveBeenCalledOnce();
  });

  it('does not show an area link when its backend context is empty', () => {
    userResponse = {
      ...userResponse,
      capabilities: { teacher: true, student: true, owner: false },
    };
    workspaces = [];
    contexts = [];
    render();
    openAccountMenu();

    const menu: HTMLElement = fixture.nativeElement.querySelector('#darsly-account-menu');
    expect(menu.querySelector('a[href="/dashboard"]')).toBeNull();
    expect(menu.querySelector('a[href="/student/overview"]')).toBeNull();
    expect(menu.textContent).toContain('لا توجد مساحة عمل نشطة');
    expect(menu.textContent).toContain('لا يوجد ملف طالب نشط');
  });

  it('closes the account dropdown on Escape and restores focus to its trigger', async () => {
    render();
    const trigger = openAccountMenu();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 180));

    expect(fixture.nativeElement.querySelector('#darsly-account-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes the account dropdown when clicking outside', async () => {
    render();
    openAccountMenu();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 180));

    expect(fixture.nativeElement.querySelector('#darsly-account-menu')).toBeNull();
  });

  it('logs out and navigates to sign-in', () => {
    render();
    openAccountMenu();
    const navigation = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);

    const logoutButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      '#darsly-account-menu button:not([disabled])',
    );
    logoutButton.click();
    fixture.detectChanges();

    expect(authService.logout).toHaveBeenCalledOnce();
    expect(navigation).toHaveBeenCalledWith('/sign-in');
  });
});
