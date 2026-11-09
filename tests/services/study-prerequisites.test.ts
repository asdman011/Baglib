import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  validatePrerequisitesMap,
  detectCycle,
  formatCyclePath,
  renameSectionInPrerequisites,
  deleteSectionInPrerequisites,
  evaluatePrerequisiteAssessment,
  selectWeakestPrerequisite,
  shouldShowPrerequisiteHint,
  PREREQUISITES_SETTINGS_PREFIX,
  PREREQUISITES_DISMISSED_PREFIX,
} from '../../src/shared/study-prerequisites';
import { StudyPrerequisitesService } from '../../src/main/services/study-prerequisites.service';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { StudyProgressService } from '../../src/main/services/statistics/study-progress.service';

describe('Curriculum Prerequisites & Hints (KEY-288)', () => {
  describe('Prerequisites Map Validation', () => {
    it('returns empty map for null or non-object inputs', () => {
      assert.deepEqual(validatePrerequisitesMap(null), {});
      assert.deepEqual(validatePrerequisitesMap(undefined), {});
      assert.deepEqual(validatePrerequisitesMap('string'), {});
      assert.deepEqual(validatePrerequisitesMap([]), {});
    });

    it('cleans and trims valid section dependencies', () => {
      const input = {
        '  Covariance  ': ['  Variance  '],
        Regression: ['Covariance', '  Variance  '],
      };
      const result = validatePrerequisitesMap(input);
      assert.deepEqual(result, {
        Covariance: ['Variance'],
        Regression: ['Covariance', 'Variance'],
      });
    });

    it('rejects self-dependencies', () => {
      const input = {
        Variance: ['Variance'],
      };
      assert.throws(() => validatePrerequisitesMap(input), /self-dependency/);
    });

    it('filters out sections not in availableSections when provided', () => {
      const input = {
        Regression: ['Covariance', 'UnknownSection'],
        UnknownCaller: ['Variance'],
      };
      const result = validatePrerequisitesMap(input, ['Regression', 'Covariance', 'Variance']);
      assert.deepEqual(result, {
        Regression: ['Covariance'],
      });
    });
  });

  describe('Cycle Detection', () => {
    it('returns null for an empty map or valid DAG', () => {
      assert.equal(detectCycle({}), null);

      const dag = {
        Covariance: ['Variance'],
        Regression: ['Covariance', 'Variance'],
      };
      assert.equal(detectCycle(dag), null);
    });

    it('detects a 2-node cycle', () => {
      const cyclic = {
        A: ['B'],
        B: ['A'],
      };
      const cycle = detectCycle(cyclic);
      assert.notEqual(cycle, null);
      assert.equal(cycle![0], cycle![cycle!.length - 1]);
      assert.equal(cycle!.includes('A'), true);
      assert.equal(cycle!.includes('B'), true);
    });

    it('detects a 3-node cycle (e.g. Variance -> Covariance -> Regression -> Variance)', () => {
      const cyclic = {
        Covariance: ['Variance'],
        Regression: ['Covariance'],
        Variance: ['Regression'],
      };
      const cycle = detectCycle(cyclic);
      assert.notEqual(cycle, null);
      assert.equal(cycle![0], cycle![cycle!.length - 1]);
      assert.equal(cycle!.length, 4);
    });

    it('formats cycle path with arrows in en and ar', () => {
      const cycle = ['Variance', 'Covariance', 'Regression', 'Variance'];
      assert.equal(
        formatCyclePath(cycle, 'en'),
        'Variance → Covariance → Regression → Variance'
      );
      assert.equal(
        formatCyclePath(cycle, 'ar'),
        'Variance ← Covariance ← Regression ← Variance'
      );
    });
  });

  describe('Section Rename & Delete Propagation', () => {
    it('renames section in keys and dependency lists', () => {
      const original = {
        Covariance: ['Variance'],
        Regression: ['Covariance', 'Variance'],
      };
      const renamed = renameSectionInPrerequisites(original, 'Variance', 'Basic Variance');
      assert.deepEqual(renamed, {
        Covariance: ['Basic Variance'],
        Regression: ['Covariance', 'Basic Variance'],
      });

      // Renaming a key
      const renamedKey = renameSectionInPrerequisites(renamed, 'Covariance', 'Joint Covariance');
      assert.deepEqual(renamedKey, {
        'Joint Covariance': ['Basic Variance'],
        Regression: ['Joint Covariance', 'Basic Variance'],
      });
    });

    it('deletes section from keys and dependency lists', () => {
      const original = {
        Covariance: ['Variance'],
        Regression: ['Covariance', 'Variance'],
      };
      const deleted = deleteSectionInPrerequisites(original, 'Covariance');
      assert.deepEqual(deleted, {
        Regression: ['Variance'],
      });
    });
  });

  describe('Weakest Prerequisite Selection', () => {
    it('selects the prerequisite with lower mastery level', () => {
      const assessmentVariance = evaluatePrerequisiteAssessment('Variance', {
        level: 'started',
        totalCards: 10,
        lapsesCount: 1,
        correctAttempts: 2,
        totalAttempts: 3,
      });

      const assessmentCovariance = evaluatePrerequisiteAssessment('Covariance', {
        level: 'proficient',
        totalCards: 10,
        lapsesCount: 0,
        correctAttempts: 8,
        totalAttempts: 9,
      });

      const weakest = selectWeakestPrerequisite([assessmentVariance, assessmentCovariance]);
      assert.equal(weakest?.sectionName, 'Variance');
    });

    it('selects the prerequisite with higher lapses when mastery level is identical', () => {
      const prereq1 = evaluatePrerequisiteAssessment('Prereq1', {
        level: 'familiar',
        totalCards: 5,
        lapsesCount: 3,
        correctAttempts: 4,
        totalAttempts: 7,
      });

      const prereq2 = evaluatePrerequisiteAssessment('Prereq2', {
        level: 'familiar',
        totalCards: 5,
        lapsesCount: 0,
        correctAttempts: 5,
        totalAttempts: 5,
      });

      const weakest = selectWeakestPrerequisite([prereq1, prereq2]);
      assert.equal(weakest?.sectionName, 'Prereq1');
    });

    it('breaks ties deterministically by section name', () => {
      const prereqB = evaluatePrerequisiteAssessment('Beta', {
        level: 'proficient',
        totalCards: 5,
        lapsesCount: 0,
        correctAttempts: 5,
        totalAttempts: 5,
      });

      const prereqA = evaluatePrerequisiteAssessment('Alpha', {
        level: 'proficient',
        totalCards: 5,
        lapsesCount: 0,
        correctAttempts: 5,
        totalAttempts: 5,
      });

      const weakest = selectWeakestPrerequisite([prereqB, prereqA]);
      assert.equal(weakest?.sectionName, 'Alpha');
    });
  });

  describe('Dismissal Behavior', () => {
    it('shows hint when no dismissal exists', () => {
      assert.equal(shouldShowPrerequisiteHint(3, null), true);
      assert.equal(shouldShowPrerequisiteHint(3, undefined), true);
    });

    it('silences hint when current failures have not increased beyond dismissal count', () => {
      const dismissal = {
        pathwayId: 'pathway-1',
        failingSection: 'Regression',
        weakestPrerequisite: 'Variance',
        dismissedAt: new Date().toISOString(),
        failureCountAtDismissal: 3,
      };

      assert.equal(shouldShowPrerequisiteHint(3, dismissal), false);
      assert.equal(shouldShowPrerequisiteHint(2, dismissal), false);
    });

    it('resurfaces hint when new failures occur after dismissal', () => {
      const dismissal = {
        pathwayId: 'pathway-1',
        failingSection: 'Regression',
        weakestPrerequisite: 'Variance',
        dismissedAt: new Date().toISOString(),
        failureCountAtDismissal: 3,
      };

      // 4 failures > 3 at dismissal -> hint resurfaces!
      assert.equal(shouldShowPrerequisiteHint(4, dismissal), true);
    });
  });

  describe('StudyPrerequisitesService SQLite & Settings Integration', () => {
    let db: Database.Database;
    let service: StudyPrerequisitesService;
    let settingsRepo: SqliteSettingsRepository;

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
          collection_id TEXT NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
          section TEXT NOT NULL,
          kind TEXT NOT NULL,
          reference TEXT,
          title TEXT NOT NULL,
          url TEXT,
          pinned INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE TABLE knowledge (
          id TEXT PRIMARY KEY,
          work_id TEXT,
          created_at TEXT NOT NULL,
          deleted_at TEXT
        );

        CREATE TABLE card_detail (
          knowledge_id TEXT PRIMARY KEY,
          front TEXT,
          back TEXT,
          source_kind TEXT,
          source_ref TEXT,
          source_label TEXT,
          language TEXT
        );

        CREATE TABLE srs_state (
          knowledge_id TEXT PRIMARY KEY,
          state TEXT,
          due_at TEXT,
          stability REAL,
          difficulty REAL,
          reps INTEGER,
          lapses INTEGER DEFAULT 0,
          last_review TEXT
        );

        CREATE TABLE practice_attempt (
          id TEXT PRIMARY KEY,
          knowledge_id TEXT,
          card_revision INTEGER,
          question_kind TEXT,
          answer_text TEXT,
          result TEXT,
          check_method TEXT,
          mistake_category TEXT,
          confidence INTEGER,
          duration_ms INTEGER,
          source_ref TEXT,
          context TEXT,
          created_at TEXT
        );
      `);

      settingsRepo = new SqliteSettingsRepository(db);
      const progressService = new StudyProgressService(db);
      service = new StudyPrerequisitesService(db, settingsRepo, progressService);
    });

    it('saves prerequisites and rejects cyclic configurations', () => {
      const pathwayId = 'curr-1';
      db.prepare(`INSERT INTO collection (id, name, collection_type) VALUES (?, ?, ?)`).run(
        pathwayId,
        'Mathematical Statistics',
        'curriculum'
      );

      db.prepare(
        `INSERT INTO pathway_item (id, collection_id, section, kind, title, created_at)
         VALUES ('item-1', ?, 'Variance', 'step', 'Read Variance', datetime('now')),
                ('item-2', ?, 'Covariance', 'step', 'Read Covariance', datetime('now')),
                ('item-3', ?, 'Regression', 'step', 'Read Regression', datetime('now'))`
      ).run(pathwayId, pathwayId, pathwayId);

      // Valid save
      const saveRes1 = service.savePrerequisites(pathwayId, {
        Covariance: ['Variance'],
        Regression: ['Covariance'],
      });
      assert.equal(saveRes1.success, true);

      const saved = service.getPrerequisites(pathwayId);
      assert.deepEqual(saved, {
        Covariance: ['Variance'],
        Regression: ['Covariance'],
      });

      // Cyclic save attempt
      const cycleRes = service.savePrerequisites(pathwayId, {
        Variance: ['Regression'],
        Covariance: ['Variance'],
        Regression: ['Covariance'],
      });
      assert.equal(cycleRes.success, false);
      assert.notEqual(cycleRes.cycle, undefined);
      assert.equal(cycleRes.cycle!.length > 2, true);

      // Previous valid map remains unchanged in settings
      const uncorrupted = service.getPrerequisites(pathwayId);
      assert.deepEqual(uncorrupted, {
        Covariance: ['Variance'],
        Regression: ['Covariance'],
      });
    });

    it('renames section in database items and prerequisites settings', () => {
      const pathwayId = 'curr-1';
      db.prepare(`INSERT INTO collection (id, name, collection_type) VALUES (?, ?, ?)`).run(
        pathwayId,
        'Statistics',
        'curriculum'
      );

      db.prepare(
        `INSERT INTO pathway_item (id, collection_id, section, kind, title, created_at)
         VALUES ('item-1', ?, 'Variance', 'step', 'V1', datetime('now')),
                ('item-2', ?, 'Covariance', 'step', 'C1', datetime('now'))`
      ).run(pathwayId, pathwayId);

      service.savePrerequisites(pathwayId, {
        Covariance: ['Variance'],
      });

      service.renameSection(pathwayId, 'Variance', 'Basic Variance');

      // Verify SQLite items updated
      const itemRow = db
        .prepare(`SELECT section FROM pathway_item WHERE id = 'item-1'`)
        .get() as { section: string };
      assert.equal(itemRow.section, 'Basic Variance');

      // Verify settings updated
      const updatedPrereqs = service.getPrerequisites(pathwayId);
      assert.deepEqual(updatedPrereqs, {
        Covariance: ['Basic Variance'],
      });
    });

    it('deletes section in database items and prerequisites settings', () => {
      const pathwayId = 'curr-1';
      db.prepare(`INSERT INTO collection (id, name, collection_type) VALUES (?, ?, ?)`).run(
        pathwayId,
        'Statistics',
        'curriculum'
      );

      db.prepare(
        `INSERT INTO pathway_item (id, collection_id, section, kind, title, created_at)
         VALUES ('item-1', ?, 'Variance', 'step', 'V1', datetime('now')),
                ('item-2', ?, 'Covariance', 'step', 'C1', datetime('now'))`
      ).run(pathwayId, pathwayId);

      service.savePrerequisites(pathwayId, {
        Covariance: ['Variance'],
      });

      service.deleteSection(pathwayId, 'Variance');

      // Items deleted
      const items = db.prepare(`SELECT * FROM pathway_item WHERE section = 'Variance'`).all();
      assert.equal(items.length, 0);

      // Dependencies updated
      const updatedPrereqs = service.getPrerequisites(pathwayId);
      assert.deepEqual(updatedPrereqs, {});
    });

    it('cleans up settings when pathway is removed', () => {
      const pathwayId = 'curr-1';
      service.savePrerequisites(pathwayId, {
        Covariance: ['Variance'],
      });
      service.dismissHint(pathwayId, 'Regression', 'Variance', 2);

      assert.notEqual(settingsRepo.get(`${PREREQUISITES_SETTINGS_PREFIX}${pathwayId}`), undefined);
      assert.notEqual(settingsRepo.get(`${PREREQUISITES_DISMISSED_PREFIX}${pathwayId}`), undefined);

      service.cleanupPathway(pathwayId);

      assert.equal(settingsRepo.get(`${PREREQUISITES_SETTINGS_PREFIX}${pathwayId}`), undefined);
      assert.equal(settingsRepo.get(`${PREREQUISITES_DISMISSED_PREFIX}${pathwayId}`), undefined);
    });

    it('surfaces weakest prerequisite hint for struggling sections and respects dismissal', () => {
      const pathwayId = 'curr-stats';
      db.prepare(`INSERT INTO collection (id, name, collection_type) VALUES (?, ?, ?)`).run(
        pathwayId,
        'Advanced Econometrics',
        'curriculum'
      );

      db.prepare(
        `INSERT INTO pathway_item (id, collection_id, section, kind, reference, title, created_at)
         VALUES ('step-v', ?, 'Variance', 'step', null, 'Learn Variance', datetime('now')),
                ('step-c', ?, 'Covariance', 'step', null, 'Learn Covariance', datetime('now')),
                ('step-r', ?, 'Regression', 'step', null, 'Learn Regression', datetime('now'))`
      ).run(pathwayId, pathwayId, pathwayId);

      // Prerequisite dependency: Regression depends on Covariance and Variance
      service.savePrerequisites(pathwayId, {
        Regression: ['Covariance', 'Variance'],
      });

      // Seed cards
      // Variance has 1 card with 0 attempts (weakest!)
      db.prepare(`INSERT INTO knowledge (id, created_at) VALUES ('k-v', datetime('now'))`).run();
      db.prepare(
        `INSERT INTO card_detail (knowledge_id, source_label) VALUES ('k-v', 'Variance')`
      ).run();

      // Covariance has 1 card with 2 correct attempts (familiar)
      db.prepare(`INSERT INTO knowledge (id, created_at) VALUES ('k-c', datetime('now'))`).run();
      db.prepare(
        `INSERT INTO card_detail (knowledge_id, source_label) VALUES ('k-c', 'Covariance')`
      ).run();
      db.prepare(
        `INSERT INTO practice_attempt (id, knowledge_id, question_kind, result, check_method, created_at)
         VALUES ('att-c1', 'k-c', 'recall', 'correct', 'auto', datetime('now')),
                ('att-c2', 'k-c', 'recall', 'correct', 'auto', datetime('now'))`
      ).run();

      // Regression has 1 card with 2 lapses / failures (struggling!)
      db.prepare(`INSERT INTO knowledge (id, created_at) VALUES ('k-r', datetime('now'))`).run();
      db.prepare(
        `INSERT INTO card_detail (knowledge_id, source_label) VALUES ('k-r', 'Regression')`
      ).run();
      db.prepare(
        `INSERT INTO srs_state (knowledge_id, state, due_at, reps, lapses)
         VALUES ('k-r', 'relearning', datetime('now'), 3, 2)`
      ).run();
      db.prepare(
        `INSERT INTO practice_attempt (id, knowledge_id, question_kind, result, check_method, created_at)
         VALUES ('att-r1', 'k-r', 'recall', 'incorrect', 'auto', datetime('now'))`
      ).run();

      // Get hints
      const hints = service.getPrerequisiteHints();
      assert.equal(hints.length, 1);
      assert.equal(hints[0].pathwayId, pathwayId);
      assert.equal(hints[0].failingSection, 'Regression');
      assert.equal(hints[0].weakestPrerequisite, 'Variance'); // Variance is not_started vs Covariance familiar!

      // Dismiss the hint
      service.dismissHint(
        pathwayId,
        hints[0].failingSection,
        hints[0].weakestPrerequisite,
        hints[0].currentFailureCount
      );

      // Now query again: hint should be silenced!
      const afterDismissal = service.getPrerequisiteHints();
      assert.equal(afterDismissal.length, 0);

      // Add a new failure to Regression:
      db.prepare(
        `INSERT INTO practice_attempt (id, knowledge_id, question_kind, result, check_method, created_at)
         VALUES ('att-r2', 'k-r', 'recall', 'incorrect', 'auto', datetime('now'))`
      ).run();

      // Query again: new failure occurred, hint resurfaces!
      const afterNewFailure = service.getPrerequisiteHints();
      assert.equal(afterNewFailure.length, 1);
      assert.equal(afterNewFailure[0].failingSection, 'Regression');
      assert.equal(afterNewFailure[0].weakestPrerequisite, 'Variance');
    });
  });
});
