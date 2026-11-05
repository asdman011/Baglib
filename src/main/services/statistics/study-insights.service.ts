import type Database from 'better-sqlite3';
import { civilDate } from '../../../shared/study-planner';
import { validateStudyPreferences, type StudyInsights, type StudyPreferences, type WordFrequency } from '../../../shared/study-insights';
import { normalizeArabicText } from '../../../shared/utils/text-normalizer';

const preferencesKey = 'dashboard.study.preferences.v1';
interface TimeRow { started: string | number; seconds: number; pages: number; ar: string | null; en: string | null }

export class StudyInsightsService {
  constructor(private readonly db: Database.Database) {}

  preferences(): StudyPreferences {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key=?').get(preferencesKey) as { value: string } | undefined;
    if (!row) return { dailyMinutes: 0, dailyPages: 0, taskOrder: [] };
    return validateStudyPreferences(JSON.parse(row.value));
  }

  savePreferences(raw: unknown): StudyPreferences {
    const value = validateStudyPreferences(raw);
    this.db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(preferencesKey, JSON.stringify(value));
    return value;
  }

  summary(now = new Date()): StudyInsights {
    const sessions = this.db.prepare(`SELECT session.started_at AS started, (julianday(session.ended_at)-julianday(session.started_at))*86400 AS seconds, COALESCE(session.pages_read,0) AS pages, category.name_ar AS ar, category.name_en AS en FROM reading_session session LEFT JOIN work ON work.id=session.work_id LEFT JOIN category ON category.id=work.primary_category_id WHERE session.started_at IS NOT NULL AND session.ended_at IS NOT NULL AND julianday(session.ended_at)>julianday(session.started_at) ORDER BY session.started_at DESC LIMIT 100001`).all() as TimeRow[];
    const dwell = sessions.length ? [] : this.db.prepare(`SELECT page.start_time AS started,page.duration AS seconds,1 AS pages,book.subject AS ar,book.subject AS en FROM reading_page_stat page JOIN reading_book_stat book ON book.id=page.id_book WHERE page.duration>0 ORDER BY page.start_time DESC LIMIT 100001`).all() as TimeRow[];
    const source = sessions.length ? sessions : dwell;
    const rows = source.slice(0, 100000);
    const days: StudyInsights['days'] = [];
    for (let offset = 6; offset >= 0; offset--) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 12);
      days.push({ date: civilDate(day), seconds: 0, pages: 0 });
    }
    const subjects = new Map<string, StudyInsights['subjects'][number]>();
    let seconds = 0; let pages = 0;
    for (const row of rows) {
      const duration = Math.round(Number(row.seconds));
      const readPages = Math.max(0, Math.floor(Number(row.pages) || 0));
      if (!Number.isFinite(duration) || duration <= 0) continue;
      seconds += duration; pages += readPages;
      const key = JSON.stringify([row.ar, row.en]);
      const subject = subjects.get(key) || { ar: row.ar, en: row.en, seconds: 0 };
      subject.seconds += duration; subjects.set(key, subject);
      const date = typeof row.started === 'number' ? new Date(row.started * 1000) : new Date(row.started);
      if (Number.isNaN(date.getTime())) continue;
      const day = days.find(item => item.date === civilDate(date));
      if (day) { day.seconds += duration; day.pages += readPages; }
    }
    const count = (sql: string) => Number((this.db.prepare(sql).get() as { count: number }).count);
    const reflections: StudyInsights['reflections'] = [];
    const modern = this.db.prepare('SELECT k.id,s.title,s.content FROM knowledge k JOIN study_note_detail s ON s.knowledge_id=k.id WHERE k.deleted_at IS NULL ORDER BY k.updated_at DESC LIMIT 10').all() as {id:string;title:string;content:string}[];
    reflections.push(...modern.map(note=>({...note,content:note.content.slice(0,300)})));
    const noteRows = this.db.prepare("SELECT key,value FROM app_settings WHERE key LIKE 'study.note.v1:%' AND NOT EXISTS(SELECT 1 FROM app_settings marker WHERE marker.key='study.note.converted:' || substr(app_settings.key,15)) ORDER BY updated_at DESC LIMIT 10").all() as { key: string; value: string }[];
    for (const row of noteRows) {
      try {
        const note = JSON.parse(row.value) as Record<string, unknown>;
        if (typeof note.id === 'string' && typeof note.content === 'string') reflections.push({ id: note.id, title: typeof note.title === 'string' ? note.title : '', content: note.content.slice(0, 300) });
      } catch {}
    }
    return {
      timeSource: sessions.length ? 'sessions' : dwell.length ? 'dwell' : 'none', seconds, pages,
      sessionCount: sessions.length ? rows.length : null,
      secondsPerPage: pages ? seconds / pages : null,
      secondsPerSession: sessions.length ? seconds / rows.length : null,
      subjects: [...subjects.values()].sort((first, second) => second.seconds - first.seconds), days,
      knowledge: count('SELECT COUNT(*) AS count FROM knowledge WHERE deleted_at IS NULL'),
      ideas: count("SELECT COUNT(*) AS count FROM knowledge WHERE knowledge_type='question' AND deleted_at IS NULL"),
      completedTasks: count("SELECT COUNT(*) AS count FROM study_task WHERE status='completed'"),
      totalTasks: count('SELECT COUNT(*) AS count FROM study_task'), reflections,
      edits: this.db.prepare('SELECT id,knowledge_type AS kind,updated_at AS updatedAt FROM knowledge WHERE updated_at IS NOT NULL AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 10').all() as StudyInsights['edits'],
      partial: source.length > 100000,
    };
  }

  async words(bookId?: string): Promise<WordFrequency> {
    if (bookId !== undefined && (typeof bookId !== 'string' || !bookId || bookId.length > 180)) throw new Error('invalid-request');
    const frequencies = new Map<string, number>();
    let cursor = 0; let characters = 0; let indexedPages = 0; let partial = false;
    while (true) {
      const rows = this.db.prepare(`SELECT rowid,substr(content,1,200001) AS content FROM book_content_fts WHERE rowid>? ${bookId ? 'AND book_id=?' : ''} ORDER BY rowid LIMIT 20`).all(cursor, ...(bookId ? [bookId] : [])) as { rowid: number; content: string }[];
      if (!rows.length) break;
      for (const row of rows) {
        cursor = row.rowid;
        const available = Math.max(0, Math.min(200000, 2000000 - characters));
        const content = (row.content || '').slice(0, available);
        partial ||= content.length < (row.content || '').length;
        characters += content.length; indexedPages++;
        const sample = content.length < (row.content || '').length && /[\p{L}\p{M}]/u.test((row.content || '')[content.length] || '') ? content.replace(/[\p{L}\p{M}]+$/u, '') : content;
        const normalized = normalizeArabicText(sample, { normalizeTaaMarbuta: false, normalizeWawHamza: false, normalizeYaaHamza: false });
        for (const match of normalized.matchAll(/[\p{L}\p{M}]+/gu)) frequencies.set(match[0], (frequencies.get(match[0]) || 0) + 1);
        if (characters >= 2000000 || indexedPages >= 5000) { partial = true; break; }
      }
      if (characters >= 2000000 || indexedPages >= 5000) break;
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    return { words: [...frequencies].map(([word, count]) => ({ word, count })).sort((first, second) => second.count - first.count || first.word.localeCompare(second.word)).slice(0, 50), partial, indexedPages };
  }
}
