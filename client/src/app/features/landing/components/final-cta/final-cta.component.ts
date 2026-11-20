import { Component } from '@angular/core';

@Component({
  selector: 'app-final-cta',
  standalone: true,
  templateUrl: './final-cta.component.html'
})
export class FinalCtaComponent {
  scrollToJourney(): void { document.getElementById('journey')?.scrollIntoView({ behavior: 'smooth' }); }
}
