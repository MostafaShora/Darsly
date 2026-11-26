import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  distinctUntilChanged,
  filter,
  map,
  of,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiListResponse, Workspace } from '../models/workspace.models';
import { AuthService } from './auth.service';

export interface WorkspaceAccessState {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  suspendedWorkspaces: Workspace[];
}

export type WorkspaceAvailability =
  | { kind: 'active'; workspace: Workspace }
  | {
      kind: 'selection-required';
      activeWorkspaces: Workspace[];
      selectedWorkspace: Workspace | null;
    }
  | { kind: 'suspended'; workspaces: Workspace[] }
  | { kind: 'unavailable' };

export interface CreateWorkspaceInput {
  name: string;
  description?: string;
}

export class WorkspaceActivationVerificationError extends Error {}

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly baseUrl = `${environment.apiBaseUrl}/workspaces`;
  private workspaceState: WorkspaceAccessState | null = null;
  private readonly workspaceStateSubject = new BehaviorSubject<WorkspaceAccessState | null>(null);
  private readonly workspaceAccessStateSignal = signal<WorkspaceAccessState | null>(null);
  private readonly selectedWorkspaceIdSignal = signal<string | null>(null);
  private readonly selectionPersistenceErrorSignal = signal('');
  private selectedWorkspaceIdValue: string | null = null;
  private selectionIsExplicit = false;
  private selectionUserId: string | null = null;
  private readonly selectionStorageKeyPrefix = 'darsly.active-workspace.';

  readonly workspaceAccessState = this.workspaceAccessStateSignal.asReadonly();
  readonly selectedWorkspaceId = this.selectedWorkspaceIdSignal.asReadonly();
  readonly selectionPersistenceError = this.selectionPersistenceErrorSignal.asReadonly();

  getMyWorkspaces(): Observable<Workspace[]> {
    return this.http
      .get<ApiListResponse<Workspace[]>>(this.baseUrl + '/mine', { withCredentials: true })
      .pipe(
        map((response) => response.data),
        tap((workspaces) => this.updateWorkspaceState(workspaces)),
      );
  }

  getWorkspaceAccessState(): Observable<WorkspaceAccessState> {
    return this.getMyWorkspaces().pipe(map(() => this.workspaceState!));
  }

  getWorkspaceAvailability(refresh = false): Observable<WorkspaceAvailability> {
    const state$ =
      !refresh && this.workspaceState
        ? of(this.workspaceState)
        : this.getWorkspaceAccessState();
    return state$.pipe(map((state) => this.toAvailability(state)));
  }

  watchWorkspaceAvailability(refresh = false): Observable<WorkspaceAvailability> {
    const state$ =
      !refresh && this.workspaceState
        ? of(this.workspaceState)
        : this.getWorkspaceAccessState();
    return state$.pipe(
      switchMap(() =>
        this.workspaceStateSubject.pipe(
          filter((state): state is WorkspaceAccessState => state !== null),
          map((state) => this.toAvailability(state)),
          distinctUntilChanged((previous, current) =>
            previous.kind === current.kind &&
            (previous.kind !== 'active' ||
              (current.kind === 'active' &&
                previous.workspace._id === current.workspace._id)) &&
            (previous.kind !== 'selection-required' ||
              (current.kind === 'selection-required' &&
                previous.selectedWorkspace?._id === current.selectedWorkspace?._id &&
                previous.selectedWorkspace?.status === current.selectedWorkspace?.status &&
                previous.activeWorkspaces.map((workspace) => workspace._id).join(',') ===
                  current.activeWorkspaces.map((workspace) => workspace._id).join(','))) &&
            (previous.kind !== 'suspended' ||
              (current.kind === 'suspended' &&
                previous.workspaces.map((workspace) => workspace._id).join(',') ===
                  current.workspaces.map((workspace) => workspace._id).join(','))),
          ),
        ),
      ),
    );
  }

  getActiveWorkspace(): Observable<Workspace | null> {
    const state$ = this.workspaceState ? of(this.workspaceState) : this.getWorkspaceAccessState();
    return state$.pipe(map((state) => state.activeWorkspace));
  }

  watchActiveWorkspace(): Observable<Workspace | null> {
    const state$ = this.workspaceState ? of(this.workspaceState) : this.getWorkspaceAccessState();
    return state$.pipe(
      switchMap(() =>
        this.workspaceStateSubject.pipe(
          filter((state): state is WorkspaceAccessState => state !== null),
          map((state) => state.activeWorkspace),
          distinctUntilChanged((previous, current) => previous?._id === current?._id),
        ),
      ),
    );
  }

  selectWorkspace(workspaceId: string): boolean {
    const state = this.workspaceState;
    const userId = this.authService.currentUser()?.id;
    if (!state || !userId || this.selectionUserId !== userId) {
      return false;
    }

    const workspace = state.workspaces.find(
      (item) => item._id === workspaceId && item.status === 'active',
    );
    if (!workspace) return false;

    this.selectedWorkspaceIdValue = workspace._id;
    this.selectionIsExplicit = true;
    this.updateWorkspaceState(state.workspaces);
    this.persistSelection(userId, workspace._id);
    return true;
  }

  activateWorkspace(workspaceId: string): Observable<Workspace> {
    return this.http
      .patch<ApiListResponse<Workspace>>(
        `${this.baseUrl}/${encodeURIComponent(workspaceId)}/activate`,
        null,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data));
  }

  activateWorkspaceAndRefresh(workspaceId: string): Observable<WorkspaceAccessState> {
    return this.activateWorkspace(workspaceId).pipe(
      switchMap((activated) => {
        if (activated._id !== workspaceId || activated.status !== 'active') {
          return throwError(() => new WorkspaceActivationVerificationError());
        }
        return this.getWorkspaceAccessState().pipe(
          map((state) => {
            const refreshed = state.workspaces.find((workspace) => workspace._id === workspaceId);
            if (!refreshed || refreshed.status !== 'active') {
              throw new WorkspaceActivationVerificationError();
            }
            if (!this.selectWorkspace(workspaceId)) {
              throw new WorkspaceActivationVerificationError();
            }
            return this.workspaceState ?? state;
          }),
        );
      }),
    );
  }

  createWorkspace(input: CreateWorkspaceInput): Observable<Workspace> {
    return this.http
      .post<ApiListResponse<Workspace>>(this.baseUrl, input, { withCredentials: true })
      .pipe(map((response) => response.data));
  }

  getWorkspace(workspaceId: string): Observable<Workspace> {
    return this.http
      .get<ApiListResponse<Workspace>>(`${this.baseUrl}/${encodeURIComponent(workspaceId)}`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data));
  }

  private updateWorkspaceState(workspaces: Workspace[]): void {
    const userId = this.authService.currentUser()?.id ?? null;
    if (this.selectionUserId !== userId) {
      this.selectedWorkspaceIdValue = null;
      this.selectionIsExplicit = false;
      this.selectionUserId = userId;
      this.selectionPersistenceErrorSignal.set('');

      if (userId) {
        const storedWorkspaceId = this.readStoredSelection(userId);
        const storedWorkspace = workspaces.find(
          (workspace) =>
            workspace._id === storedWorkspaceId && workspace.status === 'active',
        );
        if (storedWorkspace) {
          this.selectedWorkspaceIdValue = storedWorkspace._id;
          this.selectionIsExplicit = true;
        } else if (storedWorkspaceId) {
          this.removeStoredSelection(userId);
        }
      }
    }

    if (!this.selectionIsExplicit) {
      this.selectedWorkspaceIdValue =
        workspaces.find((workspace) => workspace.status === 'active')?._id ?? null;
    }

    const state: WorkspaceAccessState = {
      workspaces,
      activeWorkspace:
        workspaces.find(
          (workspace) =>
            workspace._id === this.selectedWorkspaceIdValue && workspace.status === 'active',
        ) ?? null,
      suspendedWorkspaces: workspaces.filter((workspace) => workspace.status === 'suspended'),
    };
    this.workspaceState = state;
    this.workspaceAccessStateSignal.set(state);
    this.selectedWorkspaceIdSignal.set(this.selectedWorkspaceIdValue);
    this.workspaceStateSubject.next(state);
  }

  private readStoredSelection(userId: string): string | null {
    try {
      const storage = globalThis.localStorage;
      if (!storage) {
        this.selectionPersistenceErrorSignal.set(
          'تعذر قراءة مساحة العمل المحفوظة. سيتم استخدام مساحة العمل النشطة الافتراضية.',
        );
        return null;
      }
      const selectedWorkspaceId = storage.getItem(this.selectionStorageKey(userId));
      this.selectionPersistenceErrorSignal.set('');
      return selectedWorkspaceId;
    } catch {
      this.selectionPersistenceErrorSignal.set(
        'تعذر قراءة مساحة العمل المحفوظة. سيتم استخدام مساحة العمل النشطة الافتراضية.',
      );
      return null;
    }
  }

  private persistSelection(userId: string, workspaceId: string): void {
    try {
      const storage = globalThis.localStorage;
      if (!storage) {
        this.selectionPersistenceErrorSignal.set(
          'تعذر حفظ اختيار مساحة العمل على هذا الجهاز. سيبقى الاختيار الحالي حتى إعادة تحميل الصفحة.',
        );
        return;
      }
      storage.setItem(this.selectionStorageKey(userId), workspaceId);
      this.selectionPersistenceErrorSignal.set('');
    } catch {
      this.selectionPersistenceErrorSignal.set(
        'تعذر حفظ اختيار مساحة العمل على هذا الجهاز. سيبقى الاختيار الحالي حتى إعادة تحميل الصفحة.',
      );
    }
  }

  private removeStoredSelection(userId: string): void {
    try {
      const storage = globalThis.localStorage;
      if (!storage) {
        this.selectionPersistenceErrorSignal.set(
          'تعذر إزالة اختيار مساحة العمل غير الصالح من هذا الجهاز.',
        );
        return;
      }
      storage.removeItem(this.selectionStorageKey(userId));
      this.selectionPersistenceErrorSignal.set('');
    } catch {
      this.selectionPersistenceErrorSignal.set(
        'تعذر إزالة اختيار مساحة العمل غير الصالح من هذا الجهاز.',
      );
    }
  }

  private selectionStorageKey(userId: string): string {
    return `${this.selectionStorageKeyPrefix}${encodeURIComponent(userId)}`;
  }

  private toAvailability(state: WorkspaceAccessState): WorkspaceAvailability {
    if (state.activeWorkspace) {
      return { kind: 'active', workspace: state.activeWorkspace };
    }

    const activeWorkspaces = state.workspaces.filter(
      (workspace) => workspace.status === 'active',
    );
    if (activeWorkspaces.length) {
      return {
        kind: 'selection-required',
        activeWorkspaces,
        selectedWorkspace:
          state.workspaces.find((workspace) => workspace._id === this.selectedWorkspaceIdValue) ??
          null,
      };
    }
    if (state.suspendedWorkspaces.length) {
      return { kind: 'suspended', workspaces: state.suspendedWorkspaces };
    }
    return { kind: 'unavailable' };
  }
}
