import taskListsMigration from '../../src/main/database/migrations/027_task_lists';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  DEFAULT_QURAN_WIRD_CONFIG,
  validateQuranWirdConfig,
  getSurahAyahCount,
  calculateAyahPortion,
  calculateJuzPortion,
  calculatePagePortion,
  calculateMurajaaPortion,
  calculateCatchUpSuggestion,
  isWirdActiveDay,
  type QuranWirdConfig,
  type MushafPageSummary,
} from '../../src/shared/quran-wird';
import { QuranWirdService } from '../../src/main/services/quran-wird.service';
import { StudyPlannerRepository } from '../../src/main/database/repositories/study-planner.repository';
import type { ISettingsRepository } from '../../src/main/database/repositories/settings.repository';

// In-memory mock settings repo
class MockSettingsRepository implements ISettingsRepository {
  private store = new Map<string, unknown>();

  get<T = unknown>(key: string, defaultValue?: T): T | undefined {
    return (this.store.get(key) as T) ?? defaultValue;
  }

  set<T = unknown>(key: string, value: T): void {
    this.store.set(key, value);
  }

  getAll(): Record<string, unknown> {
    return Object.fromEntries(this.store.entries());
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }
}

// In-memory SQLite for study_planner
function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE study_task (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL CHECK(length(trim(title)) > 0),
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','cancelled')),
      start_date TEXT,
      due_date TEXT,
      priority INTEGER NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 3),
      sort_order INTEGER NOT NULL DEFAULT 0,
      references_json TEXT NOT NULL DEFAULT '[]',
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK(start_date IS NULL OR due_date IS NULL OR start_date <= due_date)
    );
  `);
  taskListsMigration.up(db);
  return db;
}

// Mock layout data with 604 pages
function createMockLayoutPages(): MushafPageSummary[] {
  const pages: MushafPageSummary[] = [];
  for (let p = 1; p <= 604; p++) {
    pages.push({
      pageNumber: p,
      surahStart: p === 1 ? 1 : 2,
      ayahStart: p === 1 ? 1 : (p - 1) * 5,
      surahEnd: p === 1 ? 1 : 2,
      ayahEnd: p === 1 ? 7 : p * 5,
    });
  }
  return pages;
}

describe('KEY-286: Quran Wird and Muraja\'a Cycle', () => {
  describe('Config validation and defaults', () => {
    it('provides sound default config', () => {
      const cfg = validateQuranWirdConfig(undefined);
      assert.equal(cfg.profile, 'hafs');
      assert.equal(cfg.unit, 'pages');
      assert.equal(cfg.dailyAmount, 2);
      assert.deepEqual(cfg.activeWeekdays, [0, 1, 2, 3, 4, 6]);
      assert.equal(cfg.murajaa.enabled, false);
      assert.equal(cfg.catchUpAccumulated, 0);
    });

    it('bounds invalid and out-of-range inputs', () => {
      const cfg = validateQuranWirdConfig({
        profile: 'invalid',
        unit: 'unknown',
        dailyAmount: -5,
        startPosition: { surah: 999, ayah: 999 },
        murajaa: { enabled: true, amount: -1, currentJuz: 50 },
        activeWeekdays: [-1, 7, 0, 0, 2],
      });
      assert.equal(cfg.profile, 'hafs');
      assert.equal(cfg.unit, 'pages');
      assert.equal(cfg.dailyAmount, 1);
      assert.equal(cfg.startPosition.surah, 1);
      assert.equal(cfg.startPosition.ayah, 1);
      assert.equal(cfg.murajaa.amount, 1);
      assert.equal(cfg.murajaa.currentJuz, 1);
      assert.deepEqual(cfg.activeWeekdays, [0, 2]);
    });
  });

  describe('Portion calculations by unit and profile', () => {
    it('calculates Ayah portion for Hafs with cross-surah transition', () => {
      // Surah 1 has 7 ayahs in Hafs. Advancing 10 ayahs from 1:1 lands at 2:3.
      const portion = calculateAyahPortion({ surah: 1, ayah: 1 }, 10, 'hafs');
      assert.equal(portion.unit, 'ayahs');
      assert.equal(portion.unitsCount, 10);
      assert.equal(portion.ranges.length, 2);
      assert.deepEqual(portion.ranges[0], { surah: 1, from: 1, to: 7 });
      assert.deepEqual(portion.ranges[1], { surah: 2, from: 1, to: 3 });
      assert.equal(portion.primaryTarget, 'quran:hafs:1:1-7');
      assert.equal(portion.nextPosition.surah, 2);
      assert.equal(portion.nextPosition.ayah, 4);
    });

    it('calculates Ayah portion for Warsh using Warsh verse counts', () => {
      // Warsh Surah 2 has 285 ayahs (Hafs has 286).
      assert.equal(getSurahAyahCount(2, 'warsh'), 285);
      assert.equal(getSurahAyahCount(2, 'hafs'), 286);

      // Starting at Surah 2 Ayah 280 in Warsh for 8 ayahs:
      // Surah 2 takes 280..285 (6 ayahs), remainder 2 ayahs go to Surah 3: 1..2.
      const portion = calculateAyahPortion({ surah: 2, ayah: 280 }, 8, 'warsh');
      assert.equal(portion.profile, 'warsh');
      assert.equal(portion.ranges.length, 2);
      assert.deepEqual(portion.ranges[0], { surah: 2, from: 280, to: 285 });
      assert.deepEqual(portion.ranges[1], { surah: 3, from: 1, to: 2 });
      assert.equal(portion.primaryTarget, 'quran:warsh:2:280-285');
      assert.equal(portion.nextPosition.surah, 3);
      assert.equal(portion.nextPosition.ayah, 3);
    });

    it('calculates Juz portion with correct boundaries and wrap-around', () => {
      const p1 = calculateJuzPortion(1, 1, 'hafs');
      assert.equal(p1.unit, 'juz');
      assert.equal(p1.start.juz, 1);
      assert.equal(p1.end.juz, 1);
      assert.equal(p1.nextPosition.juz, 2);
      assert.equal(p1.primaryTarget, 'quran:hafs:1:1');

      // Juz 30 wraps around to Juz 1
      const p30 = calculateJuzPortion(30, 1, 'hafs');
      assert.equal(p30.start.juz, 30);
      assert.equal(p30.end.juz, 30);
      assert.equal(p30.nextPosition.juz, 1);
    });

    it('calculates Page portion when layout is present', () => {
      const layout = createMockLayoutPages();
      const p = calculatePagePortion(1, 2, layout, 'hafs');
      assert.equal(p.unit, 'pages');
      assert.equal(p.unitsCount, 2);
      assert.equal(p.start.page, 1);
      assert.equal(p.end.page, 2);
      assert.equal(p.nextPosition.page, 3);
      assert.equal(p.primaryTarget, 'quran:hafs:1:1');
    });

    it('throws typed missing-layout error when page unit layout is missing', () => {
      assert.throws(
        () => calculatePagePortion(1, 2, [], 'warsh'),
        (err: unknown) => {
          const e = err as { error?: string; profile?: string; availableUnits?: string[] };
          return (
            e.error === 'missing-layout' &&
            e.profile === 'warsh' &&
            Array.isArray(e.availableUnits) &&
            e.availableUnits.includes('ayahs') &&
            e.availableUnits.includes('juz')
          );
        }
      );
    });
  });

  describe('Muraja\'a (revision cycle rotation)', () => {
    it('rotates through the configured range of juz in turn', () => {
      const config: QuranWirdConfig = {
        ...DEFAULT_QURAN_WIRD_CONFIG,
        murajaa: {
          enabled: true,
          unit: 'juz',
          amount: 1,
          currentJuz: 29,
          rangeLimit: 5,
          startJuz: 26,
          endJuz: 30,
        },
      };

      // Day 1: Juz 29 -> next is 30
      const m1 = calculateMurajaaPortion(config);
      assert.ok(m1);
      assert.equal(m1.start.juz, 29);
      assert.equal(m1.nextPosition.juz, 30);

      // Day 2: Juz 30 -> wraps back to startJuz (26)
      const m2 = calculateMurajaaPortion({
        ...config,
        murajaa: { ...config.murajaa, currentJuz: 30 },
      });
      assert.ok(m2);
      assert.equal(m2.start.juz, 30);
      assert.equal(m2.nextPosition.juz, 26);
    });
  });

  describe('Active weekdays and catch-up consolidation', () => {
    it('correctly determines active and rest days', () => {
      const config: QuranWirdConfig = {
        ...DEFAULT_QURAN_WIRD_CONFIG,
        activeWeekdays: [0, 1, 2, 3, 4, 6], // Friday (5) is rest
      };

      const friday = new Date('2026-11-13T12:00:00Z'); // Friday
      assert.equal(friday.getDay(), 5);
      assert.equal(isWirdActiveDay(config, friday), false);

      const saturday = new Date('2026-11-14T12:00:00Z'); // Saturday
      assert.equal(saturday.getDay(), 6);
      assert.equal(isWirdActiveDay(config, saturday), true);
    });

    it('rolls missed portions into ONE gentle catch-up without guilt wording', () => {
      const config: QuranWirdConfig = {
        ...DEFAULT_QURAN_WIRD_CONFIG,
        unit: 'pages',
        dailyAmount: 2,
        activeWeekdays: [0, 1, 2, 3, 4, 6],
        lastCompletedDate: '2026-11-04', // 5 active days elapsed before 2026-11-10
      };

      const layout = createMockLayoutPages();
      const catchUp = calculateCatchUpSuggestion(config, '2026-11-10', layout);

      assert.equal(catchUp.needed, true);
      assert.ok(catchUp.missedDays > 1);
      // Catch-up is capped at 1 dailyAmount (2 pages) so user is not overwhelmed
      assert.equal(catchUp.missedUnits, 2);
      assert.ok(catchUp.portion);
      assert.equal(catchUp.portion.unitsCount, 2);
      // Verify no guilt wording in label
      assert.ok(!catchUp.label.includes('فشلت') && !catchUp.label.includes('failed') && !catchUp.label.includes('overdue'));
      assert.ok(catchUp.label.includes('استدراك') || catchUp.label.includes('catch-up'));
    });
  });

  describe('Service SQLite integration (ADR-007)', () => {
    it('syncs today wird task in SQLite and completes it', async () => {
      const db = createTestDb();
      const settingsRepo = new MockSettingsRepository();
      const plannerRepo = new StudyPlannerRepository(db);

      const service = new QuranWirdService({
        settingsRepo,
        plannerRepo,
        layoutProvider: profile => (profile === 'hafs' ? createMockLayoutPages() : null),
      });

      // 1. Initial sync creates a study_task for today
      const todayStr = '2026-11-10'; // Tuesday (active weekday)
      const res = await service.syncTodayWird(todayStr);

      assert.ok(res.isActiveToday);
      assert.equal(res.isCompletedToday, false);
      assert.ok(res.taskId);
      assert.equal(res.portion.unit, 'pages');
      assert.equal(res.portion.primaryTarget, 'quran:hafs:1:1');

      // Verify task exists in SQLite
      const tasks = plannerRepo.list();
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].id, res.taskId);
      assert.equal(tasks[0].status, 'open');
      assert.equal(tasks[0].references[0].target, 'quran:hafs:1:1');

      // 2. Complete the wird portion
      const completedRes = await service.completeWird(todayStr, res.taskId);
      assert.equal(completedRes.isCompletedToday, true);

      // Verify task in SQLite was updated to completed
      const updatedTasks = plannerRepo.list();
      assert.equal(updatedTasks[0].status, 'completed');
      assert.ok(updatedTasks[0].completedAt);

      // Verify position advanced to page 3
      const updatedConfig = await service.getConfig();
      assert.equal(updatedConfig.currentPosition.page, 3);
      assert.equal(updatedConfig.lastCompletedDate, todayStr);

      db.close();
    });

    it('rejects page unit when saving Warsh without layout', async () => {
      const db = createTestDb();
      const settingsRepo = new MockSettingsRepository();
      const plannerRepo = new StudyPlannerRepository(db);

      const service = new QuranWirdService({
        settingsRepo,
        plannerRepo,
        layoutProvider: profile => (profile === 'hafs' ? createMockLayoutPages() : null),
      });

      await assert.rejects(
        service.saveConfig({
          profile: 'warsh',
          unit: 'pages',
          dailyAmount: 2,
        }),
        (err: unknown) => {
          const e = err as { error?: string; profile?: string };
          return e.error === 'missing-layout' && e.profile === 'warsh';
        }
      );

      // But saving Warsh with ayahs succeeds!
      const validWarsh = await service.saveConfig({
        profile: 'warsh',
        unit: 'ayahs',
        dailyAmount: 10,
      });
      assert.equal(validWarsh.profile, 'warsh');
      assert.equal(validWarsh.unit, 'ayahs');

      db.close();
    });
  });
});
