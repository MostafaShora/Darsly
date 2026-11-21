import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import {
  LucideActivity,
  LucideBookOpen,
  LucideCalendarClock,
  LucideCalendarDays,
  LucideChartNoAxesCombined,
  LucideClipboardCheck,
  LucideClock3,
  LucideLayoutDashboard,
  LucideLogOut,
  LucideMenu,
  LucideSparkles,
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
      LucideBookOpen,
      LucideCalendarClock,
      LucideCalendarDays,
      LucideChartNoAxesCombined,
      LucideClipboardCheck,
      LucideClock3,
      LucideLayoutDashboard,
      LucideLogOut,
      LucideMenu,
      LucideSparkles,
      LucideUsersRound,
      LucideWallet,
      LucideX,
    ),
  ],
};
