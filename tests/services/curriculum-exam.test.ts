import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  validateExamConfig,
  computeAdaptiveReplan,
  formatHijriCivilDate,
  type PlanStepItem,
  type CurriculumExamConfig,
} from '../../src/shared/curriculum-exam';
import { CurriculumExamService } from '../../src/main/services/curriculum-exam.service';
import { PathwayService } from '../../src/main/services/pathways';

describe('Curriculum Exam & Adaptive Re-planning (KEY-285)', () => {
  describe('Exam Config Validation', () => {
    it('validates and bounds exam config fields', () => {
      const valid = validateExamConfig({
        pathwayId: 'pathway-1',
        examDate: '2026-12-01',
        availableMinutesPerDay: { 0: 90, 1: 45, 5: 0 },
        defaultStepMinutes: 25,
      });

      assert.equal(valid.pathwayId, 'pathway-1');
      assert.equal(valid.examDate, '2026-12-01');
      assert.equal(valid.availableMinutesPerDay[0], 90);
      assert.equal(valid.availableMinutesPerDay[1], 45);
      assert.equal(valid.availableMinutesPerDay[5], 0);
      assert.equal(valid.defaultStepMinutes, 25);
    });

    it('rejects invalid pathwayId or invalid exam date format', () => {
      assert.throws(() => validateExamConfig({ pathwayId: '' }));
      assert.throws(() => validateExamConfig({ pathwayId: 'p1', examDate: 'not-a-date' }));
      assert.throws(() => validateExamConfig({ pathwayId: 'p1', defaultStepMinutes: 2 })); // min 5
      assert.throws(() => validateExamConfig({ pathwayId: 'p1', availableMinutesPerDay: { 0: -10 } }));
    });
  });

  describe('Hijri & Gregorian Date Formatting', () => {
    it('formats civil date with Hijri year and month in en and ar', () => {
      const en = formatHijriCivilDate('2026-11-23', 'en');
      const ar = formatHijriCivilDate('2026-11-23', 'ar');

      assert.ok(en.includes('1448 AH'));
      assert.ok(ar.includes('1448 هـ'));
    });
  });

  describe('Adaptive Re-plan Algorithm', () => {
    const today = '2026-11-09'; // Monday (day 1)

    it('evenly spreads unpinned steps across available free study days', () => {
      // 10 days until exam: 2026-11-19
      // Days from 2026-11-09 to 2026-11-18 (10 calendar days).
      // Day 1 (Mon 9), 2 (Tue 10), 3 (Wed 11), 4 (Thu 12), 5 (Fri 13 - rest), 6 (Sat 14), 0 (Sun 15), 1 (Mon 16), 2 (Tue 17), 3 (Wed 18)
      // Free study days = 9 (excluding Friday 13)
      const examConfig: CurriculumExamConfig = {
        pathwayId: 'path-1',
        examDate: '2026-11-19',
        availableMinutesPerDay: { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60, 5: 0, 6: 60 },
        defaultStepMinutes: 30,
      };

      const steps: PlanStepItem[] = [
        { itemId: '1', taskId: 't1', section: 'S1', title: 'Step 1', pinned: false, done: false, currentDueDate: null },
        { itemId: '2', taskId: 't2', section: 'S1', title: 'Step 2', pinned: false, done: false, currentDueDate: null },
        { itemId: '3', taskId: 't3', section: 'S2', title: 'Step 3', pinned: false, done: false, currentDueDate: null },
        { itemId: '4', taskId: 't4', section: 'S2', title: 'Step 4', pinned: false, done: false, currentDueDate: null },
        { itemId: '5', taskId: 't5', section: 'S3', title: 'Step 5', pinned: false, done: false, currentDueDate: null },
        { itemId: '6', taskId: 't6', section: 'S3', title: 'Step 6', pinned: false, done: false, currentDueDate: null },
      ];

      const result = computeAdaptiveReplan({
        steps,
        examConfig,
        restDays: [5],
        todayStr: today,
        lang: 'en',
      });

      assert.equal(result.fits, true);
      assert.equal(result.totalRemainingSteps, 6);
      assert.equal(result.freeDaysCount, 9);
      assert.equal(result.suggestedSchedule.length, 6);

      // Verify no step is scheduled on Friday 2026-11-13
      const dates = result.suggestedSchedule.map(s => s.suggestedDate);
      assert.ok(!dates.includes('2026-11-13'), 'No step should be scheduled on rest day (Friday)');

      // Verify dates are distributed and within [2026-11-09, 2026-11-18]
      for (const d of dates) {
        assert.ok(d >= '2026-11-09' && d < '2026-11-19');
      }
    });

    it('respects pinned dates and does not reschedule pinned steps', () => {
      const examConfig: CurriculumExamConfig = {
        pathwayId: 'path-1',
        examDate: '2026-11-19',
        availableMinutesPerDay: { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60, 5: 0, 6: 60 },
        defaultStepMinutes: 30,
      };

      const pinnedDate = '2026-11-12';
      const steps: PlanStepItem[] = [
        { itemId: '1', taskId: 't1', section: 'S1', title: 'Pinned Step', pinned: true, done: false, currentDueDate: pinnedDate },
        { itemId: '2', taskId: 't2', section: 'S1', title: 'Step 2', pinned: false, done: false, currentDueDate: null },
        { itemId: '3', taskId: 't3', section: 'S2', title: 'Step 3', pinned: false, done: false, currentDueDate: null },
      ];

      const result = computeAdaptiveReplan({
        steps,
        examConfig,
        restDays: [5],
        todayStr: today,
        lang: 'en',
      });

      assert.equal(result.fits, true);
      const pinnedSchedule = result.suggestedSchedule.find(s => s.itemId === '1');
      assert.ok(pinnedSchedule);
      assert.equal(pinnedSchedule.suggestedDate, pinnedDate);
      assert.equal(pinnedSchedule.isPinnedDate, true);
    });

    it('handles rest days properly by leaving them empty', () => {
      const examConfig: CurriculumExamConfig = {
        pathwayId: 'path-1',
        examDate: '2026-11-16', // Mon 16 -> days: Mon 9, Tue 10, Wed 11, Thu 12, Fri 13 (rest), Sat 14, Sun 15
        availableMinutesPerDay: { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60, 5: 0, 6: 60 },
        defaultStepMinutes: 30,
      };

      const steps: PlanStepItem[] = [
        { itemId: '1', taskId: 't1', section: 'S1', title: 'Step 1', pinned: false, done: false, currentDueDate: null },
        { itemId: '2', taskId: 't2', section: 'S1', title: 'Step 2', pinned: false, done: false, currentDueDate: null },
        { itemId: '3', taskId: 't3', section: 'S2', title: 'Step 3', pinned: false, done: false, currentDueDate: null },
        { itemId: '4', taskId: 't4', section: 'S2', title: 'Step 4', pinned: false, done: false, currentDueDate: null },
      ];

      const result = computeAdaptiveReplan({
        steps,
        examConfig,
        restDays: [5], // Friday is rest
        todayStr: today,
        lang: 'en',
      });

      assert.equal(result.fits, true);
      assert.ok(!result.suggestedSchedule.some(s => s.suggestedDate === '2026-11-13'));
    });

    it('detects a deadline that cannot fit, says so plainly without guilt, and suggests dropping/shortening mastered sections', () => {
      // Exam is in 2 days (2026-11-11). Study days: Mon 9, Tue 10 (total 2 days * 60m = 120m).
      // Steps: 8 steps * 30m = 240m required. Shortfall of 120m!
      const examConfig: CurriculumExamConfig = {
        pathwayId: 'path-1',
        examDate: '2026-11-11',
        availableMinutesPerDay: { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60, 5: 0, 6: 60 },
        defaultStepMinutes: 30,
      };

      const steps: PlanStepItem[] = [
        // Weak section & prerequisite
        { itemId: '1', taskId: 't1', section: 'Covariance', title: 'Intro to Covariance', pinned: false, done: false, currentDueDate: null, masteryLevel: 'started', isPrerequisite: true, failureCount: 3 },
        { itemId: '2', taskId: 't2', section: 'Covariance', title: 'Sample Covariance', pinned: false, done: false, currentDueDate: null, masteryLevel: 'started', isPrerequisite: true, failureCount: 2 },
        // Struggling dependent section
        { itemId: '3', taskId: 't3', section: 'Regression', title: 'Simple Regression', pinned: false, done: false, currentDueDate: null, masteryLevel: 'familiar', isPrerequisite: false, failureCount: 4 },
        { itemId: '4', taskId: 't4', section: 'Regression', title: 'OLS Estimation', pinned: false, done: false, currentDueDate: null, masteryLevel: 'familiar', isPrerequisite: false, failureCount: 2 },
        // Already mastered section (good candidate to drop/shorten!)
        { itemId: '5', taskId: 't5', section: 'Basic Probability', title: 'Permutations', pinned: false, done: false, currentDueDate: null, masteryLevel: 'mastered', isPrerequisite: false, failureCount: 0 },
        { itemId: '6', taskId: 't6', section: 'Basic Probability', title: 'Combinations', pinned: false, done: false, currentDueDate: null, masteryLevel: 'mastered', isPrerequisite: false, failureCount: 0 },
        { itemId: '7', taskId: 't7', section: 'Basic Probability', title: 'Venn Diagrams', pinned: false, done: false, currentDueDate: null, masteryLevel: 'mastered', isPrerequisite: false, failureCount: 0 },
        { itemId: '8', taskId: 't8', section: 'Basic Probability', title: 'Set Operations', pinned: false, done: false, currentDueDate: null, masteryLevel: 'mastered', isPrerequisite: false, failureCount: 0 },
      ];

      const resultEn = computeAdaptiveReplan({
        steps,
        examConfig,
        restDays: [5],
        todayStr: today,
        lang: 'en',
      });

      assert.equal(resultEn.fits, false);
      assert.equal(resultEn.unfitReason, 'insufficient_time');
      assert.ok(resultEn.unfitMessage?.includes('shortfall'));
      // Never use guilt wording
      assert.ok(!resultEn.unfitMessage?.toLowerCase().includes('fail'));
      assert.ok(!resultEn.unfitMessage?.toLowerCase().includes('guilt'));
      assert.ok(!resultEn.unfitMessage?.toLowerCase().includes('streak'));

      // Suggests dropping or shortening mastered section 'Basic Probability'
      assert.ok(resultEn.droppedOrShortenedSuggestions.length > 0);
      const dropProb = resultEn.droppedOrShortenedSuggestions.find(d => d.section === 'Basic Probability');
      assert.ok(dropProb);
      assert.equal(dropProb.reason, 'already_mastered');
      assert.equal(dropProb.stepCount, 4);

      // Covariance and Regression should NOT be suggested to drop because they are weak or prerequisites!
      assert.ok(!resultEn.droppedOrShortenedSuggestions.some(d => d.section === 'Covariance'));
      assert.ok(!resultEn.droppedOrShortenedSuggestions.some(d => d.section === 'Regression'));

      // Test Arabic output
      const resultAr = computeAdaptiveReplan({
        steps,
        examConfig,
        restDays: [5],
        todayStr: today,
        lang: 'ar',
      });
      assert.equal(resultAr.fits, false);
      assert.ok(resultAr.unfitMessage?.includes('عجز'));
    });

    it('handles an exam date in the past cleanly', () => {
      const pastExamDate = '2026-11-01'; // Before today 2026-11-09
      const examConfig: CurriculumExamConfig = {
        pathwayId: 'path-1',
        examDate: pastExamDate,
        availableMinutesPerDay: { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60, 5: 0, 6: 60 },
        defaultStepMinutes: 30,
      };

      const steps: PlanStepItem[] = [
        { itemId: '1', taskId: 't1', section: 'S1', title: 'Step 1', pinned: false, done: false, currentDueDate: null },
      ];

      const result = computeAdaptiveReplan({
        steps,
        examConfig,
        restDays: [5],
        todayStr: today,
        lang: 'en',
      });

      assert.equal(result.fits, false);
      assert.equal(result.unfitReason, 'past_exam_date');
      assert.equal(result.freeDaysCount, 0);
      assert.ok(result.unfitMessage?.includes('past'));
    });
  });

  describe('CurriculumExamService SQLite & Settings Integration', () => {
    let db: Database.Database;
    let service: CurriculumExamService;
    let pathwayService: PathwayService;

    beforeEach(() => {
      db = new Database(':memory:');
      db.exec(`
        CREATE TABLE app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE collection (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          collection_type TEXT NOT NULL
        );
        CREATE TABLE pathway_item (
          id TEXT PRIMARY KEY,
          collection_id TEXT NOT NULL,
          section TEXT NOT NULL,
          kind TEXT NOT NULL,
          reference TEXT,
          title TEXT NOT NULL,
          url TEXT,
          pinned INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE TABLE study_task (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'open',
          start_date TEXT,
          due_date TEXT,
          priority INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          references_json TEXT NOT NULL DEFAULT '[]',
          completed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE card_detail (
          id TEXT PRIMARY KEY,
          source_label TEXT,
          front TEXT,
          back TEXT
        );
        CREATE TABLE practice_attempt (
          id TEXT PRIMARY KEY,
          card_id TEXT,
          status TEXT,
          created_at TEXT
        );
        CREATE TABLE srs_state (
          card_id TEXT PRIMARY KEY,
          lapses_count INTEGER DEFAULT 0
        );
      `);

      service = new CurriculumExamService(db);
      pathwayService = new PathwayService(db);
    });

    it('saves and retrieves exam configuration', () => {
      db.prepare("INSERT INTO collection (id, name, description, collection_type) VALUES ('p1', 'Stats', '', 'curriculum')").run();

      const config = service.saveExamConfig({
        pathwayId: 'p1',
        examDate: '2026-11-23',
        availableMinutesPerDay: { 0: 60, 1: 60, 5: 0 },
        defaultStepMinutes: 30,
      });

      assert.equal(config.examDate, '2026-11-23');

      const loaded = service.getExamConfig('p1');
      assert.equal(loaded.examDate, '2026-11-23');
      assert.equal(loaded.availableMinutesPerDay[5], 0);
      assert.equal(loaded.defaultStepMinutes, 30);
    });

    it('cleans up exam settings when pathway is removed', () => {
      db.prepare("INSERT INTO collection (id, name, description, collection_type) VALUES ('p1', 'Stats', '', 'curriculum')").run();

      service.saveExamConfig({
        pathwayId: 'p1',
        examDate: '2026-11-23',
        availableMinutesPerDay: { 0: 60 },
        defaultStepMinutes: 30,
      });

      // Remove pathway via PathwayService
      pathwayService.remove('p1');

      // Check app_settings directly
      const row = db.prepare("SELECT value FROM app_settings WHERE key = 'pathways.exam.v1:p1'").get();
      assert.equal(row, undefined, 'Exam settings must be cleaned up on pathway deletion');
    });

    it('applies confirmed re-plan schedule to study_task rows', async () => {
      db.prepare("INSERT INTO collection (id, name, description, collection_type) VALUES ('p1', 'Stats', '', 'curriculum')").run();

      const now = new Date().toISOString();
      db.prepare("INSERT INTO study_task (id, title, status, created_at, updated_at) VALUES ('t1', 'Step 1', 'open', ?, ?)").run(now, now);
      db.prepare("INSERT INTO study_task (id, title, status, created_at, updated_at) VALUES ('t2', 'Step 2', 'open', ?, ?)").run(now, now);

      db.prepare("INSERT INTO pathway_item (id, collection_id, section, kind, reference, title, created_at) VALUES ('i1', 'p1', 'S1', 'step', 'task:t1', 'Step 1', ?)").run(now);
      db.prepare("INSERT INTO pathway_item (id, collection_id, section, kind, reference, title, created_at) VALUES ('i2', 'p1', 'S1', 'step', 'task:t2', 'Step 2', ?)").run(now);

      service.saveExamConfig({
        pathwayId: 'p1',
        examDate: '2026-11-25',
        availableMinutesPerDay: { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60, 5: 0, 6: 60 },
        defaultStepMinutes: 30,
      });

      const preview = await service.getReplanPreview('p1', 'en');
      assert.equal(preview.fits, true);
      assert.equal(preview.suggestedSchedule.length, 2);

      // Apply re-plan
      service.applyReplan('p1', [
        { taskId: 't1', date: '2026-11-10' },
        { taskId: 't2', date: '2026-11-11' },
      ]);

      const t1 = db.prepare('SELECT due_date FROM study_task WHERE id = ?').get('t1') as { due_date: string };
      const t2 = db.prepare('SELECT due_date FROM study_task WHERE id = ?').get('t2') as { due_date: string };

      assert.equal(t1.due_date, '2026-11-10');
      assert.equal(t2.due_date, '2026-11-11');
    });
  });
});
