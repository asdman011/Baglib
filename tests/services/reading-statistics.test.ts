import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import {
  SqliteReadingStatisticsRepository,
  MAX_PAGE_SECONDS,
} from '../../src/main/database/repositories/reading-statistics.repository';
import { ReadingTrackerService } from '../../src/main/services/statistics/reading-tracker.service';

describe('Reading Statistics & KOReader Analytics (Task 5.3 / KEY-149)', () => {
  let db: ReturnType<typeof createTestDatabase>;
  let repo: SqliteReadingStatisticsRepository;
  let tracker: ReadingTrackerService;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteReadingStatisticsRepository(db);
    tracker = new ReadingTrackerService(repo);
  });

  describe('SqliteReadingStatisticsRepository', () => {
    it('records page reading events and recomputes book totals', () => {
      repo.recordPageReading({
        bookId: 'book-1',
        title: 'صحيح البخاري',
        authors: 'الإمام البخاري',
        md5: 'md5-bukhari-hash',
        page: 1,
        durationSeconds: 60,
        totalPages: 500,
        subject: 'حديث',
      });

      repo.recordPageReading({
        bookId: 'book-1',
        title: 'صحيح البخاري',
        authors: 'الإمام البخاري',
        md5: 'md5-bukhari-hash',
        page: 2,
        durationSeconds: 90,
        totalPages: 500,
        subject: 'حديث',
      });

      const stats = repo.getBookStats('book-1');
      assert.ok(stats);
      assert.equal(stats.title, 'صحيح البخاري');
      assert.equal(stats.authors, 'الإمام البخاري');
      assert.equal(stats.totalReadTime, 150);
      assert.equal(stats.totalReadPages, 2);
      assert.equal(stats.pages, 500);
      assert.equal(stats.subject, 'حديث');
    });

    it('enforces MAX_PAGE_SECONDS dwell cap (180s) to prevent inflated read times', () => {
      repo.recordPageReading({
        bookId: 'book-2',
        title: 'كتاب سيبويه',
        page: 1,
        durationSeconds: 1200, // 20 minutes idle on desk
        totalPages: 300,
      });

      const stats = repo.getBookStats('book-2');
      assert.ok(stats);
      assert.equal(stats.totalReadTime, MAX_PAGE_SECONDS); // Capped at 180s
    });

    it('calculates median page reading duration accurately', () => {
      // Record 5 page visits: 30s, 45s, 60s, 90s, 120s
      const durations = [30, 45, 60, 90, 120];
      durations.forEach((d, idx) => {
        repo.recordPageReading({
          bookId: 'book-median',
          title: 'الأصمعيات',
          page: idx + 1,
          durationSeconds: d,
          totalPages: 100,
        });
      });

      const median = repo.getMedianPageDurationSecs('book-median');
      assert.equal(median, 60); // middle value of [30, 45, 60, 90, 120]
    });

    it('generates 365-day daily activity heatmap aggregation', () => {
      repo.recordPageReading({
        bookId: 'book-heat',
        title: 'الفهرست لابن النديم',
        page: 1,
        durationSeconds: 40,
        totalPages: 400,
      });

      const heatmap = repo.getDailyHeatmap(365);
      assert.ok(Array.isArray(heatmap));
      assert.ok(heatmap.length >= 1);
      assert.ok(heatmap[0].totalDurationSeconds >= 40);
      assert.ok(heatmap[0].pagesRead >= 1);
      assert.ok(heatmap[0].bookCount >= 1);
    });

    it('calculates reading streak metrics and velocity across subjects', () => {
      repo.recordPageReading({
        bookId: 'book-streak-1',
        title: 'مقدمة ابن خلدون',
        page: 1,
        durationSeconds: 60,
        totalPages: 600,
        subject: 'تاريخ وفلسفة',
      });

      repo.recordPageReading({
        bookId: 'book-streak-2',
        title: 'زاد المعاد',
        page: 1,
        durationSeconds: 120,
        totalPages: 400,
        subject: 'فقه وسيرة',
      });

      const streak = repo.getReadingStreakStats();
      assert.ok(streak);
      assert.equal(streak.totalDaysRead, 1);
      assert.ok(streak.currentStreakDays >= 1);
      assert.equal(streak.totalReadTimeSeconds, 180);
      assert.equal(streak.totalReadPages, 2);
      assert.ok(streak.averagePagesPerHour > 0);
      assert.ok(streak.averageWordsPerMinute > 0);
      assert.equal(streak.subjectBreakdown.length, 2);
    });
  });

  describe('ReadingTrackerService Session Lifecycle', () => {
    it('manages active reading session transitions and idle heartbeats', () => {
      tracker.startSession({
        bookId: 'book-track',
        title: 'الرسالة للشافعي',
        page: 1,
        totalPages: 250,
        subject: 'أصول الفقه',
      });

      tracker.heartbeat();
      tracker.turnPage(2, 250);
      tracker.endSession();

      const stats = tracker.getBookStats('book-track');
      assert.ok(stats);
      assert.equal(stats.title, 'الرسالة للشافعي');
      assert.equal(stats.subject, 'أصول الفقه');
    });
  });
});
