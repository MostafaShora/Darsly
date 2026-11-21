import { Component } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [LucideDynamicIcon],
  templateUrl: './hero.component.html',
})
export class HeroComponent {
  scrollToJourney(): void {
    document.getElementById('journey')?.scrollIntoView({ behavior: 'smooth' });
  }
}
