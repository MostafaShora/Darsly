import { Component, computed, signal } from '@angular/core';
import { JOURNEY_STEPS } from '../../data/journey.data';

@Component({
  selector: 'app-teacher-journey',
  standalone: true,
  templateUrl: './teacher-journey.component.html'
})
export class TeacherJourneyComponent {
  readonly steps = JOURNEY_STEPS;
  readonly activeStep = signal(0);
  readonly currentStep = computed(() => this.steps[this.activeStep()]);

  next(): void {
    this.activeStep.update((value) => Math.min(value + 1, this.steps.length - 1));
  }

  previous(): void {
    this.activeStep.update((value) => Math.max(value - 1, 0));
  }

  selectStep(index: number): void {
    this.activeStep.set(index);
  }
}
