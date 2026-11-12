import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { createEmptyCard, fsrs, State, type Card } from 'ts-fsrs';
import type { GradeReviewInput, ReviewQueue } from '../../shared/srs';
import { validateReview } from '../../shared/srs';

interface Schedule {
  knowledge_id: string; state: string; due_at: string; stability: number | null;
  difficulty: number | null; reps: number; lapses: number; last_review: string | null;
}
const states = ['new', 'learning', 'review', 'relearning'];
const revision = (row: Schedule) => JSON.stringify([row.state, row.due_at, row.reps, row.last_review]);

export class SrsService {
  private scheduler = fsrs({ enable_fuzz: false });
  constructor(private db: Database, private clock: () => Date = () => new Date()) {}

  private activeKnowledge(): string {
    const columns = this.db.prepare('PRAGMA table_info(knowledge)').all() as { name: string }[];
    return columns.some(column => column.name === 'deleted_at') ? ' AND k.deleted_at IS NULL' : '';
  }

  /** The FSRS card for a schedule row, resuming the exact state saved by the last review when it still matches. */
  private cardFor(row: Schedule, now: Date): Card {
    let card: Card = { ...createEmptyCard(now), due: new Date(row.due_at), state: Math.max(0, states.indexOf(row.state)) as State, stability: row.stability ?? 0, difficulty: row.difficulty ?? 0, reps: row.reps, lapses: row.lapses, last_review: row.last_review ? new Date(row.last_review) : undefined };
    const previous = this.db.prepare('SELECT state_before FROM srs_review_log WHERE knowledge_id=? ORDER BY reviewed_at DESC, rowid DESC LIMIT 1').get(row.knowledge_id) as { state_before: string | null } | undefined;
    if (previous?.state_before) {
      try {
        const saved = JSON.parse(previous.state_before).after as Card;
        if (saved && saved.reps === row.reps && new Date(saved.due).toISOString() === row.due_at) card = { ...saved, state: card.state, due: new Date(saved.due), last_review: saved.last_review ? new Date(saved.last_review) : undefined };
      } catch {}
    }
    return card;
  }

  /** KEY-234 follow-up: the review screen shows the real next interval for each rating, not fixed guesses. */
  private intervals(row: Schedule, now: Date): Partial<Record<1 | 2 | 3 | 4, number>> {
    const card = this.cardFor(row, now);
    const result: Partial<Record<1 | 2 | 3 | 4, number>> = {};
    for (const rating of [1, 2, 3, 4] as const) result[rating] = Math.max(1, Math.round((this.scheduler.next(card, now, rating).card.due.getTime() - now.getTime()) / 60000));
    return result;
  }

  queue(): ReviewQueue {
    const now = this.clock();
    const filter = `FROM srs_state s JOIN knowledge k ON k.id=s.knowledge_id JOIN card_detail c ON c.knowledge_id=k.id WHERE s.state <> 'suspended'${this.activeKnowledge()}`;
    const rows = this.db.prepare(`SELECT s.*, c.question_kind AS questionKind,c.payload_json AS payloadJson, (SELECT COALESCE(MAX(revision),0) FROM entity_version WHERE entity_type='knowledge' AND entity_id=k.id) AS cardRevision,c.front, c.back, c.source_kind AS sourceKind, c.source_ref AS sourceRef, c.source_label AS sourceLabel, c.language, k.work_id AS workId, k.created_at AS createdAt ${filter} AND s.due_at <= ? ORDER BY s.due_at,s.knowledge_id LIMIT 50`).all(now.toISOString()) as (Schedule & { questionKind: ReviewQueue['cards'][number]['questionKind']; payloadJson: string|null; cardRevision:number; front: string; back: string; sourceKind: ReviewQueue['cards'][number]['sourceKind']; sourceRef: string | null; sourceLabel: string | null; language: string | null; workId: string | null; createdAt: string })[];
    const due = (this.db.prepare(`SELECT COUNT(*) AS count ${filter} AND s.due_at <= ?`).get(now.toISOString()) as { count: number }).count;
    const nextDue = (this.db.prepare(`SELECT MIN(s.due_at) AS due ${filter} AND s.due_at > ?`).get(now.toISOString()) as { due: string | null }).due;
    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    const tomorrow = new Date(midnight); tomorrow.setDate(tomorrow.getDate() + 1);
    const reviewedToday = (this.db.prepare(`SELECT COUNT(*) AS count FROM srs_review_log r JOIN knowledge k ON k.id=r.knowledge_id WHERE r.reviewed_at >= ? AND r.reviewed_at < ?${this.activeKnowledge()}`).get(midnight.toISOString(), tomorrow.toISOString()) as { count: number }).count;
    return { cards: rows.map(row => ({ id: row.knowledge_id, questionKind:row.questionKind, payload:row.payloadJson?JSON.parse(row.payloadJson):null, cardRevision:row.cardRevision, front: row.front, back: row.back, sourceKind: row.sourceKind, sourceRef: row.sourceRef, sourceLabel: row.sourceLabel, language: row.language, workId: row.workId, createdAt: row.createdAt, memorizing: true, revision: revision(row), intervals: this.intervals(row, now) })), due, reviewedToday, nextDue };
  }

  grade(input: GradeReviewInput): ReviewQueue {
    validateReview(input);
    this.db.transaction(() => {
      const row = this.db.prepare(`SELECT s.* FROM srs_state s JOIN knowledge k ON k.id=s.knowledge_id JOIN card_detail c ON c.knowledge_id=k.id WHERE s.knowledge_id=?${this.activeKnowledge()}`).get(input.id) as Schedule | undefined;
      const now = this.clock();
      if (!row || row.state === 'suspended' || revision(row) !== input.revision || row.due_at > now.toISOString() || (row.last_review && Date.parse(row.last_review) > now.getTime())) throw new Error('review-changed');
      const card = this.cardFor(row, now);
      const next = this.scheduler.next(card, now, input.rating).card;
      this.db.prepare(`INSERT INTO srs_review_log(id,knowledge_id,reviewed_at,rating,duration_ms,state_before) VALUES(?,?,?,?,?,?)`).run(randomUUID(), input.id, now.toISOString(), input.rating, input.durationMs, JSON.stringify({ version: 1, before: card, after: next }));
      this.db.prepare(`UPDATE srs_state SET state=?, due_at=?, stability=?, difficulty=?, reps=?, lapses=?, last_review=? WHERE knowledge_id=?`).run(states[next.state], next.due.toISOString(), next.stability, next.difficulty, next.reps, next.lapses, now.toISOString(), input.id);
    })();
    return this.queue();
  }
}
