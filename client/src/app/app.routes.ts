import { Routes } from '@angular/router';
import { SignInComponent } from './features/auth/pages/sign-in/sign-in.component';
import { SignUpComponent } from './features/auth/pages/sign-up/sign-up.component';
import { LANDING_ROUTES } from './features/landing/landing.routes';

export const routes: Routes = [
  ...LANDING_ROUTES,
  { path: 'sign-in', component: SignInComponent },
  { path: 'sign-up', component: SignUpComponent },
];
