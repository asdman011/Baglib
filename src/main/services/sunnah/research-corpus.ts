import Database from 'better-sqlite3';
import { existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { SunnahStatistics, SunnahCatalog, SunnahChapter, SunnahCollectionId, SunnahExplanation, SunnahFieldSource, SunnahGradingJudgment, SunnahHadith, SunnahLanguage, SunnahMergedResearch, SunnahNarrator, SunnahNarratorLink, SunnahResearch, SunnahResearchNode, SunnahResearchQuery, SunnahSearchHit, SunnahVariantText } from '../../../shared/types/sunnah';
import { normalizeArabicText } from '../../../shared/utils/text-normalizer';

const collections: Record<string, SunnahCollectionId> = { Bukhari: 'Bukhari', Muslim: 'Muslim', AbuDaud: 'AbuDaud', Tirmidhi: 'Tirmizi', Nesai: 'Nesai', IbnMajah: 'IbnMaja', MuwattaMalik: 'MuwattaMalik', MusnadAhmad: 'MusnadAhmad', SunanDarimi: 'SunanDarimi', Nawawi40: 'Nawawi40', Qudsi40: 'Qudsi40', Dehlawi40: 'Dehlawi40', HadeethEnc: 'HadeethEnc', SourceOnly: 'SourceOnly', ReviewQueue: 'ReviewQueue' };
type Row = Record<string, string | number | null>;
const chapterExpr = 'CAST(COALESCE(NULLIF(Chapter_Number,\'\'),\'0\') AS INTEGER)';
const baseColumns = 'id,book_key,Chapter_Number,Chapter_Arabic,Chapter_English,Section_Number,Section_Arabic,Section_English,Hadith_number,Arabic_Hadith,Arabic_Isnad,Arabic_Matn,English_Hadith,English_Isnad,English_Matn,Arabic_Comment,Arabic_Grade,English_Grade';
function value(value: Row[string]): string { return value == null || /^\s*(nan|null|none)?\s*$/i.test(String(value)) ? '' : String(value); }
/** The rijal source uses a lone hyphen for "nothing recorded". */
function detail(field: Row[string]): string { const text = value(field).trim(); return text === '-' ? '' : text; }
const narratorLinkLimit = 40;
function num(field: Row[string]): string { return value(field).replace(/\.0+$/, ''); }
const supportedMergeSchema = 1;
const blanketGradeCollections = new Set(['Bukhari', 'Muslim']);
// A variant covers only part of the corpus row when the row holds several reports.
const partialRelations = new Set(['corpus_extends_source', 'corpus_contains_report']);
const variantQuery = `SELECT c.source_key,c.relation,c.full_score,c.english_similarity,r.config,r.text,s.license,s.attribution
  FROM hadith_crosswalk c JOIN quranlab_records r ON r.source_key=c.source_key AND r.language='en' JOIN source_registry s ON s.source_id='ql:'||r.config
  WHERE c.hadith_id=? AND c.decision='verified_match' AND c.collection<>'hadeethenc' ORDER BY c.crosswalk_id`;

/** Read-only adapter over the existing derived corpus. Never opens baglib.db. */
export class SunnahResearchCorpus {
  private db: Database.Database;
  private hasRootWords = false;
  private merged = false;
  private hasSourceBooks = false;
  private stats?: Promise<SunnahStatistics>;
  readonly catalog: SunnahCatalog;
  constructor(filename: string) {
    this.db = new Database(filename, { readonly: true, fileMustExist: true });
    try {
      this.db.pragma('query_only = ON');
      const fields = this.db.pragma('table_info(hadiths)') as { name: string }[];
      for (const field of ['Arabic_Tafseel', 'Itqan_Narrator_Chain_JSON', 'Itqan_Quran_Root_Links_JSON']) {
        if (!fields.some(item => item.name === field)) throw new Error('Not a master Sunnah corpus');
      }
      // A corpus attached by the user may predate the matched-word column.
      this.hasRootWords = (this.db.pragma('table_info(quran_hadith_root_bridge)') as { name: string }[]).some(item => item.name === 'matched_words_json');
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
      // Merged tables are additive, so an unknown schema still reads as the base corpus.
      if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='merge_metadata'").get()) {
        const meta = Object.fromEntries((this.db.prepare('SELECT key,value FROM merge_metadata').all() as { key: string; value: string }[]).map(row => [row.key, row.value]));
        if (meta.schema_kind === 'baglib-sunnah-merged' && Number(meta.merge_schema_version) === supportedMergeSchema) {
          this.merged = true;
          this.hasSourceBooks = Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='source_book_rows'").get());
          this.catalog.merged = { schemaVersion: supportedMergeSchema, revision: meta.quranlab_revision };
        }
      }
    } catch (error) { this.db.close(); throw error; }
  }
  close(): void { this.db.close(); }
  private variants(id: number): Row[] { return this.db.prepare(variantQuery).all(id) as Row[]; }
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
    const hadith: SunnahHadith = { id: `${collection}:${chapter}:${ordinal}`, researchId: Number(row.id), number: num(row.Hadith_number),
      section: { number: num(row.Section_Number), title: { ar: value(row.Section_Arabic), en: value(row.Section_English) } },
      text: { ar: { full: value(row.Arabic_Hadith), isnad: value(row.Arabic_Isnad), matn: value(row.Arabic_Matn) }, en: { full: value(row.English_Hadith), isnad: value(row.English_Isnad), matn: value(row.English_Matn) } },
      comment: value(row.Arabic_Comment), grade: { ar: value(row.Arabic_Grade), en: value(row.English_Grade) } };
    if (!this.merged) return hadith;
    if (this.hasSourceBooks && Number(row.id) > 0) {
      const place = this.db.prepare('SELECT kind,source_collection FROM source_book_rows WHERE hadith_id=?').get(row.id) as Row | undefined;
      if (place) hadith.sourceBook = { kind: String(place.kind) as NonNullable<SunnahHadith['sourceBook']>['kind'], collection: String(place.source_collection) };
    }
    const summary = this.db.prepare("SELECT judgment_count,wording_differs,opposed,unresolved_count FROM hadith_grading_summary WHERE hadith_id=? AND display_policy='details'").get(row.id) as Row | undefined;
    if (summary && !blanketGradeCollections.has(String(row.book_key))) hadith.gradingSummary = { count: Number(summary.judgment_count), opposed: Boolean(summary.opposed), wordingDiffers: Boolean(summary.wording_differs), unresolved: Number(summary.unresolved_count) };
    if (!hadith.text.en.full && !hadith.text.en.matn) {
      const variants = this.variants(Number(row.id));
      if (variants.length) {
        hadith.text.en = { full: variants.map(item => value(item.text)).join('\n\n'), isnad: '', matn: '' };
        hadith.translation = { config: String(variants[0].config), partial: variants.some(item => partialRelations.has(String(item.relation))) };
      }
    }
    return hadith;
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
  /** The hadith rows hold full text, so a cold scan takes seconds: it yields between batches and runs once. */
  statistics(): Promise<SunnahStatistics> {
    return this.stats ??= this.computeStatistics().catch(error => { this.stats = undefined; throw error; });
  }
  private async computeStatistics(): Promise<SunnahStatistics> {
    const counts = new Map<SunnahCollectionId, { commentary: number; corroborated: number }>();
    const batch = this.db.prepare(`SELECT id,book_key,Arabic_Tafseel,Itqan_Corroborating_Hadiths_JSON AS corroborated FROM hadiths WHERE id>? ORDER BY id LIMIT 500`);
    for (let last = 0; ;) {
      const rows = batch.all(last) as Row[];
      if (!rows.length) break;
      for (const row of rows) {
        const id = collections[String(row.book_key)];
        const count = counts.get(id) ?? { commentary: 0, corroborated: 0 };
        if (value(row.Arabic_Tafseel)) count.commentary++;
        if (!['', '[]'].includes(value(row.corroborated))) count.corroborated++;
        counts.set(id, count);
      }
      last = Number(rows[rows.length - 1].id);
      await new Promise(resolve => setImmediate(resolve));
    }
    const total = (table: string) => (this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
    const narrators = this.db.prepare(`SELECT n.rijal_id AS id,r.primary_name_ar AS name,n.mentions FROM
      (SELECT rijal_id,COUNT(*) AS mentions FROM hadith_narrators WHERE rijal_id IS NOT NULL GROUP BY rijal_id ORDER BY mentions DESC LIMIT 20) n
      LEFT JOIN rijal_narrators r ON r.rijal_id=n.rijal_id ORDER BY n.mentions DESC`).all() as { id: string; name: string | null; mentions: number }[];
    return {
      collections: this.catalog.collections.map(item => ({ id: item.id, hadiths: item.hadithCount, chapters: item.chapters.length, commentary: counts.get(item.id)?.commentary ?? 0, corroborated: counts.get(item.id)?.corroborated ?? 0 })),
      totals: { hadiths: this.catalog.hadithCount, narratorProfiles: total('rijal_narrators'), chainLinks: total('hadith_narrators'), rootLinks: total('quran_hadith_root_bridge') },
      topNarrators: narrators.map(row => ({ id: String(row.id), name: row.name ?? String(row.id), mentions: row.mentions })),
    };
  }
  search(query: SunnahResearchQuery): SunnahSearchHit[] {
    if (!query || typeof query !== 'object') throw new Error('Invalid search');
    const limit = query.limit ?? 201, offset = query.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 201 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Error('Invalid search bounds');
    const clauses: string[] = [], params: (string | number)[] = [];
    let exactTerms: string[] = [];
    let rankJoin = '';
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
        const match = terms.map(term => `"${term}"`).join(' AND ');
        if (query.requestId) {
          rankJoin = `JOIN (SELECT rowid,MIN(score) AS score FROM (SELECT rowid,rank AS score FROM hadiths_fts WHERE hadiths_fts MATCH ? ${this.merged ? 'UNION ALL SELECT rowid,rank AS score FROM variant_translation_fts WHERE variant_translation_fts MATCH ?' : ''}) GROUP BY rowid) ranked ON ranked.rowid=hadiths.id`;
          params.push(match); if (this.merged) params.push(match);
        } else if (this.merged) { clauses.push('(id IN (SELECT rowid FROM hadiths_fts WHERE hadiths_fts MATCH ?) OR id IN (SELECT rowid FROM variant_translation_fts WHERE variant_translation_fts MATCH ?))'); params.push(match, match); }
        else { clauses.push('id IN (SELECT rowid FROM hadiths_fts WHERE hadiths_fts MATCH ?)'); params.push(match); }
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
    if (!clauses.length && !rankJoin) return [];
    const statement = this.db.prepare(`SELECT ${baseColumns},Arabic_Tafseel FROM hadiths ${rankJoin} WHERE ${clauses.length ? clauses.join(' AND ') : '1=1'} ORDER BY ${rankJoin ? 'ranked.score,' : ''}id LIMIT ? OFFSET ?`);
    // The historical index folds taa marbuta/haa. Page over verified matches so
    // false positives cannot hide valid later matches or shift the next batch.
    const matches = (row: Row) => {
      if (!exactTerms.length) return true;
      const variants = this.merged && !value(row.English_Hadith) ? this.variants(Number(row.id)).map(item => item.text) : [];
      const text = conservative([row.Arabic_Matn, row.Arabic_Tafseel, row.English_Hadith, row.Chapter_Arabic, row.Section_Arabic, ...variants].map(value).join(' '));
      return exactTerms.every(term => text.includes(term));
    };
    if (!query.requestId) return (statement.all(...params, limit, offset) as Row[]).filter(matches).map(row => this.hit(row));
    const selected: Row[] = []; let rawOffset = 0, skipped = 0;
    while (selected.length < limit) {
      const candidates = statement.all(...params, limit, rawOffset) as Row[];
      for (const row of candidates) {
        if (!matches(row)) continue;
        if (skipped++ < offset) continue;
        selected.push(row); if (selected.length === limit) break;
      }
      if (candidates.length < limit) break;
      rawOffset += candidates.length;
    }
    return selected.map(row => this.hit(row));
  }
  research(id: number): SunnahResearch {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid hadith identity');
    const row = this.db.prepare('SELECT * FROM hadiths WHERE id=?').get(id) as Row | undefined;
    if (!row) throw new Error('Missing hadith');
    const links = JSON.parse(value(row.Itqan_Corroborating_Hadiths_JSON) || '[]') as { book: string; hadith_number: string; output_row_index?: number; similarity?: number }[];
    const related: SunnahSearchHit[] = [];
    for (const link of links.slice(0, 5)) {
      // Repeated edition references stay distinct; output row index is the identity.
      const target = link.output_row_index === undefined ? undefined : this.db.prepare(`SELECT ${baseColumns} FROM hadiths ORDER BY id LIMIT 1 OFFSET ?`).get(link.output_row_index) as Row | undefined;
      if (target && target.book_key === link.book && String(target.Hadith_number) === String(link.hadith_number)) related.push({ ...this.hit(target), similarity: link.similarity });
    }
    // Review records point at their candidates; those rows are never changed by the link.
    if (this.hasSourceBooks) {
      const place = this.db.prepare("SELECT candidates_json FROM source_book_rows WHERE hadith_id=? AND kind='review'").get(id) as Row | undefined;
      for (const candidate of (JSON.parse(value(place?.candidates_json ?? null) || '[]') as number[]).slice(0, 5)) {
        const target = this.db.prepare(`SELECT ${baseColumns} FROM hadiths WHERE id=?`).get(candidate) as Row | undefined;
        if (target) related.push(this.hit(target));
      }
    }
    const rootWords: Record<string, string[]> = {};
    if (this.hasRootWords) for (const entry of this.db.prepare('SELECT root_ar,matched_words_json FROM quran_hadith_root_bridge WHERE hadith_id=?').all(id) as { root_ar: string; matched_words_json: string }[]) rootWords[entry.root_ar] = JSON.parse(entry.matched_words_json) as string[];
    return { commentary: value(row.Arabic_Tafseel), title: value(row.Commentary_Book_Title), author: value(row.Commentary_Author), reference: value(row.Source_Row_Reference), volume: value(row.Shamela_Volume), page: value(row.Shamela_Page), sourceUrl: value(row.Commentary_Shamela_URL), matnUrl: value(row.Matn_Shamela_URL), method: value(row.Tafseel_Match_Method), score: Number(row.Tafseel_Match_Score), nodes: JSON.parse(value(row.Itqan_Narrator_Chain_JSON) || '[]') as SunnahResearchNode[], roots: JSON.parse(value(row.Itqan_Quran_Root_Links_JSON) || '[]') as string[], rootWords, ayahs: JSON.parse(value(row.Itqan_Linked_Ayah_Keys_JSON) || '[]') as string[], calibration: Number(row.Itqan_Chain_Calibration_Score), weakest: value(row.Itqan_Weakest_Narrator_Grade), related, merged: this.merged ? this.mergedResearch(id, row) : undefined };
  }
  private mergedResearch(id: number, row: Row): SunnahMergedResearch {
    const judgments = (this.db.prepare("SELECT * FROM grading_judgments WHERE hadith_id=? AND display_policy='details' ORDER BY grader_raw IS NULL,origin,field_path").all(id) as Row[]).map((item): SunnahGradingJudgment => ({
      id: String(item.judgment_id), origin: String(item.origin), graderRaw: value(item.grader_raw), graderAr: value(item.grader_ar), graderRole: String(item.grader_role), graderStatus: String(item.grader_status),
      gradeRaw: String(item.grade_raw), gradeAlt: value(item.grade_raw_alt), gradeAr: value(item.grade_ar), gradeArStatus: String(item.grade_ar_status) as SunnahGradingJudgment['gradeArStatus'],
      scope: String(item.scope), reviewStatus: String(item.review_status), assessedPart: value(item.assessed_part), note: value(item.note),
      dataset: String(item.dataset), config: value(item.config), fieldPath: value(item.field_path), lineage: (JSON.parse(String(item.upstream_lineage_json)) as { upstream: string[] }).upstream, sameLabelAs: (JSON.parse(String(item.upstream_lineage_json)) as { same_label_as_named_grader?: string[] }).same_label_as_named_grader ?? [],
      wordingSimilarity: item.wording_similarity == null ? null : Number(item.wording_similarity) }));
    const summary = this.db.prepare('SELECT wording_differs,opposed FROM hadith_grading_summary WHERE hadith_id=?').get(id) as Row | undefined;
    const variants = this.variants(id).map((item): SunnahVariantText => ({ sourceKey: String(item.source_key), config: String(item.config), text: value(item.text), relation: String(item.relation), score: item.full_score == null ? null : Number(item.full_score), englishSimilarity: item.english_similarity == null ? null : Number(item.english_similarity), license: value(item.license), attribution: value(item.attribution) }));
    const explanations = (this.db.prepare(`SELECT r.source_key,r.language,r.title,r.text,r.explanation,r.attribution_text,s.license,s.attribution
      FROM quranlab_records r JOIN source_registry s ON s.source_id='ql:'||r.config
      WHERE r.language IN ('ar','en') AND r.config LIKE 'hadeethenc-%' AND r.source_key IN (SELECT source_key FROM hadith_crosswalk WHERE hadith_id=? AND decision='verified_match' AND collection='hadeethenc'${this.hasSourceBooks ? ' UNION SELECT source_key FROM source_book_rows WHERE hadith_id=?' : ''}) ORDER BY r.source_key,r.language`).all(...(this.hasSourceBooks ? [id, id] : [id])) as Row[]).map((item): SunnahExplanation => ({ sourceKey: String(item.source_key), language: String(item.language) as SunnahLanguage, title: value(item.title), text: value(item.text), explanation: value(item.explanation), citation: value(item.attribution_text), license: value(item.license), attribution: value(item.attribution) }));
    const provenance = JSON.parse(value(row.field_provenance_json) || '{}') as { fields?: { source: string; record: string; transformation: string; upstream?: string; fields: Record<string, string> }[]; missing?: string[] };
    const registry = this.db.prepare('SELECT dataset,revision FROM source_registry WHERE source_id=?');
    const fieldSources = (provenance.fields ?? []).map((group): SunnahFieldSource => {
      const source = registry.get(group.source) as Row | undefined;
      return { source: group.source, dataset: value(source?.dataset ?? null), revision: value(source?.revision ?? null), record: group.record, transformation: group.transformation, fields: Object.keys(group.fields), unresolved: group.upstream === 'unresolved' };
    });
    return { judgments, wordingDiffers: Boolean(summary?.wording_differs), opposed: Boolean(summary?.opposed), variants, explanations, fieldSources, missingFields: provenance.missing ?? [], datasets: JSON.parse(value(row.source_datasets_json) || '[]') as string[] };
  }
  narrator(id: string): SunnahNarrator {
    if (typeof id !== 'string' || !/^\d{1,20}$/.test(id)) throw new Error('Invalid narrator');
    const row = this.db.prepare('SELECT * FROM rijal_narrators WHERE rijal_id=?').get(id) as Row | undefined;
    if (!row) throw new Error('Missing narrator');
    const sources = JSON.parse(value(row.sources_json) || '{}') as { classical_sources?: Record<string, { grade_ar?: string; grade_en?: string }>; name_variants?: string[]; source_death_text?: string };
    const links = (field: Row[string]): { total: number; items: SunnahNarratorLink[] } => {
      const ids = (JSON.parse(value(field) || '[]') as number[]).map(String);
      const visible = ids.slice(0, narratorLinkLimit);
      if (!visible.length) return { total: ids.length, items: [] };
      const found = this.db.prepare(`SELECT rijal_id,primary_name_ar,jarh_tadil_tier FROM rijal_narrators WHERE rijal_id IN (${visible.map(() => '?').join(',')})`).all(...visible) as Row[];
      return { total: ids.length, items: visible.flatMap(item => { const match = found.find(entry => entry.rijal_id === item); return match ? [{ id: item, name: value(match.primary_name_ar), tier: value(match.jarh_tadil_tier) }] : []; }) };
    };
    const teachers = links(row.teachers_json), students = links(row.students_json);
    return {
      id, name: value(row.primary_name_ar), variants: [...new Set(sources.name_variants || [])].filter(name => name !== value(row.primary_name_ar)).slice(0, 12),
      kunya: detail(row.kunya_ar), nasab: detail(row.nasab_ar), laqab: detail(row.laqab_nisba_ar), tabaqah: detail(row.tabaqah),
      deathYear: row.death_year_ah == null ? null : Number(row.death_year_ah), deathText: detail(sources.source_death_text ?? null),
      grade: detail(row.jarh_tadil_raw_ar), tier: value(row.jarh_tadil_tier),
      sources: Object.entries(sources.classical_sources || {}).map(([source, entry]) => ({ source, gradeAr: detail(entry.grade_ar ?? null), gradeEn: detail(entry.grade_en ?? null) })),
      teachers: teachers.items, students: students.items, teacherCount: teachers.total, studentCount: students.total,
      hadithCount: (this.db.prepare('SELECT COUNT(DISTINCT hadith_id) AS n FROM hadith_narrators WHERE rijal_id=?').get(id) as { n: number }).n,
    };
  }
}

export function discoverResearchCorpus(paths: string[]): SunnahResearchCorpus | null {
  const filename = paths.find(filename => existsSync(filename));
  return filename ? new SunnahResearchCorpus(filename) : null;
}
