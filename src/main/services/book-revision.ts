/**
 * Baglib — book revision (KEY-398).
 *
 * - Book deck: a deck that follows a book's highlights and comments (KEY-393 live sync).
 * - Category deck: one deck for a library category, with a sub-deck per book ("Category::Title").
 * - AI questions: Q&A and multiple-choice questions written by the configured AI provider from the
 *   book's highlights and comments. Suggestions are returned to the renderer and saved nowhere until
 *   the user accepts them (ADR-013). An accepted question becomes a normal note in the book's deck,
 *   labelled as AI-generated, with the book's own text quoted verbatim and its page.
 * - "Time to revise": whether a reading-status change should offer to make a deck.
 */

import type { Database } from 'better-sqlite3';
import { CardNoteRepository } from '../database/repositories/card-note.repository';
import { DeckRepository } from '../database/repositories/deck.repository';
import type { DeckSyncService } from './deck-sync';
import {
  MAX_QUESTION_SOURCES,
  bookQuestionsPrompt,
  bookQuestionsUserPrompt,
  parseBookQuestions,
  type AcceptedQuestion,
  type BookQuestionKind,
  type BookQuestionSource,
  type BookQuestionSuggestion,
} from '../../shared/book-questions';
import { translations } from '../../renderer/translations';

/** At most this many books go into one category deck. */
export const MAX_CATEGORY_BOOKS = 200;
export const FINISHED_PROMPT_SETTING = 'revision.finishedPrompt';

const escapeHtml = (text: string) => text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/\r?\n/gu, '<br>');
/** A deck name segment: "::" would start a sub-deck. */
const deckSegment = (name: string) => name.replace(/::/gu, ':').trim().slice(0, 200) || '—';

export type Complete = (systemPrompt: string, userPrompt: string) => Promise<string>;

export class BookRevisionService {
  private notes: CardNoteRepository;
  private decks: DeckRepository;

  constructor(private db: Database, private sync: DeckSyncService) {
    this.notes = new CardNoteRepository(db);
    this.decks = new DeckRepository(db);
  }

  private title(workId: string): string {
    const row = this.db.prepare(`SELECT title FROM work WHERE id = ?`).get(workId) as { title: string } | undefined;
    if (!row) throw new Error('source-not-found');
    return row.title || '—';
  }

  /** The deck that already follows this book's highlights, if any. */
  findBookDeck(workId: string): string | null {
    const row = this.db
      .prepare(`SELECT deck_id FROM deck_subscription WHERE source_kind = 'book_highlights' AND source_ref = ? ORDER BY rowid LIMIT 1`)
      .get(workId) as { deck_id: string } | undefined;
    return row?.deck_id ?? null;
  }

  /** A deck following the book's highlights and comments; reused when one already exists. */
  async bookDeck(workId: string, parentPath?: string): Promise<{ deckId: string; added: number; created: boolean }> {
    const title = this.title(workId);
    const existing = parentPath ? null : this.findBookDeck(workId);
    const deckId = existing ?? this.decks.createDeck({ name: parentPath ? `${parentPath}::${deckSegment(title)}` : deckSegment(title) }).id;
    let added = 0;
    for (const sourceKind of ['book_highlights', 'book_comments'] as const) {
      const sub = await this.sync.subscribe({ deckId, sourceKind, sourceRef: workId, newItems: 'toast' });
      const result = await this.sync.sync(sub.id);
      added += result.added + result.linked;
    }
    return { deckId, added, created: !existing };
  }

  /** One deck for a category, with a sub-deck per book in it (books whose primary category it is). */
  async categoryDeck(categoryId: string, language: 'ar' | 'en'): Promise<{ deckId: string; books: number; added: number }> {
    const category = this.db.prepare(`SELECT name_ar, name_en FROM category WHERE id = ?`).get(categoryId) as { name_ar: string; name_en: string } | undefined;
    if (!category) throw new Error('source-not-found');
    const name = deckSegment((language === 'ar' ? category.name_ar : category.name_en) || category.name_ar || category.name_en);
    const works = this.db
      .prepare(`SELECT id FROM work WHERE primary_category_id = ? ORDER BY title COLLATE NOCASE LIMIT ?`)
      .all(categoryId, MAX_CATEGORY_BOOKS) as Array<{ id: string }>;
    if (!works.length) throw new Error('no-books');
    const deckId = this.decks.createDeck({ name }).id;
    let added = 0;
    for (const work of works) added += (await this.bookDeck(work.id, name)).added;
    return { deckId, books: works.length, added };
  }

  /** Highlights and comments with no accepted AI question yet, oldest first, labelled A1, A2… */
  questionSources(workId: string): BookQuestionSource[] {
    this.title(workId);
    const rows = this.db
      .prepare(
        `SELECT a.id, a.selected_text, a.note_content, a.location_cfi_or_page AS location
         FROM annotations a
         WHERE a.book_id = ? AND (TRIM(COALESCE(a.selected_text, '')) <> '' OR TRIM(COALESCE(a.note_content, '')) <> '')
           AND NOT EXISTS (SELECT 1 FROM card_note n WHERE n.source_ref LIKE 'ai-question:' || a.book_id || '/' || a.id || '/%')
         ORDER BY CAST(a.location_cfi_or_page AS INTEGER), a.location_cfi_or_page, a.created_at, a.id
         LIMIT ?`
      )
      .all(workId, MAX_QUESTION_SOURCES) as Array<{ id: string; selected_text: string | null; note_content: string | null; location: string }>;
    return rows.map((row, index) => ({
      label: `A${index + 1}`,
      annotationId: row.id,
      quote: (row.selected_text ?? '').trim(),
      note: (row.note_content ?? '').trim(),
      page: /^\d{1,6}$/u.test(row.location.trim()) ? Number(row.location.trim()) : null,
    }));
  }

  /** Asks the AI for questions. Nothing is saved: the suggestions go back to the renderer. */
  async generate(workId: string, language: 'ar' | 'en', kinds: BookQuestionKind[], complete: Complete): Promise<{ suggestions: BookQuestionSuggestion[]; sources: number }> {
    const sources = this.questionSources(workId);
    if (!sources.length) throw new Error('no-annotations');
    const raw = await complete(bookQuestionsPrompt(language, kinds), bookQuestionsUserPrompt(this.title(workId), sources));
    return { suggestions: parseBookQuestions(raw, sources, kinds), sources: sources.length };
  }

  /** Saves the accepted questions as notes in the book's deck (made if needed). */
  async accept(workId: string, language: 'ar' | 'en', questions: AcceptedQuestion[], deckId: string | null): Promise<{ deckId: string; added: number }> {
    const title = this.title(workId);
    const t = translations[language];
    const target = deckId ?? this.findBookDeck(workId) ?? (await this.bookDeck(workId)).deckId;
    const deck = this.decks.getDeck(target);
    if (!deck || deck.kind !== 'normal') throw new Error('invalid-request');
    const annotation = this.db.prepare(`SELECT selected_text, note_content, location_cfi_or_page AS location FROM annotations WHERE id = ? AND book_id = ?`);
    let added = 0;
    this.db.transaction(() => {
      for (const q of questions) {
        const row = annotation.get(q.annotationId, workId) as { selected_text: string | null; note_content: string | null; location: string } | undefined;
        if (!row) throw new Error('invalid-request');
        const quote = (row.selected_text ?? '').trim() || (row.note_content ?? '').trim();
        const page = /^\d{1,6}$/u.test(row.location.trim()) ? row.location.trim() : null;
        const where = page ? `${escapeHtml(title)} — ${escapeHtml(t.bookQuestionPage.replace('{page}', page))}` : escapeHtml(title);
        const source = `<blockquote class="source-quote" dir="auto">${escapeHtml(quote)}</blockquote>\n<div class="source-location" dir="auto">${where}</div>\n<div class="ai-label">${escapeHtml(t.bookQuestionAiLabel)}</div>`;
        const n = (this.db.prepare(`SELECT COUNT(*) AS n FROM card_note WHERE source_ref LIKE ?`).get(`ai-question:${workId}/${q.annotationId}/%`) as { n: number }).n + 1;
        const sourceRef = `ai-question:${workId}/${q.annotationId}/${n}`;
        if (q.kind === 'choice' && q.options && q.correctIndex !== undefined) {
          const options = q.options.map((o, i) => `<li${i === q.correctIndex ? ' class="correct"' : ''} dir="auto">${escapeHtml(o)}</li>`).join('');
          const { note } = this.notes.saveNote({
            noteTypeId: 'stock-multiple-choice',
            fields: { Front: `<div dir="auto">${escapeHtml(q.question)}</div>`, Back: `<ol class="choices">${options}</ol>\n<div dir="auto">${escapeHtml(q.answer)}</div>\n${source}` },
            sourceRef,
            deckId: target,
            tags: ['ai-generated'],
          });
          this.db.prepare(`UPDATE card_detail SET payload_json = ? WHERE note_id = ?`).run(JSON.stringify({ options: q.options, correctIndex: q.correctIndex }), note.id);
        } else {
          this.notes.saveNote({
            noteTypeId: 'stock-basic',
            fields: { Front: `<div dir="auto">${escapeHtml(q.question)}</div>`, Back: `<div dir="auto">${escapeHtml(q.answer)}</div>\n${source}` },
            sourceRef,
            deckId: target,
            tags: ['ai-generated'],
          });
        }
        added += 1;
      }
    })();
    return { deckId: target, added };
  }
}

/** True when a reading-status change finishes the book (and it was not finished already). */
export function finishesBook(before: string | null | undefined, after: string | null | undefined): boolean {
  return after === 'completed' && before !== 'completed';
}
