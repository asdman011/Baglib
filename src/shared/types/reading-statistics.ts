/**
 * Baglib — Reading Statistics & KOReader-Compatible Analytics Schema (KEY-149)
 *
 * Implements KOReader statistics.db data model and Readest statisticsDb pattern.
 */

export interface ReadingBookStat {
  bookId: string;
  title: string;
  authors?: string;
  md5?: string;
  totalReadTime: number; // in seconds
  totalReadPages: number;
  lastOpen: number; // Unix timestamp in seconds
  pages: number; // Total pages in book
  medianPageDurationSecs?: number;
  subject?: string; // Academic / Islamic subject categorization
}

export interface ReadingPageStat {
  id?: number;
  bookId: string;
  page: number;
  startTime: number; // Unix timestamp in seconds
  duration: number; // Seconds spent on page (capped at MAX_PAGE_SECONDS)
  totalPages?: number;
}

export interface DailyReadingHeatmapEntry {
  date: string; // YYYY-MM-DD
  totalDurationSeconds: number;
  pagesRead: number;
  bookCount: number;
}

export interface SubjectReadingStat {
  subject: string;
  timeSeconds: number;
  pagesRead: number;
  bookCount: number;
}

export interface ReadingStreakStats {
  currentStreakDays: number;
  longestStreakDays: number;
  totalDaysRead: number;
  totalReadTimeSeconds: number;
  totalReadPages: number;
  averagePagesPerHour: number;
  averageWordsPerMinute: number;
  subjectBreakdown: SubjectReadingStat[];
  lastReadDate?: string;
}

export interface RecordReadingProgressPayload {
  bookId: string;
  title: string;
  authors?: string;
  md5?: string;
  page: number;
  durationSeconds: number;
  totalPages?: number;
  subject?: string;
}
