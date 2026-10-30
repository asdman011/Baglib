import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { PoetryDetail, PoetrySaveInput, PoetrySavedItem } from '../../../shared/types/poetry';
import { studyLinkText, studyLinks, validStudyTarget } from '../../../shared/study-notes';

export function validatePoetrySave(input: unknown): asserts input is PoetrySaveInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid-poetry-knowledge');
  const value = input as PoetrySaveInput;
  if (!Number.isSafeInteger(value.poemId) || value.poemId < 1 || !Number.isSafeInteger(value.from) || !Number.isSafeInteger(value.to) || value.from < 0 || value.to < value.from || value.to > 100000 || !['note', 'quote', 'bookmark'].includes(value.type) || (value.note !== undefined && (typeof value.note !== 'string' || value.note.length > 50000))) throw new Error('invalid-poetry-knowledge');
}

export class PoetryKnowledgeService {
  constructor(private database: Database.Database) {}

  save(input: PoetrySaveInput, poem: PoetryDetail): PoetrySavedItem {
    validatePoetrySave(input);
    const verses: unknown = JSON.parse(poem.verses_json);
    if (input.poemId !== poem.id || !Array.isArray(verses) || verses.some(value => typeof value !== 'string') || input.to >= verses.length) throw new Error('invalid-poetry-range');
    const selected = (verses as string[]).slice(input.from, input.to + 1);
    const text = poem.language === 'ar' && poem.layout_type === 'bayt' ? selected.map((line, index) => `${index === 0 ? '' : (input.from + index - 1) % 2 === 0 ? ' *** ' : '\n'}${line}`).join('') : selected.join('\n');
    if (text.length > 1000000) throw new Error('poetry-selection-too-large');
    const reference = `poetry:ashaar:${poem.id}:${input.from}:${input.to}`;
    const label = poem.title || poem.poet_name;
    const citation = [poem.poet_name, poem.title, poem.meter].filter(Boolean).join(' — ');
    const note = input.type === 'bookmark' ? null : input.note || null;
    const id = randomUUID(), createdAt = new Date().toISOString();
    const item: PoetrySavedItem = { id, type: input.type, reference, label, text: input.type === 'bookmark' ? null : text, note, createdAt };
    this.database.transaction(() => {
      this.database.prepare('INSERT INTO knowledge(id,work_id,edition_id,source_id,knowledge_type,location,created_at,updated_at) VALUES(?,NULL,NULL,NULL,?,?,?,?)').run(id, input.type, reference, createdAt, createdAt);
      if (input.type === 'note') this.database.prepare('INSERT INTO note_detail(knowledge_id,content) VALUES(?,?)').run(id, `${studyLinkText(reference, label)}\n${text}\n${citation}${note ? `\n\n${note}` : ''}`);
      if (input.type === 'quote') this.database.prepare('INSERT INTO quote_detail(knowledge_id,quoted_text,context_note) VALUES(?,?,?)').run(id, text, `${citation}${note ? `\n\n${note}` : ''}`);
      if (input.type === 'bookmark') this.database.prepare('INSERT INTO bookmark_detail(knowledge_id,label) VALUES(?,?)').run(id, label);
    })();
    return item;
  }

  list(offset = 0): { items: PoetrySavedItem[]; next: number | null } {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new Error('invalid-poetry-query');
    const rows = this.database.prepare(`SELECT k.id,k.knowledge_type AS type,k.location AS reference,k.created_at AS createdAt,
      COALESCE(b.label,'') AS label,q.quoted_text AS text,COALESCE(n.content,q.context_note) AS note
      FROM knowledge k LEFT JOIN note_detail n ON n.knowledge_id=k.id LEFT JOIN quote_detail q ON q.knowledge_id=k.id
      LEFT JOIN bookmark_detail b ON b.knowledge_id=k.id
      WHERE k.work_id IS NULL AND k.location LIKE 'poetry:ashaar:%' AND k.knowledge_type IN ('note','quote','bookmark')
      ORDER BY k.created_at DESC,k.id DESC LIMIT 41 OFFSET ?`).all(offset) as PoetrySavedItem[];
    return { items: rows.slice(0, 40).filter(row => validStudyTarget(row.reference)).map(row => ({ ...row, label: row.label || studyLinks(row.note || '')[0]?.label || row.note?.split('\n')[0] || row.reference })), next: rows.length > 40 ? offset + 40 : null };
  }
}
