import { Component, computed, inject, ViewChild } from '@angular/core';
import { WorkspaceService } from '../../core/services/workspace.service';
import {
  CustomSelectComponent,
  CustomSelectOption,
} from '../../shared/components/custom-select/custom-select.component';

@Component({
  selector: 'app-workspace-selector',
  standalone: true,
  imports: [CustomSelectComponent],
  templateUrl: './workspace-selector.component.html',
})
export class WorkspaceSelectorComponent {
  private readonly workspaceService = inject(WorkspaceService);

  @ViewChild(CustomSelectComponent) private workspaceSelect?: CustomSelectComponent;

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
  readonly workspaceSelectOptions = computed<CustomSelectOption[]>(
    () =>
      this.state()?.workspaces.map((workspace) => ({
        value: workspace._id,
        label: `${workspace.name} — ${workspace.status === 'active' ? 'نشطة' : 'معلّقة'}`,
        disabled: workspace.status !== 'active',
      })) ?? [],
  );

  selectWorkspace(workspaceId: string): void {
    if (!this.workspaceService.selectWorkspace?.(workspaceId)) {
      this.workspaceSelect?.writeValue(this.selectedWorkspaceId() ?? '');
    }
  }
}
