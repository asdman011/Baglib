import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { SqliteKnowledgeRepository } from '../database/repositories/knowledge.repository';
import { headRevision, trashKnowledge } from './knowledge-history';
import { normalizeArabicLetters, stripArabicDiacritics } from '../../shared/utils/lookup-candidates';
import { commentaryReferenceKey } from '../../shared/personal-commentary';
import type { CommentaryEntry, CommentaryInput, CommentaryKind } from '../../shared/personal-commentary';

const PREFIX = 'commentary:';
const SEARCH_LIMIT = 200;
const SELECT = `SELECT k.id, k.location, k.created_at AS createdAt, k.updated_at AS updatedAt, n.content AS text
  FROM knowledge k JOIN note_detail n ON n.knowledge_id = k.id WHERE k.deleted_at IS NULL AND k.location LIKE ?`;

interface Row { id: string; location: string; createdAt: string; updatedAt: string; text: string }
const searchForm = (text: string) => normalizeArabicLetters(stripArabicDiacritics(text.toLowerCase()));

/** Commentary is a `knowledge` note located on a source, so canonical text is never touched and history comes with it. */
export class PersonalCommentaryService {
  constructor(private db: Database) {}

  private entry = ({ location, ...row }: Row): CommentaryEntry => {
    const end = location.lastIndexOf(':');
    return { ...row, reference: location.slice(PREFIX.length, end), kind: location.slice(end + 1) as CommentaryKind, revision: headRevision(this.db, row.id) };
  };

  list(reference: string): CommentaryEntry[] {
    const canonical = commentaryReferenceKey(reference);
    const legacy = canonical.startsWith('quran:hafs:') ? canonical.replace('quran:hafs:', 'quran:') : canonical;
    const query = SELECT.replace('k.location LIKE ?', '(k.location LIKE ? OR k.location LIKE ?)');
    return (this.db.prepare(query + ' ORDER BY k.created_at DESC').all(PREFIX + canonical + ':%', PREFIX + legacy + ':%') as Row[])
      .map(row => ({ ...this.entry(row), reference }));
  }

  /** Stored text stays as written; only the compared form drops diacritics. */
  search(query: string): CommentaryEntry[] {
    const term = searchForm(query.trim());
    if (!term) return [];
    return (this.db.prepare(`${SELECT} ORDER BY k.updated_at DESC`).all(`${PREFIX}%`) as Row[])
      .filter(row => searchForm(row.text).includes(term)).slice(0, SEARCH_LIMIT).map(this.entry);
  }

  private owned(id: string): CommentaryEntry | undefined {
    const row = this.db.prepare(`${SELECT} AND k.id = ?`).get(`${PREFIX}%`, id) as Row | undefined;
    return row && this.entry(row);
  }

  save(input: CommentaryInput): void {
    if (input.id) {
      const previous = this.owned(input.id);
      if (!previous || commentaryReferenceKey(previous.reference) !== commentaryReferenceKey(input.reference)) throw new Error('invalid-request');
    }
    new SqliteKnowledgeRepository(this.db).saveKnowledge({
      id: input.id || randomUUID(), workId: null, knowledgeType: 'note', location: `${PREFIX}${input.reference}:${input.kind}`,
      noteContent: input.text, expectedRevision: input.expectedRevision,
    });
  }

  remove(id: string): boolean {
    return Boolean(this.owned(id)) && trashKnowledge(this.db, id);
  }
}
