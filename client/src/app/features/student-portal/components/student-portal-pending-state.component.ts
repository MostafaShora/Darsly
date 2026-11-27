import { Component, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';

@Component({
  selector: 'app-student-portal-pending-state',
  standalone: true,
  imports: [LucideDynamicIcon],
  template: `
    <section
      class="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-[#dce8df] bg-white px-5 py-8 text-center"
      aria-live="polite"
    >
      <span
        class="grid size-12 place-items-center rounded-2xl border border-[#dceee2] bg-[#f1f8f3] text-[#087b59]"
        aria-hidden="true"
      >
        <svg [lucideIcon]="icon()" [size]="21"></svg>
      </span>
      <h3 class="mt-4 text-sm font-extrabold text-[#29483d]">{{ heading() }}</h3>
      <p class="mt-2 max-w-lg text-xs leading-7 text-[#687d72] sm:text-sm">
        {{ description() }}
      </p>
    </section>
  `,
})
export class StudentPortalPendingStateComponent {
  readonly icon = input.required<string>();
  readonly heading = input.required<string>();
  readonly description = input.required<string>();
}
