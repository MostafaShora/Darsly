import { Component } from '@angular/core';
import { NavbarComponent } from './components/navbar/navbar.component';
import { HeroComponent } from './components/hero/hero.component';
import { FeaturesComponent } from './components/features/features.component';
import { TeacherJourneyComponent } from './components/teacher-journey/teacher-journey.component';
import { BeforeAfterComponent } from './components/before-after/before-after.component';
import { DailyWorkflowComponent } from './components/daily-workflow/daily-workflow.component';
import { AudienceComponent } from './components/audience/audience.component';
import { FinalCtaComponent } from './components/final-cta/final-cta.component';
import { FooterComponent } from './components/footer/footer.component';

@Component({
  selector: 'app-landing',
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
    FooterComponent,
  ],
  templateUrl: './landing.component.html',
})
export class LandingComponent {}
