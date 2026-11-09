import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import {
  calculateReadingCoverage,
  calculateReviewsDue,
  evaluateCardMastery,
  evaluateAggregateMastery,
  MIN_READING_COVERAGE_DWELL_SECONDS,
  MASTERY_DELAYED_RETRIEVAL_HOURS,
  type PracticeAttemptRecord,
} from '../../src/shared/study-progress';
import { StudyProgressService } from '../../src/main/services/statistics/study-progress.service';

test('KEY-284: Study Progress — Reading Coverage, Mastery Levels and Reviews Due', async (t) => {
  await t.test('Reading coverage: >= 30s dwell counts as read; < 30s counts as opened only', () => {
    const pageDwells = [
      { page: 1, totalDwellSeconds: 45 }, // read
      { page: 2, totalDwellSeconds: 30 }, // read (exact threshold)
      { page: 3, totalDwellSeconds: 15 }, // opened only
      { page: 4, totalDwellSeconds: 5 },  // opened only
      { page: 5, totalDwellSeconds: 120 }, // read
    ];

    const coverage = calculateReadingCoverage(10, pageDwells);
    assert.equal(coverage.totalBookPages, 10);
    assert.equal(coverage.readPagesCount, 3);
    assert.equal(coverage.openedPagesCount, 2);
    assert.equal(coverage.coveragePercent, 30); // 3 / 10 = 30%
    assert.equal(coverage.totalDwellSeconds, 215);
    assert.equal(coverage.verifiedDwellThresholdSeconds, MIN_READING_COVERAGE_DWELL_SECONDS);
  });

  await t.test('Reading coverage: empty or 0 pages handled gracefully', () => {
    const coverage = calculateReadingCoverage(0, []);
    assert.equal(coverage.totalBookPages, 1);
    assert.equal(coverage.readPagesCount, 0);
    assert.equal(coverage.coveragePercent, 0);
  });

  await t.test('Mastery transitions: Started -> Familiar -> Proficient -> Mastered', () => {
    const baseTime = Date.parse('2026-11-01T10:00:00Z');

    // 0 attempts -> not_started
    assert.equal(evaluateCardMastery([]).level, 'not_started');

    // 1 attempt -> started
    const attempt1: PracticeAttemptRecord = {
      id: 'a1',
      questionKind: 'choice',
      result: 'correct',
      checkMethod: 'auto',
      context: 'practice',
      createdAt: new Date(baseTime).toISOString(),
    };
    assert.equal(evaluateCardMastery([attempt1]).level, 'started');

    // 2 correct attempts -> familiar
    const attempt2: PracticeAttemptRecord = {
      id: 'a2',
      questionKind: 'choice',
      result: 'correct',
      checkMethod: 'auto',
      context: 'practice',
      createdAt: new Date(baseTime + 1000 * 60).toISOString(),
    };
    assert.equal(evaluateCardMastery([attempt1, attempt2]).level, 'familiar');

    // 3 correct attempts -> proficient
    const attempt3: PracticeAttemptRecord = {
      id: 'a3',
      questionKind: 'choice',
      result: 'correct',
      checkMethod: 'judgment',
      context: 'practice',
      createdAt: new Date(baseTime + 1000 * 120).toISOString(),
    };
    assert.equal(evaluateCardMastery([attempt1, attempt2, attempt3]).level, 'proficient');

    // Proficient + delayed retrieval (>= 20h later) -> mastered
    const delayedTime = baseTime + (MASTERY_DELAYED_RETRIEVAL_HOURS + 1) * 3600 * 1000;
    const attempt4Delayed: PracticeAttemptRecord = {
      id: 'a4',
      questionKind: 'short',
      result: 'correct',
      checkMethod: 'auto',
      context: 'practice',
      createdAt: new Date(delayedTime).toISOString(),
    };
    const masteredState = evaluateCardMastery([attempt1, attempt2, attempt3, attempt4Delayed]);
    assert.equal(masteredState.level, 'mastered');
    assert.equal(masteredState.hasDelayedRetrieval, true);

    // Or Proficient + unfamiliar/challenge context -> mastered
    const attempt4Challenge: PracticeAttemptRecord = {
      id: 'a4-ch',
      questionKind: 'short',
      result: 'correct',
      checkMethod: 'auto',
      context: 'challenge',
      createdAt: new Date(baseTime + 1000 * 180).toISOString(),
    };
    const challengeMastered = evaluateCardMastery([attempt1, attempt2, attempt3, attempt4Challenge]);
    assert.equal(challengeMastered.level, 'mastered');
    assert.equal(challengeMastered.hasUnfamiliarRetrieval, true);
  });

  await t.test('Mastery demotion: lapse at Mastered drops down to Familiar', () => {
    const baseTime = Date.parse('2026-11-01T10:00:00Z');
    const delayedTime = baseTime + 24 * 3600 * 1000;
    const lapseTime = delayedTime + 3600 * 1000;

    const attempts: PracticeAttemptRecord[] = [
      { id: '1', questionKind: 'choice', result: 'correct', checkMethod: 'auto', context: 'practice', createdAt: new Date(baseTime).toISOString() },
      { id: '2', questionKind: 'choice', result: 'correct', checkMethod: 'auto', context: 'practice', createdAt: new Date(baseTime + 60000).toISOString() },
      { id: '3', questionKind: 'choice', result: 'correct', checkMethod: 'auto', context: 'practice', createdAt: new Date(baseTime + 120000).toISOString() },
      { id: '4', questionKind: 'choice', result: 'correct', checkMethod: 'auto', context: 'practice', createdAt: new Date(delayedTime).toISOString() },
    ];

    // Reached Mastered
    assert.equal(evaluateCardMastery(attempts).level, 'mastered');

    // Incorrect answer (lapse) -> demotes to familiar!
    const lapseAttempt: PracticeAttemptRecord = {
      id: '5',
      questionKind: 'choice',
      result: 'incorrect',
      checkMethod: 'auto',
      context: 'practice',
      createdAt: new Date(lapseTime).toISOString(),
    };
    attempts.push(lapseAttempt);

    const demotedState = evaluateCardMastery(attempts);
    assert.equal(demotedState.level, 'familiar');
    assert.equal(demotedState.lapsesCount, 1);
    assert.equal(demotedState.lastAttemptResult, 'incorrect');

    // Recovery from demotion: practice correct -> proficient -> delayed correct -> mastered
    const recoveryTime1 = lapseTime + 60000;
    attempts.push({
      id: '6',
      questionKind: 'choice',
      result: 'correct',
      checkMethod: 'auto',
      context: 'practice',
      createdAt: new Date(recoveryTime1).toISOString(),
    });
    assert.equal(evaluateCardMastery(attempts).level, 'proficient');

    const recoveryTime2 = recoveryTime1 + 25 * 3600 * 1000;
    attempts.push({
      id: '7',
      questionKind: 'choice',
      result: 'correct',
      checkMethod: 'auto',
      context: 'practice',
      createdAt: new Date(recoveryTime2).toISOString(),
    });
    assert.equal(evaluateCardMastery(attempts).level, 'mastered');
  });

  await t.test('Self-rated separation: self checkMethod does NOT earn demonstrated mastery', () => {
    const attempts: PracticeAttemptRecord[] = [
      { id: 's1', questionKind: 'recall', result: 'correct', checkMethod: 'self', context: 'practice', createdAt: '2026-11-01T10:00:00Z' },
      { id: 's2', questionKind: 'recall', result: 'correct', checkMethod: 'self', context: 'practice', createdAt: '2026-11-01T10:05:00Z' },
      { id: 's3', questionKind: 'recall', result: 'correct', checkMethod: 'self', context: 'practice', createdAt: '2026-11-02T10:00:00Z' },
    ];

    const state = evaluateCardMastery(attempts);
    assert.equal(state.level, 'not_started');
    assert.equal(state.demonstratedAttemptsCount, 0);
    assert.equal(state.isSelfRatedOnly, true);
  });

  await t.test('Aggregate mastery calculation for sections', () => {
    const states = [
      evaluateCardMastery([
        { id: '1', questionKind: 'choice', result: 'correct', checkMethod: 'auto', context: 'practice', createdAt: '2026-11-01T10:00:00Z' },
        { id: '2', questionKind: 'choice', result: 'correct', checkMethod: 'auto', context: 'practice', createdAt: '2026-11-01T10:05:00Z' },
        { id: '3', questionKind: 'choice', result: 'correct', checkMethod: 'auto', context: 'practice', createdAt: '2026-11-01T10:10:00Z' },
        { id: '4', questionKind: 'choice', result: 'correct', checkMethod: 'auto', context: 'challenge', createdAt: '2026-11-01T10:15:00Z' },
      ]), // mastered
      evaluateCardMastery([
        { id: '5', questionKind: 'choice', result: 'correct', checkMethod: 'auto', context: 'practice', createdAt: '2026-11-01T10:00:00Z' },
        { id: '6', questionKind: 'choice', result: 'correct', checkMethod: 'auto', context: 'practice', createdAt: '2026-11-01T10:05:00Z' },
        { id: '7', questionKind: 'choice', result: 'correct', checkMethod: 'auto', context: 'practice', createdAt: '2026-11-01T10:10:00Z' },
      ]), // proficient
    ];

    const agg = evaluateAggregateMastery(states, 'Section A');
    assert.equal(agg.sectionName, 'Section A');
    assert.equal(agg.totalCards, 2);
    assert.equal(agg.levelCounts.mastered, 1);
    assert.equal(agg.levelCounts.proficient, 1);
    assert.equal(agg.level, 'proficient'); // (1+1)/2 = 100% >= 70% proficient+mastered
  });

  await t.test('Reviews due calculation: today, this week and overdue', () => {
    const now = new Date('2026-11-05T12:00:00Z');

    const srsDates = [
      '2026-11-04T10:00:00Z', // overdue (before today)
      '2026-11-05T08:00:00Z', // due today (before now)
      '2026-11-05T18:00:00Z', // due today (later today)
      '2026-11-08T12:00:00Z', // due this week (within 7 days)
      '2026-11-20T12:00:00Z', // due far in future
    ];

    const reviews = calculateReviewsDue(srsDates, now);
    assert.equal(reviews.totalScheduledCards, 5);
    assert.equal(reviews.overdueCount, 1);
    assert.equal(reviews.dueTodayCount, 3); // 1 overdue + 2 today
    assert.equal(reviews.dueThisWeekCount, 4); // 3 today + 1 this week
    assert.equal(reviews.nextDueAt, '2026-11-05T18:00:00Z');
  });

  await t.test('Service integration: book and pathway progress with separate measures', () => {
    const db = new Database(':memory:');
    runMigrations(db, migrations);
    const clock = () => new Date('2026-11-05T12:00:00Z');
    const service = new StudyProgressService(db, clock);

    // 1. Seed book & reading dwell
    db.prepare(`
      INSERT INTO work (id, title)
      VALUES ('book-1', 'Fiqh al-Sunnah')
    `).run();

    db.prepare(`
      INSERT INTO reading_book_stat (id, title, authors, pages, total_read_pages, total_read_time)
      VALUES ('book-1', 'Fiqh al-Sunnah', 'Sayyid Sabiq', 100, 2, 120)
    `).run();

    db.prepare(`
      INSERT INTO reading_page_stat (id_book, page, start_time, duration, total_pages)
      VALUES
        ('book-1', 1, 1000, 60, 100),
        ('book-1', 2, 2000, 45, 100),
        ('book-1', 3, 3000, 10, 100)
    `).run();

    // 2. Seed knowledge cards & practice attempts
    db.prepare(`
      INSERT INTO knowledge (id, work_id, knowledge_type, created_at)
      VALUES
        ('card-1', 'book-1', 'card', '2026-11-01T00:00:00Z'),
        ('card-2', 'book-1', 'card', '2026-11-01T00:00:00Z')
    `).run();

    db.prepare(`
      INSERT INTO card_detail (knowledge_id, front, back, source_kind, source_ref, source_label)
      VALUES
        ('card-1', 'Q1', 'A1', 'book', 'book:book-1#p=1', 'Chapter 1: Taharah'),
        ('card-2', 'Q2', 'A2', 'book', 'book:book-1#p=2', 'Chapter 1: Taharah')
    `).run();

    db.prepare(`
      INSERT INTO srs_state (knowledge_id, state, due_at, reps, lapses)
      VALUES
        ('card-1', 'review', '2026-11-05T10:00:00Z', 3, 0),
        ('card-2', 'review', '2026-11-08T10:00:00Z', 2, 0)
    `).run();

    db.prepare(`
      INSERT INTO practice_attempt (id, knowledge_id, question_kind, answer_text, result, check_method, context, created_at)
      VALUES
        ('att-1', 'card-1', 'choice', 'A', 'correct', 'auto', 'practice', '2026-11-01T10:00:00Z'),
        ('att-2', 'card-1', 'choice', 'A', 'correct', 'auto', 'practice', '2026-11-01T10:05:00Z'),
        ('att-3', 'card-1', 'choice', 'A', 'correct', 'auto', 'practice', '2026-11-01T10:10:00Z'),
        ('att-4', 'card-1', 'short', 'A', 'correct', 'judgment', 'challenge', '2026-11-01T10:15:00Z')
    `).run();

    // 3. Test book progress
    const bookProgress = service.getProgress('book', 'book-1');
    assert.ok(bookProgress);
    assert.equal(bookProgress.targetKind, 'book');
    assert.equal(bookProgress.targetId, 'book-1');
    assert.equal(bookProgress.title, 'Fiqh al-Sunnah');

    // Measure 1: Reading coverage
    assert.equal(bookProgress.readingCoverage.readPagesCount, 2); // pages 1 and 2 (60s and 45s)
    assert.equal(bookProgress.readingCoverage.openedPagesCount, 1); // page 3 (10s)
    assert.equal(bookProgress.readingCoverage.coveragePercent, 2); // 2 / 100 = 2%

    // Measure 2: Demonstrated knowledge
    assert.equal(bookProgress.demonstratedKnowledge.totalCards, 2);
    assert.equal(bookProgress.demonstratedKnowledge.demonstratedCardsCount, 1);
    assert.equal(bookProgress.demonstratedKnowledge.selfRatedCardsCount, 1); // card-2 has no attempts but has SRS
    assert.equal(bookProgress.demonstratedKnowledge.levelCounts.mastered, 1);

    // Measure 3: Reviews due
    assert.equal(bookProgress.reviewsDue.dueTodayCount, 1); // card-1
    assert.equal(bookProgress.reviewsDue.dueThisWeekCount, 2); // card-1 + card-2

    // 4. Seed pathway with sections and test pathway progress
    db.prepare(`
      INSERT INTO collection (id, name, description, collection_type)
      VALUES ('pw-1', 'Islamic Studies Curriculum', 'Core curriculum', 'curriculum')
    `).run();

    db.prepare(`
      INSERT INTO pathway_item (id, collection_id, section, kind, reference, title, sort_order, created_at)
      VALUES
        ('item-1', 'pw-1', 'Foundations', 'resource', 'book:book-1#p=1-50', 'Fiqh Text', 1, '2026-11-01'),
        ('item-2', 'pw-1', 'Foundations', 'step', 'task:1', 'Read Chapter 1', 2, '2026-11-01')
    `).run();

    const pathwayProgress = service.getProgress('pathway', 'pw-1');
    assert.ok(pathwayProgress);
    assert.equal(pathwayProgress.targetKind, 'pathway');
    assert.equal(pathwayProgress.title, 'Islamic Studies Curriculum');
    assert.equal(pathwayProgress.readingCoverage.readPagesCount, 2);
    assert.equal(pathwayProgress.demonstratedKnowledge.totalCards, 2);
    assert.equal(pathwayProgress.demonstratedKnowledge.sections.length, 1);
    assert.equal(pathwayProgress.demonstratedKnowledge.sections[0].sectionName, 'Foundations');
    assert.equal(pathwayProgress.reviewsDue.dueTodayCount, 1);

    db.close();
  });
});
