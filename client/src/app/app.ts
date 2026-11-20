import { Component } from '@angular/core';
import { NavbarComponent } from './features/landing/components/navbar/navbar.component';
import { HeroComponent } from './features/landing/components/hero/hero.component';
import { FeaturesComponent } from './features/landing/components/features/features.component';
import { TeacherJourneyComponent } from './features/landing/components/teacher-journey/teacher-journey.component';
import { BeforeAfterComponent } from './features/landing/components/before-after/before-after.component';
import { DailyWorkflowComponent } from './features/landing/components/daily-workflow/daily-workflow.component';
import { AudienceComponent } from './features/landing/components/audience/audience.component';
import { FinalCtaComponent } from './features/landing/components/final-cta/final-cta.component';
import { FooterComponent } from './features/landing/components/footer/footer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    NavbarComponent,
    HeroComponent,
    FeaturesComponent,
    TeacherJourneyComponent,
    BeforeAfterComponent,
    DailyWorkflowComponent,
    AudienceComponent,
    FinalCtaComponent,
    FooterComponent
  ],
  templateUrl: './app.html'
})
export class AppComponent {}
