import { Component } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';

@Component({
  selector: 'app-final-cta',
  standalone: true,
  imports: [LucideDynamicIcon],
  templateUrl: './final-cta.component.html',
})
export class FinalCtaComponent {
  scrollToJourney(): void {
    document.getElementById('journey')?.scrollIntoView({ behavior: 'smooth' });
  }
}
