import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiListResponse, Workspace } from '../models/workspace.models';

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/workspaces`;

  getMyWorkspaces(): Observable<Workspace[]> {
    return this.http
      .get<ApiListResponse<Workspace[]>>(this.baseUrl + '/mine', { withCredentials: true })
      .pipe(map((response) => response.data));
  }
}
