export type JourneyIcon =
  | 'layout-dashboard'
  | 'users-round'
  | 'calendar-days'
  | 'clipboard-check'
  | 'wallet'
  | 'chart-no-axes-combined';

export interface JourneyStep {
  eyebrow: string;
  title: string;
  description: string;
  bullets: readonly string[];
  metric: string;
  metricLabel: string;
  icon: JourneyIcon;
  image: string;
  imageAlt: string;
  visualTitle: string;
}
