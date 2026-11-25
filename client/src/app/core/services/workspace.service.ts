import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiListResponse, Workspace } from '../models/workspace.models';

export interface WorkspaceAccessState {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  suspendedWorkspaces: Workspace[];
}

export type WorkspaceAvailability =
  | { kind: 'active'; workspace: Workspace }
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
  private readonly baseUrl = `${environment.apiBaseUrl}/workspaces`;
  private workspaceState: WorkspaceAccessState | null = null;

  getMyWorkspaces(): Observable<Workspace[]> {
    return this.http
      .get<ApiListResponse<Workspace[]>>(this.baseUrl + '/mine', { withCredentials: true })
      .pipe(
        map((response) => response.data),
        tap((workspaces) => {
          this.workspaceState = this.toAccessState(workspaces);
        }),
      );
  }

  getWorkspaceAccessState(): Observable<WorkspaceAccessState> {
    return this.getMyWorkspaces().pipe(map((workspaces) => this.toAccessState(workspaces)));
  }

  getWorkspaceAvailability(refresh = false): Observable<WorkspaceAvailability> {
    const state$ =
      !refresh && this.workspaceState
        ? of(this.workspaceState)
        : this.getWorkspaceAccessState();
    return state$.pipe(
      map((state) => {
        if (state.activeWorkspace) {
          return { kind: 'active', workspace: state.activeWorkspace } as const;
        }
        if (state.suspendedWorkspaces.length) {
          return { kind: 'suspended', workspaces: state.suspendedWorkspaces } as const;
        }
        return { kind: 'unavailable' } as const;
      }),
    );
  }

  getActiveWorkspace(): Observable<Workspace | null> {
    if (this.workspaceState) return of(this.workspaceState.activeWorkspace);
    return this.getWorkspaceAccessState().pipe(map((state) => state.activeWorkspace));
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
            return state;
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

  private toAccessState(workspaces: Workspace[]): WorkspaceAccessState {
    return {
      workspaces,
      activeWorkspace: workspaces.find((workspace) => workspace.status === 'active') ?? null,
      suspendedWorkspaces: workspaces.filter((workspace) => workspace.status === 'suspended'),
    };
  }
}
