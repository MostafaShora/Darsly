import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import {
  LucideActivity,
  LucideArrowLeft,
  LucideArrowUp,
  LucideBookOpen,
  LucideCalendarClock,
  LucideCalendarDays,
  LucideChartNoAxesCombined,
  LucideCheck,
  LucideClipboardCheck,
  LucideClock3,
  LucideEye,
  LucideEyeOff,
  LucideLayoutDashboard,
  LucideLogOut,
  LucideMenu,
  LucideMouse,
  LucideSparkles,
  LucideSun,
  LucideUsersRound,
  LucideWallet,
  LucideX,
  provideLucideIcons,
} from '@lucide/angular';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideLucideIcons(
      LucideActivity,
      LucideArrowLeft,
      LucideArrowUp,
      LucideBookOpen,
      LucideCalendarClock,
      LucideCalendarDays,
      LucideChartNoAxesCombined,
      LucideCheck,
      LucideClipboardCheck,
      LucideClock3,
      LucideEye,
      LucideEyeOff,
      LucideLayoutDashboard,
      LucideLogOut,
      LucideMenu,
      LucideMouse,
      LucideSparkles,
      LucideSun,
      LucideUsersRound,
      LucideWallet,
      LucideX,
    ),
  ],
};
