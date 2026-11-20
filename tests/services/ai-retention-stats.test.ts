import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { KnowledgeCardRepository } from '../../src/main/database/repositories/knowledge-card.repository';
import { workspaceStatistics } from '../../src/main/services/statistics/workspace-statistics.service';
import { translations } from '../../src/renderer/translations';

test('KEY-444: workspaceStatistics compares retention of ai-generated cards vs other cards using existing FSRS data', () => {
  const db = createTestDatabase();
  try {
    const empty = workspaceStatistics(db);
    assert.ok(empty.aiRetention);
    assert.equal(empty.aiRetention.aiAssisted.cards, 0);
    assert.equal(empty.aiRetention.other.cards, 0);
    assert.equal(empty.aiRetention.aiAssisted.recallRate, null);
    assert.equal(empty.aiRetention.minimumRecommendedSample, 10);

    const repo = new KnowledgeCardRepository(db);
    const aiCard = repo.save({
      front: 'AI Front',
      back: 'AI Back',
      sourceKind: 'note',
      sourceRef: 'note:n1',
      tags: ['ai-generated'],
    });
    const userCard = repo.save({
      front: 'User Front',
      back: 'User Back',
      sourceKind: 'note',
      sourceRef: 'note:n2',
    });

    const now = new Date().toISOString();
    db.prepare(`INSERT INTO srs_state (knowledge_id, state, due_at, stability, difficulty, reps, lapses, last_review) VALUES (?, 'review', ?, ?, 5, ?, ?, ?)`)
      .run(aiCard.id, now, 12.5, 4, 1, now);
    db.prepare(`INSERT INTO srs_state (knowledge_id, state, due_at, stability, difficulty, reps, lapses, last_review) VALUES (?, 'review', ?, ?, 5, ?, ?, ?)`)
      .run(userCard.id, now, 20.0, 4, 0, now);

    db.prepare(`INSERT INTO srs_review_log (id, knowledge_id, reviewed_at, rating, duration_ms, state_before) VALUES ('r1', ?, ?, 3, 1000, 'review')`).run(aiCard.id, now);
    db.prepare(`INSERT INTO srs_review_log (id, knowledge_id, reviewed_at, rating, duration_ms, state_before) VALUES ('r2', ?, ?, 1, 1000, 'review')`).run(aiCard.id, now);
    db.prepare(`INSERT INTO srs_review_log (id, knowledge_id, reviewed_at, rating, duration_ms, state_before) VALUES ('r3', ?, ?, 3, 1000, 'review')`).run(userCard.id, now);

    const stats = workspaceStatistics(db);
    const ai = stats.aiRetention!.aiAssisted;
    const other = stats.aiRetention!.other;

    assert.equal(ai.cards, 1);
    assert.equal(ai.reviewedCards, 1);
    assert.equal(ai.reviews, 2);
    assert.equal(ai.retainedReviews, 1);
    assert.equal(ai.recallRate, 0.5);
    assert.equal(ai.avgStability, 12.5);
    assert.equal(ai.totalLapses, 1);
    assert.equal(ai.avgLapses, 1);

    assert.equal(other.cards, 1);
    assert.equal(other.reviewedCards, 1);
    assert.equal(other.reviews, 1);
    assert.equal(other.retainedReviews, 1);
    assert.equal(other.recallRate, 1);
    assert.equal(other.avgStability, 20);
    assert.equal(other.totalLapses, 0);
    assert.equal(other.avgLapses, 0);
  } finally {
    db.close();
  }
});

test('KEY-444: ar and en translations include sample-size note and try-first nudge without summary memory claims', () => {
  for (const lang of ['ar', 'en'] as const) {
    assert.ok(translations[lang].statisticsAiRetentionTitle);
    assert.ok(translations[lang].statisticsAiRetentionSmallSample.includes('{aiCards}'));
    assert.ok(translations[lang].statisticsAiRetentionSampleNote.includes('{otherCards}'));
    assert.ok(translations[lang].pdfDigestTryFirstTitle);
    assert.ok(translations[lang].pdfDigestTryFirstSkip);
    assert.doesNotMatch(translations[lang].statisticsAiRetentionSmallSample, /faster summar/i);
    assert.doesNotMatch(translations[lang].statisticsAiRetentionSampleNote, /faster summar/i);
  }
});
