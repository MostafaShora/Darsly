import { Component, computed, inject } from '@angular/core';
import { WorkspaceService } from '../../core/services/workspace.service';

@Component({
  selector: 'app-workspace-selector',
  standalone: true,
  templateUrl: './workspace-selector.component.html',
})
export class WorkspaceSelectorComponent {
  private readonly workspaceService = inject(WorkspaceService);

  readonly state = computed(() => this.workspaceService.workspaceAccessState?.() ?? null);
  readonly selectionPersistenceError = computed(
    () => this.workspaceService.selectionPersistenceError?.() ?? '',
  );
  readonly selectedWorkspaceId = computed(
    () => this.workspaceService.selectedWorkspaceId?.() ?? null,
  );
  readonly activeWorkspaces = computed(
    () => this.state()?.workspaces.filter((workspace) => workspace.status === 'active') ?? [],
  );
  readonly selectedWorkspace = computed(
    () =>
      this.state()?.workspaces.find(
        (workspace) => workspace._id === this.selectedWorkspaceId(),
      ) ?? null,
  );
  readonly simpleMode = computed(
    () =>
      this.state()?.workspaces.length === 1 &&
      this.activeWorkspaces().length === 1 &&
      this.state()?.activeWorkspace?._id === this.activeWorkspaces()[0]._id,
  );

  selectWorkspace(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (!this.workspaceService.selectWorkspace?.(select.value)) {
      select.value = this.selectedWorkspaceId() ?? '';
    }
  }
}
