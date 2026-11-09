import type { StudyTask } from './study-planner';

export interface StudyPreferences { dailyMinutes: number; dailyPages: number; taskOrder: string[] }

export function orderStudyTasks(tasks: StudyTask[], order: string[]): StudyTask[] {
  return [...tasks].sort((first, second) => {
    const firstRank = order.indexOf(first.id);
    const secondRank = order.indexOf(second.id);
    if (firstRank >= 0 || secondRank >= 0) return (firstRank < 0 ? Infinity : firstRank) - (secondRank < 0 ? Infinity : secondRank);
    const firstQuran = first.references.some(reference => reference.target.startsWith('quran:'));
    const secondQuran = second.references.some(reference => reference.target.startsWith('quran:'));
    return Number(secondQuran) - Number(firstQuran) || second.priority - first.priority || first.sortOrder - second.sortOrder || first.id.localeCompare(second.id);
  });
}
export interface StudyInsights {
  timeSource: 'sessions' | 'dwell' | 'none';
  seconds: number;
  pages: number;
  sessionCount: number | null;
  secondsPerPage: number | null;
  secondsPerSession: number | null;
  subjects: { ar: string | null; en: string | null; seconds: number }[];
  days: { date: string; seconds: number; pages: number }[];
  knowledge: number;
  ideas: number;
  completedTasks: number;
  totalTasks: number;
  reflections: { id: string; title: string; content: string }[];
  edits: { id: string; kind: string; updatedAt: string }[];
  partial: boolean;
}
export interface WordFrequency { words: { word: string; count: number }[]; partial: boolean; indexedPages: number }
export interface StudyInsightsAPI {
  setPaused(paused: boolean): Promise<void>;
  summary(): Promise<StudyInsights>;
  preferences(): Promise<StudyPreferences>;
  savePreferences(input: StudyPreferences): Promise<StudyPreferences>;
  words(bookId?: string): Promise<WordFrequency>;
  rhythmDailyActivity?(days?: number): Promise<import('./study-rhythm').DayActivityRecord[]>;
  progressTargets?(): Promise<import('./study-progress').ProgressTargetItem[]>;
  progressSummary?(targetKind: 'pathway' | 'book', targetId: string): Promise<import('./study-progress').TargetProgressSummary | null>;
}

export function validateStudyPreferences(raw: unknown): StudyPreferences {
  if (!raw || typeof raw !== 'object') throw new Error('invalid-request');
  const value = raw as Record<string, unknown>;
  if (!Number.isInteger(value.dailyMinutes) || Number(value.dailyMinutes) < 0 || Number(value.dailyMinutes) > 1440 || !Number.isInteger(value.dailyPages) || Number(value.dailyPages) < 0 || Number(value.dailyPages) > 10000 || !Array.isArray(value.taskOrder) || value.taskOrder.length > 5000 || value.taskOrder.some(id => typeof id !== 'string' || !id || id.length > 100)) throw new Error('invalid-request');
  return { dailyMinutes: Number(value.dailyMinutes), dailyPages: Number(value.dailyPages), taskOrder: [...new Set(value.taskOrder as string[])] };
}
