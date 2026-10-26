export interface KhatmahConfig {
  title: string;
  script: string;
  layout: string;
  startDate: string;
  mode: 'duration' | 'date' | 'pages' | 'juz';
  durationDays: number;
  targetDate: string;
  pagesPerSession: number;
  sessionsPerDay: number;
  juzPerDay: number;
  automatic: boolean;
  reminder: { enabled: boolean; time: string; language: 'ar' | 'en' };
}

export interface KhatmahBinding {
  script: string;
  layout: string;
  profile: 'hafs' | 'warsh';
  adapted: boolean;
  totalPages: number;
  juzPages: number[];
  juzEndPages: number[];
}

export interface KhatmahPlan extends KhatmahConfig {
  id: string;
  binding: KhatmahBinding;
  paused: boolean;
  reads: { page: number; date: string }[];
  remindedOn?: string;
}

export interface KhatmahState { plans: KhatmahPlan[]; notificationsSupported: boolean; }
export type KhatmahMutation =
  | { action: 'create'; config: KhatmahConfig }
  | { action: 'edit'; id: string; config: KhatmahConfig }
  | { action: 'pause'; id: string; paused: boolean }
  | { action: 'delete'; id: string }
  | { action: 'mark'; id: string; pages: number[]; read: boolean; script: string; layout: string };

export interface KhatmahStats {
  completed: number;
  percent: number;
  streak: number;
  todayPages: number[];
  readToday: number;
  targetDate: string;
  forecastDate: string;
  schedule: 'ahead' | 'on-track' | 'behind';
  daysRemaining: number;
  future: boolean;
}
