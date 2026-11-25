import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiListResponse, Workspace } from '../models/workspace.models';

export interface WorkspaceAccessState {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  suspendedWorkspaces: Workspace[];
}

export interface CreateWorkspaceInput {
  name: string;
  description?: string;
}

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

  getActiveWorkspace(): Observable<Workspace | null> {
    if (this.workspaceState) return of(this.workspaceState.activeWorkspace);
    return this.getWorkspaceAccessState().pipe(map((state) => state.activeWorkspace));
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
