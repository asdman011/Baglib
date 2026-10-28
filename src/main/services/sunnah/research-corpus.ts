import Database from 'better-sqlite3';
import { existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { SunnahCatalog, SunnahChapter, SunnahCollectionId, SunnahHadith, SunnahResearch, SunnahResearchNode, SunnahResearchQuery, SunnahSearchHit } from '../../../shared/types/sunnah';
import { normalizeArabicText } from '../../../shared/utils/text-normalizer';

const collections: Record<string, SunnahCollectionId> = { Bukhari: 'Bukhari', Muslim: 'Muslim', AbuDaud: 'AbuDaud', Tirmidhi: 'Tirmizi', Nesai: 'Nesai', IbnMajah: 'IbnMaja', MuwattaMalik: 'MuwattaMalik', MusnadAhmad: 'MusnadAhmad', SunanDarimi: 'SunanDarimi' };
type Row = Record<string, string | number | null>;
const chapterExpr = 'CAST(COALESCE(NULLIF(Chapter_Number,\'\'),\'0\') AS INTEGER)';
const baseColumns = 'id,book_key,Chapter_Number,Chapter_Arabic,Chapter_English,Section_Number,Section_Arabic,Section_English,Hadith_number,Arabic_Hadith,Arabic_Isnad,Arabic_Matn,English_Hadith,English_Isnad,English_Matn,Arabic_Comment,Arabic_Grade,English_Grade';
function value(value: Row[string]): string { return value == null || /^(nan|null|none)$/i.test(String(value)) ? '' : String(value); }
function num(value: Row[string]): string { return value == null ? '' : String(value).replace(/\.0+$/, ''); }

/** Read-only adapter over the existing derived corpus. Never opens baglib.db. */
export class SunnahResearchCorpus {
  private db: Database.Database;
  readonly catalog: SunnahCatalog;
  constructor(filename: string) {
    this.db = new Database(filename, { readonly: true, fileMustExist: true });
    try {
      this.db.pragma('query_only = ON');
      const fields = this.db.pragma('table_info(hadiths)') as { name: string }[];
      for (const field of ['Arabic_Tafseel', 'Itqan_Narrator_Chain_JSON', 'Itqan_Quran_Root_Links_JSON']) {
        if (!fields.some(item => item.name === field)) throw new Error('Not a master Sunnah corpus');
      }
      const summaries = this.db.prepare(`SELECT book_key,${chapterExpr} AS chapter,Chapter_Arabic,Chapter_English,COUNT(*) AS count FROM hadiths GROUP BY book_key,${chapterExpr} ORDER BY chapter`).all() as Row[];
      const info = statSync(filename);
      const fingerprint = createHash('sha256').update(JSON.stringify([info.size, info.mtimeMs, summaries])).digest('hex');
      this.catalog = { version: 1, sha256: fingerprint, importedAt: info.mtime.toISOString(), hadithCount: 0, research: true, collections: [] };
      for (const [key, id] of Object.entries(collections)) {
        const chapters = summaries.filter(row => row.book_key === key).map(row => ({ number: Number(row.chapter), title: { ar: value(row.Chapter_Arabic), en: value(row.Chapter_English) }, hadithCount: Number(row.count) }));
        if (!chapters.length) continue;
        const hadithCount = chapters.reduce((sum, chapter) => sum + chapter.hadithCount, 0);
        this.catalog.collections.push({ id, chapters, hadithCount });
        this.catalog.hadithCount += hadithCount;
      }
      if (!this.catalog.hadithCount) throw new Error('Empty master Sunnah corpus');
    } catch (error) { this.db.close(); throw error; }
  }
  close(): void { this.db.close(); }
  private key(collection: SunnahCollectionId): string {
    const key = Object.keys(collections).find(key => collections[key] === collection);
    if (!key) throw new Error('Invalid collection');
    return key;
  }
  private record(row: Row, position?: number): SunnahHadith {
    const collection = collections[String(row.book_key)];
    const chapter = Number(row.Chapter_Number || 0);
    // Preserve original six-book chapter/row identities used by notes and links.
    const ordinal = position ?? (this.db.prepare(`SELECT COUNT(*) AS n FROM hadiths WHERE book_key=? AND ${chapterExpr}=? AND id<=?`).get(row.book_key, chapter, row.id) as { n: number }).n;
    return { id: `${collection}:${chapter}:${ordinal}`, researchId: Number(row.id), number: num(row.Hadith_number),
      section: { number: num(row.Section_Number), title: { ar: value(row.Section_Arabic), en: value(row.Section_English) } },
      text: { ar: { full: value(row.Arabic_Hadith), isnad: value(row.Arabic_Isnad), matn: value(row.Arabic_Matn) }, en: { full: value(row.English_Hadith), isnad: value(row.English_Isnad), matn: value(row.English_Matn) } },
      comment: value(row.Arabic_Comment), grade: { ar: value(row.Arabic_Grade), en: value(row.English_Grade) } };
  }
  chapter(collection: SunnahCollectionId, number: number): SunnahChapter {
    if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid chapter');
    const summary = this.catalog.collections.find(item => item.id === collection)?.chapters.find(item => item.number === number);
    if (!summary) throw new Error('Missing chapter');
    const rows = this.db.prepare(`SELECT ${baseColumns} FROM hadiths WHERE book_key=? AND ${chapterExpr}=? ORDER BY id`).all(this.key(collection), number) as Row[];
    return { ...summary, collection, hadiths: rows.map((row, index) => this.record(row, index + 1)) };
  }
  private hit(row: Row): SunnahSearchHit {
    const collection = collections[String(row.book_key)], number = Number(row.Chapter_Number || 0);
    const summary = this.catalog.collections.find(item => item.id === collection)!.chapters.find(item => item.number === number)!;
    return { chapter: { ...summary, collection }, hadith: this.record(row) };
  }
  search(query: SunnahResearchQuery): SunnahSearchHit[] {
    if (!query || typeof query !== 'object') throw new Error('Invalid search');
    const clauses: string[] = [], params: (string | number)[] = [];
    let exactTerms: string[] = [];
    const conservative = (text: string) => normalizeArabicText(text, { normalizeTaaMarbuta: false, normalizeWawHamza: false, normalizeYaaHamza: false }).replace(/[^\p{L}\p{N}\s]/gu, ' ');
    if (query.text !== undefined) {
      if (typeof query.text !== 'string' || query.text.length > 500) throw new Error('Invalid search text');
      // Match the pipeline's temporary FTS normalization; canonical text is untouched.
      const terms = normalizeArabicText(query.text.replace(/[ؤئ]/g, 'ء')).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 20);
      if (!terms.length) return [];
      if (/^\d+$/.test(query.text.trim())) {
        clauses.push('Hadith_number IN (?,?)'); params.push(query.text.trim(), query.text.trim() + '.0');
      } else {
        exactTerms = conservative(query.text).split(/\s+/).filter(Boolean);
        clauses.push('id IN (SELECT rowid FROM hadiths_fts WHERE hadiths_fts MATCH ?)');
        params.push(terms.map(term => `"${term}"`).join(' AND '));
      }
    }
    if (query.collection) { clauses.push('book_key=?'); params.push(this.key(query.collection)); }
    if (query.chapter !== undefined) {
      if (!Number.isSafeInteger(query.chapter) || query.chapter < 0) throw new Error('Invalid chapter');
      clauses.push(`${chapterExpr}=?`); params.push(query.chapter);
    }
    if (query.root !== undefined) {
      if (typeof query.root !== 'string' || query.root.length > 20) throw new Error('Invalid root');
      clauses.push('id IN (SELECT hadith_id FROM quran_hadith_root_bridge WHERE root_ar=?)'); params.push(query.root);
    }
    if (query.narratorId !== undefined) {
      if (typeof query.narratorId !== 'string' || !/^\d{1,20}$/.test(query.narratorId)) throw new Error('Invalid narrator');
      clauses.push('id IN (SELECT hadith_id FROM hadith_narrators WHERE rijal_id=?)'); params.push(query.narratorId);
    }
    if (!clauses.length) return [];
    const candidates = this.db.prepare(`SELECT ${baseColumns},Arabic_Tafseel FROM hadiths WHERE ${clauses.join(' AND ')} ORDER BY id LIMIT 201`).all(...params) as Row[];
    // The historical index folds ة/ه; verify against preserved text so ambiguous
    // substitutions cannot become false positive UI results.
    return candidates.filter(row => {
      if (!exactTerms.length) return true;
      const text = conservative([row.Arabic_Matn, row.Arabic_Tafseel, row.English_Hadith, row.Chapter_Arabic, row.Section_Arabic].map(value).join(' '));
      return exactTerms.every(term => text.includes(term));
    }).map(row => this.hit(row));
  }
  research(id: number): SunnahResearch {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid hadith identity');
    const row = this.db.prepare('SELECT * FROM hadiths WHERE id=?').get(id) as Row | undefined;
    if (!row) throw new Error('Missing hadith');
    const links = JSON.parse(value(row.Itqan_Corroborating_Hadiths_JSON) || '[]') as { book: string; hadith_number: string; output_row_index?: number }[];
    const related: SunnahSearchHit[] = [];
    for (const link of links.slice(0, 5)) {
      // Repeated edition references stay distinct; output row index is the identity.
      const target = link.output_row_index === undefined ? undefined : this.db.prepare(`SELECT ${baseColumns} FROM hadiths ORDER BY id LIMIT 1 OFFSET ?`).get(link.output_row_index) as Row | undefined;
      if (target && target.book_key === link.book && String(target.Hadith_number) === String(link.hadith_number)) related.push(this.hit(target));
    }
    return { commentary: value(row.Arabic_Tafseel), title: value(row.Commentary_Book_Title), author: value(row.Commentary_Author), reference: value(row.Source_Row_Reference), volume: value(row.Shamela_Volume), page: value(row.Shamela_Page), sourceUrl: value(row.Commentary_Shamela_URL), method: value(row.Tafseel_Match_Method), score: Number(row.Tafseel_Match_Score), nodes: JSON.parse(value(row.Itqan_Narrator_Chain_JSON) || '[]') as SunnahResearchNode[], roots: JSON.parse(value(row.Itqan_Quran_Root_Links_JSON) || '[]') as string[], ayahs: JSON.parse(value(row.Itqan_Linked_Ayah_Keys_JSON) || '[]') as string[], calibration: Number(row.Itqan_Chain_Calibration_Score), weakest: value(row.Itqan_Weakest_Narrator_Grade), related };
  }
}

export function discoverResearchCorpus(paths: string[]): SunnahResearchCorpus | null {
  const filename = paths.find(filename => existsSync(filename));
  return filename ? new SunnahResearchCorpus(filename) : null;
}
