import { Component } from '@angular/core';

@Component({
  selector: 'app-hero',
  standalone: true,
  templateUrl: './hero.component.html'
})
export class HeroComponent {
  scrollToJourney(): void { document.getElementById('journey')?.scrollIntoView({ behavior: 'smooth' }); }
}
