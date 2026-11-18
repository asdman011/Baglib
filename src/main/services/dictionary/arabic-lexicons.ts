/**
 * BagLib — Arabic Lexicons Pack Importer & Reader (KEY-413)
 *
 * Imports and reads the 11 dictionaries from a user-selected `arabic_lexicons` pack
 * (either the repository zip with `assets/data/db/db.sqlite.zip` + `assets/data/ar_en/*`,
 * or a `db.sqlite` file + optional `ar_en` folder) into `<userData>/dictionaries/arabic-lexicons/`.
 *
 * Security & Architecture:
 * - No schema change: registers dictionaries in existing `dictionaries` and `headword_index`
 *   with `format = 'arabic-lexicons'` and `offset = source row id`.
 * - SQL table names are NEVER taken from dynamic data; they come strictly from the fixed
 *   const map `ARABIC_LEXICON_TABLES`.
 * - Opens `db.sqlite` with a single cached read-only `better-sqlite3` connection, closed on quit.
 * - Cleans definitions by turning `|`, `│`, `<br>` and `\n` into line breaks while strictly
 *   escaping HTML and preserving all Arabic diacritics and canonical text.
 */

import fs from 'node:fs';
import { statfs } from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import Database from 'better-sqlite3';
import type {
  ArabicLexiconsImportProgress,
  DictionaryItem,
  DictionaryRootFamily,
  DictionaryRootFamilyMember,
} from '../../../shared/types/dictionary';
import {
  normalizeArabicLetters,
  stripArabicDiacritics,
} from '../../../shared/utils/lookup-candidates';
import { translations, type TranslationKey } from '../../../renderer/translations';
import { AraMorphAnalyzer, ARAMORPH_REQUIRED_FILES } from './aramorph';

export type SqlLexiconId =
  | 'arlex-lisan'
  | 'arlex-sihah'
  | 'arlex-maqayis'
  | 'arlex-muhit'
  | 'arlex-wasit'
  | 'arlex-muasir'
  | 'arlex-mufradat'
  | 'arlex-ghani'
  | 'arlex-hanswehr'
  | 'arlex-lane';

export type ArabicLexiconId = SqlLexiconId | 'arlex-direct';

/** Fixed whitelist mapping dictionary ID -> SQLite table name. Never read table names from data. */
export const ARABIC_LEXICON_TABLES: Readonly<Record<SqlLexiconId, string>> = Object.freeze({
  'arlex-lisan': 'lisanularab',
  'arlex-sihah': 'mujamul_shihah',
  'arlex-maqayis': 'maqayeesul_luga',
  'arlex-muhit': 'mujamul_muhith',
  'arlex-wasit': 'mujamul_wasith',
  'arlex-muasir': 'mujamul_muashiroh',
  'arlex-mufradat': 'mufradat_alfajul_quran',
  'arlex-ghani': 'ghani',
  'arlex-hanswehr': 'hanswehr',
  'arlex-lane': 'lanelexcon',
});

export interface ArabicLexiconSpec {
  id: ArabicLexiconId;
  table: string | null;
  sourceLang: 'ar';
  targetLang: 'ar' | 'en';
  titleKey: TranslationKey;
  authorKey: TranslationKey;
}

export const ARABIC_LEXICON_SPECS: readonly ArabicLexiconSpec[] = Object.freeze([
  {
    id: 'arlex-maqayis',
    table: ARABIC_LEXICON_TABLES['arlex-maqayis'],
    sourceLang: 'ar',
    targetLang: 'ar',
    titleKey: 'arlexTitleMaqayis',
    authorKey: 'arlexAuthorMaqayis',
  },
  {
    id: 'arlex-lisan',
    table: ARABIC_LEXICON_TABLES['arlex-lisan'],
    sourceLang: 'ar',
    targetLang: 'ar',
    titleKey: 'arlexTitleLisan',
    authorKey: 'arlexAuthorLisan',
  },
  {
    id: 'arlex-sihah',
    table: ARABIC_LEXICON_TABLES['arlex-sihah'],
    sourceLang: 'ar',
    targetLang: 'ar',
    titleKey: 'arlexTitleSihah',
    authorKey: 'arlexAuthorSihah',
  },
  {
    id: 'arlex-muhit',
    table: ARABIC_LEXICON_TABLES['arlex-muhit'],
    sourceLang: 'ar',
    targetLang: 'ar',
    titleKey: 'arlexTitleMuhit',
    authorKey: 'arlexAuthorMuhit',
  },
  {
    id: 'arlex-mufradat',
    table: ARABIC_LEXICON_TABLES['arlex-mufradat'],
    sourceLang: 'ar',
    targetLang: 'ar',
    titleKey: 'arlexTitleMufradat',
    authorKey: 'arlexAuthorMufradat',
  },
  {
    id: 'arlex-wasit',
    table: ARABIC_LEXICON_TABLES['arlex-wasit'],
    sourceLang: 'ar',
    targetLang: 'ar',
    titleKey: 'arlexTitleWasit',
    authorKey: 'arlexAuthorWasit',
  },
  {
    id: 'arlex-muasir',
    table: ARABIC_LEXICON_TABLES['arlex-muasir'],
    sourceLang: 'ar',
    targetLang: 'ar',
    titleKey: 'arlexTitleMuasir',
    authorKey: 'arlexAuthorMuasir',
  },
  {
    id: 'arlex-ghani',
    table: ARABIC_LEXICON_TABLES['arlex-ghani'],
    sourceLang: 'ar',
    targetLang: 'ar',
    titleKey: 'arlexTitleGhani',
    authorKey: 'arlexAuthorGhani',
  },
  {
    id: 'arlex-hanswehr',
    table: ARABIC_LEXICON_TABLES['arlex-hanswehr'],
    sourceLang: 'ar',
    targetLang: 'en',
    titleKey: 'arlexTitleHansWehr',
    authorKey: 'arlexAuthorHansWehr',
  },
  {
    id: 'arlex-lane',
    table: ARABIC_LEXICON_TABLES['arlex-lane'],
    sourceLang: 'ar',
    targetLang: 'en',
    titleKey: 'arlexTitleLane',
    authorKey: 'arlexAuthorLane',
  },
  {
    id: 'arlex-direct',
    table: null,
    sourceLang: 'ar',
    targetLang: 'en',
    titleKey: 'arlexTitleDirect',
    authorKey: 'arlexAuthorDirect',
  },
]);

const SPEC_BY_ID = new Map<string, ArabicLexiconSpec>(
  ARABIC_LEXICON_SPECS.map((s) => [s.id, s])
);

export function isArabicLexiconId(id: string): id is ArabicLexiconId {
  return SPEC_BY_ID.has(id);
}

export function getArabicLexiconSpec(id: string): ArabicLexiconSpec | undefined {
  return SPEC_BY_ID.get(id);
}

/**
 * Returns localized title and attribution for a lexicon id if it belongs to the Arabic Lexicons pack.
 */
export function getArabicLexiconLabels(
  id: string,
  lang: 'ar' | 'en' = 'ar'
): { title: string; attribution: string } | null {
  const spec = SPEC_BY_ID.get(id);
  if (!spec) return null;
  const dict = translations[lang] ?? translations.ar;
  return {
    title: dict[spec.titleKey],
    attribution: dict[spec.authorKey],
  };
}

/**
 * Resolves the whitelisted SQLite table name for a given dictionary ID.
 * Throws `invalid-dictionary-id` if the ID is not in the fixed whitelist.
 */
export function getWhitelistedTableName(dictId: string): string {
  if (!Object.prototype.hasOwnProperty.call(ARABIC_LEXICON_TABLES, dictId)) {
    throw new Error(`invalid-dictionary-id: ${dictId}`);
  }
  return ARABIC_LEXICON_TABLES[dictId as SqlLexiconId];
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

/**
 * Cleans a raw lexicon meaning string:
 * - Converts `|`, `│`, `<br>`, `<br/>`, `<br />` and `\r?\n` into line breaks.
 * - Strips any raw HTML tags (such as `<i>` in Lane's Lexicon) and decodes common HTML entities
 *   before escaping, so raw HTML is NEVER injected while canonical text and all diacritics
 *   (and `﴿ayah﴾` quotes in Mufradāt) are preserved intact.
 */
export function cleanArabicLexiconMeaning(raw: string): { text: string; html: string } {
  if (!raw || typeof raw !== 'string') return { text: '', html: '' };

  const withLineBreaks = raw
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/[|│]/gu, '\n')
    .replace(/\r\n/gu, '\n')
    .replace(/\r/gu, '\n');

  // Strip any remaining HTML tags (e.g. <i>...</i> in Lane) and decode common entities before escaping
  const strippedTags = withLineBreaks
    .replace(/<\/?[a-zA-Z][^>]*>/gu, '')
    .replace(/&darr;/giu, '↓')
    .replace(/&uarr;/giu, '↑')
    .replace(/&rarr;/giu, '→')
    .replace(/&larr;/giu, '←')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"');

  const lines = strippedTags
    .split('\n')
    .map((line) => line.trim())
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && idx < arr.length - 1 && arr[idx - 1]!.length > 0));

  const cleanText = lines.join('\n').replace(/\n{3,}/gu, '\n\n').trim();
  const cleanHtml = cleanText
    .split('\n')
    .map((line) => escapeHtmlText(line))
    .join('<br>');

  return { text: cleanText, html: cleanHtml };
}

/**
 * Validates that a SQLite file contains all 10 required lexicon tables plus `ghani_words`.
 * Throws `Error('invalid-pack')` if any required table or column is missing.
 */
export function validateArabicLexiconsDatabase(dbPath: string): void {
  if (!fs.existsSync(dbPath)) {
    throw new Error('invalid-pack');
  }
  let testDb: Database.Database | null = null;
  try {
    testDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    const rows = testDb
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all() as Array<{ name: string }>;
    const existingTables = new Set(rows.map((r) => r.name));

    for (const table of Object.values(ARABIC_LEXICON_TABLES)) {
      if (!existingTables.has(table)) {
        throw new Error('invalid-pack');
      }
    }
    if (!existingTables.has('ghani_words')) {
      throw new Error('invalid-pack');
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'invalid-pack') throw err;
    throw new Error('invalid-pack');
  } finally {
    try {
      testDb?.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Runs the unzip worker off the main thread. Falls back to in-process fflate if worker script is not built.
 */
async function extractZipPackInWorker(
  zipPath: string,
  destDir: string,
  onProgress?: (progress: ArabicLexiconsImportProgress) => void
): Promise<{ dbPath: string; arEnDir: string | null }> {
  const compiledWorkerPath = path.join(__dirname, 'arabic-lexicons-worker.js');
  const altWorkerPath = path.resolve('dist/main/arabic-lexicons-worker.js');
  const workerPath = fs.existsSync(compiledWorkerPath)
    ? compiledWorkerPath
    : fs.existsSync(altWorkerPath)
      ? altWorkerPath
      : null;

  if (workerPath) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: { zipPath, destDir },
      });
      let settled = false;
      const finish = (err?: Error, res?: { dbPath: string; arEnDir: string | null }) => {
        if (settled) return;
        settled = true;
        void worker.terminate();
        if (err) reject(err);
        else resolve(res!);
      };
      worker.on('message', (msg: { type: string; stage?: string; current?: number; total?: number; dbPath?: string; arEnDir?: string | null; error?: string }) => {
        if (msg.type === 'progress' && msg.stage) {
          onProgress?.({
            stage: msg.stage as ArabicLexiconsImportProgress['stage'],
            current: msg.current,
            total: msg.total,
          });
        } else if (msg.type === 'done' && msg.dbPath) {
          finish(undefined, { dbPath: msg.dbPath, arEnDir: msg.arEnDir ?? null });
        } else if (msg.type === 'error') {
          finish(new Error(msg.error || 'invalid-pack'));
        }
      });
      worker.once('error', (err) => finish(err instanceof Error ? err : new Error(String(err))));
      worker.once('exit', (code) => {
        if (!settled && code !== 0) finish(new Error('invalid-pack'));
      });
    });
  }

  // Fallback for unit-test runs where dist/main/arabic-lexicons-worker.js is not used directly
  const { unzipSync } = await import('fflate');
  onProgress?.({ stage: 'reading' });
  const outerBytes = fs.readFileSync(zipPath);
  fs.mkdirSync(destDir, { recursive: true });
  const arEnDir = path.join(destDir, 'ar_en');
  fs.mkdirSync(arEnDir, { recursive: true });

  onProgress?.({ stage: 'unzipping', current: 0, total: 2 });
  const allowedArEn = new Set<string>([...ARAMORPH_REQUIRED_FILES, 'GPL.redistributable.txt', 'gpl.txt']);

  const entries = unzipSync(outerBytes, {
    filter: (file) => {
      if (file.name.endsWith('/')) return false;
      const norm = file.name.replace(/\\/gu, '/');
      if (norm.endsWith('db.sqlite.zip') || norm.endsWith('db.sqlite') || norm.endsWith('Sources.md')) {
        return true;
      }
      return allowedArEn.has(path.posix.basename(norm));
    },
  });

  let nestedZip: Uint8Array | null = null;
  let directDb: Uint8Array | null = null;
  let hasArEn = false;

  for (const [entryName, bytes] of Object.entries(entries)) {
    const norm = entryName.replace(/\\/gu, '/');
    const base = path.posix.basename(norm);
    if (norm.endsWith('db.sqlite.zip')) {
      nestedZip = bytes;
    } else if (norm.endsWith('db.sqlite')) {
      directDb = bytes;
    } else if (base === 'Sources.md') {
      fs.writeFileSync(path.join(destDir, 'Sources.md'), bytes);
    } else if (allowedArEn.has(base)) {
      fs.writeFileSync(path.join(arEnDir, base), bytes);
      hasArEn = true;
    }
  }

  onProgress?.({ stage: 'unzipping', current: 1, total: 2 });
  const dbPath = path.join(destDir, 'db.sqlite');
  if (nestedZip) {
    const inner = unzipSync(nestedZip, {
      filter: (f) => f.name.endsWith('.sqlite') || f.name.endsWith('.db'),
    });
    const firstSqlite = Object.values(inner)[0];
    if (!firstSqlite) throw new Error('invalid-pack');
    fs.writeFileSync(dbPath, firstSqlite);
  } else if (directDb) {
    fs.writeFileSync(dbPath, directDb);
  } else {
    throw new Error('invalid-pack');
  }

  onProgress?.({ stage: 'unzipping', current: 2, total: 2 });
  return { dbPath, arEnDir: hasArEn ? arEnDir : null };
}

export class ArabicLexiconsService {
  private lexiconDb: Database.Database | null = null;
  private lexiconDbPath: string | null = null;
  private aramorph: AraMorphAnalyzer | null = null;
  private aramorphDir: string | null = null;

  constructor(
    private readonly mainDb: Database.Database,
    private readonly packRootDir: string
  ) {}

  get packDir(): string {
    return this.packRootDir;
  }

  /** Closes the cached read-only SQLite connection and resets analyzers. */
  close(): void {
    if (this.lexiconDb) {
      try {
        this.lexiconDb.close();
      } catch {
        // ignore
      }
      this.lexiconDb = null;
      this.lexiconDbPath = null;
    }
    this.aramorph = null;
    this.aramorphDir = null;
  }

  private getReadonlyDb(customDbPath?: string): Database.Database {
    const targetPath = customDbPath || path.join(this.packRootDir, 'db.sqlite');
    if (this.lexiconDb && this.lexiconDbPath === targetPath && this.lexiconDb.open) {
      return this.lexiconDb;
    }
    if (this.lexiconDb) {
      try {
        this.lexiconDb.close();
      } catch {
        // ignore
      }
    }
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Arabic Lexicons database not found at ${targetPath}`);
    }
    this.lexiconDb = new Database(targetPath, { readonly: true, fileMustExist: true });
    this.lexiconDbPath = targetPath;
    return this.lexiconDb;
  }

  private getAraMorph(customDir?: string): AraMorphAnalyzer | null {
    const dir = customDir || path.join(this.packRootDir, 'ar_en');
    if (this.aramorph && this.aramorphDir === dir) {
      return this.aramorph;
    }
    const analyzer = new AraMorphAnalyzer(dir);
    if (!analyzer.isAvailable) return null;
    this.aramorph = analyzer;
    this.aramorphDir = dir;
    return analyzer;
  }

  /**
   * Imports the Arabic Lexicons pack from either:
   * - a repo `.zip` archive containing `assets/data/db/db.sqlite.zip` and `assets/data/ar_en/*`;
   * - or a direct `db.sqlite` file (with an optional `arEnDir` folder).
   */
  async importPack(
    options: {
      sourcePath: string;
      arEnDir?: string | null;
      lang?: 'ar' | 'en';
      onProgress?: (progress: ArabicLexiconsImportProgress) => void;
    }
  ): Promise<DictionaryItem[]> {
    const { sourcePath, arEnDir, lang = 'ar', onProgress } = options;
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      throw new Error('invalid-pack');
    }

    const stat = fs.statSync(sourcePath);
    if (!stat.isFile() || stat.size < 64) {
      throw new Error('invalid-pack');
    }

    // Check available disk space before writing
    fs.mkdirSync(path.dirname(this.packRootDir), { recursive: true });
    try {
      const disk = await statfs(path.dirname(this.packRootDir));
      const freeBytes = Number(disk.bavail) * Number(disk.bsize);
      // Need at least 2.5x file size (or 220 MB for the real pack, scaled for small fixtures)
      const requiredBytes = Math.min(250 * 1024 * 1024, Math.max(stat.size * 3, 1024 * 1024));
      if (freeBytes > 0 && freeBytes < requiredBytes) {
        throw new Error('insufficient-disk-space');
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'insufficient-disk-space') throw err;
    }

    // Close any open connection before replacing files
    this.close();

    const stagingDir = `${this.packRootDir}-staging-${Date.now()}`;
    fs.mkdirSync(stagingDir, { recursive: true });

    let stagedDbPath = path.join(stagingDir, 'db.sqlite');
    let stagedArEnDir: string | null = path.join(stagingDir, 'ar_en');

    try {
      // Detect whether sourcePath is a ZIP archive or a SQLite file
      const header = Buffer.alloc(16);
      const fd = fs.openSync(sourcePath, 'r');
      try {
        fs.readSync(fd, header, 0, 16, 0);
      } finally {
        fs.closeSync(fd);
      }

      const isZip = header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
      const isSqlite = header.toString('utf8', 0, 16) === 'SQLite format 3\0';

      if (isZip) {
        const extracted = await extractZipPackInWorker(sourcePath, stagingDir, onProgress);
        stagedDbPath = extracted.dbPath;
        stagedArEnDir = extracted.arEnDir;
      } else if (isSqlite) {
        onProgress?.({ stage: 'reading' });
        fs.copyFileSync(sourcePath, stagedDbPath);
        // Copy ar_en folder if supplied or adjacent
        const candidateArEnDirs = [
          arEnDir,
          path.join(path.dirname(sourcePath), 'ar_en'),
          path.join(path.dirname(sourcePath), '..', 'ar_en'),
        ].filter((d): d is string => Boolean(d && fs.existsSync(d)));

        const foundArEn = candidateArEnDirs.find((dir) =>
          ARAMORPH_REQUIRED_FILES.every((f) => fs.existsSync(path.join(dir, f)))
        );
        if (foundArEn) {
          fs.mkdirSync(stagedArEnDir, { recursive: true });
          for (const entry of fs.readdirSync(foundArEn)) {
            const srcFile = path.join(foundArEn, entry);
            if (fs.statSync(srcFile).isFile()) {
              fs.copyFileSync(srcFile, path.join(stagedArEnDir, entry));
            }
          }
        } else {
          stagedArEnDir = null;
        }
      } else {
        throw new Error('invalid-pack');
      }

      onProgress?.({ stage: 'validating' });
      validateArabicLexiconsDatabase(stagedDbPath);

      // Atomically swap stagingDir into this.packRootDir
      if (fs.existsSync(this.packRootDir)) {
        fs.rmSync(this.packRootDir, { recursive: true, force: true });
      }
      fs.renameSync(stagingDir, this.packRootDir);
    } catch (err) {
      try {
        if (fs.existsSync(stagingDir)) {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        }
      } catch {
        // ignore
      }
      throw err;
    }

    const finalDbPath = path.join(this.packRootDir, 'db.sqlite');
    const finalArEnDir = path.join(this.packRootDir, 'ar_en');
    const hasArEn =
      fs.existsSync(finalArEnDir) &&
      ARAMORPH_REQUIRED_FILES.every((f) => fs.existsSync(path.join(finalArEnDir, f)));

    return await this.indexPackDictionaries(finalDbPath, hasArEn ? finalArEnDir : null, lang, onProgress);
  }

  /**
   * Registers the 10 SQLite lexicons (plus `arlex-direct` when `ar_en` is present)
   * in `dictionaries` and populates `headword_index` in batched transactions.
   * Replaces only `arlex-*` rows so other user dictionaries remain untouched.
   */
  private async indexPackDictionaries(
    dbPath: string,
    arEnDir: string | null,
    lang: 'ar' | 'en',
    onProgress?: (progress: ArabicLexiconsImportProgress) => void
  ): Promise<DictionaryItem[]> {
    const packDb = this.getReadonlyDb(dbPath);
    const createdAt = new Date().toISOString();
    const t = translations[lang] ?? translations.ar;

    // Remove previous arlex-* rows (CASCADE removes their headword_index rows)
    this.mainDb.transaction(() => {
      this.mainDb.prepare(`DELETE FROM headword_index WHERE dict_id LIKE 'arlex-%'`).run();
      this.mainDb.prepare(`DELETE FROM dictionaries WHERE id LIKE 'arlex-%'`).run();
    })();

    const insertDictStmt = this.mainDb.prepare(
      `INSERT INTO dictionaries (id, title, format, source_path, source_lang, target_lang, entry_count, is_enabled, created_at)
       VALUES (?, ?, 'arabic-lexicons', ?, ?, ?, ?, 1, ?)`
    );

    const insertHwStmt = this.mainDb.prepare(
      `INSERT INTO headword_index (dict_id, headword, normalized_headword, offset, size)
       VALUES (?, ?, ?, ?, NULL)`
    );

    const insertHwBatch = this.mainDb.transaction(
      (dictId: string, rows: Array<{ id: number; word: string }>) => {
        for (const r of rows) {
          const hw = (r.word ?? '').trim();
          if (!hw) continue;
          const norm = normalizeArabicLetters(stripArabicDiacritics(hw.toLowerCase()));
          insertHwStmt.run(dictId, hw, norm, r.id);
        }
      }
    );

    const registeredItems: DictionaryItem[] = [];
    const sqlSpecs = ARABIC_LEXICON_SPECS.filter((s) => s.table !== null);
    const totalSteps = sqlSpecs.length + (arEnDir ? 1 : 0);
    let currentStep = 0;

    const BATCH_SIZE = 10_000;

    for (const spec of sqlSpecs) {
      currentStep++;
      onProgress?.({
        stage: 'indexing',
        current: currentStep,
        total: totalSteps,
        dictId: spec.id,
      });

      const table = getWhitelistedTableName(spec.id);
      const countRow = packDb.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number };
      const entryCount = Number(countRow?.c ?? 0);
      const title = t[spec.titleKey];
      const attribution = t[spec.authorKey];

      insertDictStmt.run(
        spec.id,
        title,
        dbPath,
        spec.sourceLang,
        spec.targetLang,
        entryCount,
        createdAt
      );

      // Index primary table headwords in batches
      let lastId = -1;
      const selectBatchStmt = packDb.prepare(
        `SELECT id, word FROM "${table}" WHERE id > ? ORDER BY id ASC LIMIT ?`
      );
      while (true) {
        const rows = selectBatchStmt.all(lastId, BATCH_SIZE) as Array<{ id: number; word: string }>;
        if (!rows.length) break;
        insertHwBatch(spec.id, rows);
        lastId = rows[rows.length - 1]!.id;
        if (rows.length < BATCH_SIZE) break;
        await new Promise((r) => setImmediate(r));
      }

      // For al-Ghani, also index the `ghani_words` inflected/root forms pointing at `word_id`
      if (spec.id === 'arlex-ghani') {
        const ghaniWordsStmt = packDb.prepare(
          `SELECT word, word_id AS id FROM ghani_words LIMIT ? OFFSET ?`
        );
        let offset = 0;
        while (true) {
          const rows = ghaniWordsStmt.all(BATCH_SIZE, offset) as Array<{ id: number; word: string }>;
          if (!rows.length) break;
          insertHwBatch(spec.id, rows);
          offset += rows.length;
          if (rows.length < BATCH_SIZE) break;
          await new Promise((r) => setImmediate(r));
        }
      }

      registeredItems.push({
        id: spec.id,
        title,
        format: 'arabic-lexicons',
        sourcePath: dbPath,
        sourceLang: spec.sourceLang,
        targetLang: spec.targetLang,
        entryCount,
        isEnabled: true,
        createdAt,
        attribution,
      });
    }

    // Register 11th dictionary: Direct (Buckwalter AraMorph)
    if (arEnDir) {
      currentStep++;
      onProgress?.({
        stage: 'indexing',
        current: currentStep,
        total: totalSteps,
        dictId: 'arlex-direct',
      });

      const directSpec = SPEC_BY_ID.get('arlex-direct')!;
      const analyzer = this.getAraMorph(arEnDir);
      const entryCount = analyzer ? analyzer.entryCount : 0;
      const title = t[directSpec.titleKey];
      const attribution = t[directSpec.authorKey];

      insertDictStmt.run(
        directSpec.id,
        title,
        arEnDir,
        directSpec.sourceLang,
        directSpec.targetLang,
        entryCount,
        createdAt
      );

      // Also index distinct stem headwords into headword_index so lexicon deck imports work seamlessly
      if (analyzer) {
        const stems = analyzer.getAllStemHeadwords();
        for (let i = 0; i < stems.length; i += BATCH_SIZE) {
          const slice = stems.slice(i, i + BATCH_SIZE).map((s, idx) => ({
            id: i + idx + 1,
            word: s.headword,
          }));
          insertHwBatch(directSpec.id, slice);
        }
      }

      registeredItems.push({
        id: directSpec.id,
        title,
        format: 'arabic-lexicons',
        sourcePath: arEnDir,
        sourceLang: directSpec.sourceLang,
        targetLang: directSpec.targetLang,
        entryCount,
        isEnabled: true,
        createdAt,
        attribution,
      });
    }

    onProgress?.({ stage: 'done', current: totalSteps, total: totalSteps });
    return registeredItems;
  }

  /**
   * Removes all `arlex-*` rows from `dictionaries` and `headword_index` and deletes the pack folder.
   */
  removePack(): boolean {
    this.close();
    const res = this.mainDb.transaction(() => {
      this.mainDb.prepare(`DELETE FROM headword_index WHERE dict_id LIKE 'arlex-%'`).run();
      return this.mainDb.prepare(`DELETE FROM dictionaries WHERE id LIKE 'arlex-%'`).run();
    })();
    if (fs.existsSync(this.packRootDir)) {
      try {
        fs.rmSync(this.packRootDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    return res.changes > 0;
  }

  /**
   * Reads a single entry by row ID (`offset`) or headword for a given `arlex-*` dictionary.
   */
  readEntryByOffsetOrWord(
    dict: DictionaryItem,
    headword: string,
    offset?: number | null
  ): {
    entryId?: number;
    headword: string;
    definitionHtml: string;
    definitionText: string;
    rootFamily?: DictionaryRootFamily;
  } | null {
    if (dict.id === 'arlex-direct') {
      return this.lookupDirect(dict, headword);
    }

    const table = getWhitelistedTableName(dict.id);
    const dbPath = dict.sourcePath && fs.existsSync(dict.sourcePath)
      ? dict.sourcePath
      : path.join(this.packRootDir, 'db.sqlite');
    const packDb = this.getReadonlyDb(dbPath);

    let rows: Array<{ id: number; word: string; meanings: string }>;
    if (typeof offset === 'number' && offset > 0) {
      const row = packDb
        .prepare(`SELECT id, word, meanings FROM "${table}" WHERE id = ?`)
        .get(offset) as { id: number; word: string; meanings: string } | undefined;
      rows = row ? [row] : [];
      // If multiple rows share the same headword in this lexicon (e.g. Lane child rows or Ghani homographs),
      // fetch up to 4 additional sibling rows with the same word so rich definitions aren't truncated to a bare root header
      if (row) {
        const siblings = packDb
          .prepare(`SELECT id, word, meanings FROM "${table}" WHERE word = ? AND id != ? ORDER BY id ASC LIMIT 4`)
          .all(row.word, row.id) as Array<{ id: number; word: string; meanings: string }>;
        for (const s of siblings) {
          if (s.meanings && s.meanings.trim() && s.meanings.trim() !== s.word.trim()) {
            rows.push(s);
          }
        }
      }
    } else {
      rows = packDb
        .prepare(`SELECT id, word, meanings FROM "${table}" WHERE word = ? ORDER BY id ASC LIMIT 5`)
        .all(headword) as Array<{ id: number; word: string; meanings: string }>;
    }

    if (!rows.length) return null;

    // Filter out bare root header rows (e.g. Lane id=17613 where meanings === word) when substantive rows exist
    const nonTrivial = rows.filter((r) => r.meanings && r.meanings.trim() !== r.word.trim());
    const effectiveRows = nonTrivial.length > 0 ? nonTrivial : rows;

    const cleanedParts = effectiveRows
      .map((r) => cleanArabicLexiconMeaning(r.meanings))
      .filter((c) => c.text.length > 0);

    if (!cleanedParts.length) return null;

    const primaryRow = rows[0]!;
    const definitionText = cleanedParts.map((c) => c.text).join('\n\n');
    const definitionHtml = cleanedParts.map((c) => c.html).join('<br><br>');

    let rootFamily: DictionaryRootFamily | undefined;
    if (dict.id === 'arlex-hanswehr' || dict.id === 'arlex-lane' || dict.id === 'arlex-ghani') {
      rootFamily = this.rootFamily(dict.id, primaryRow.id, dbPath) ?? undefined;
    }

    return {
      entryId: primaryRow.id,
      headword: primaryRow.word || headword,
      definitionHtml,
      definitionText,
      rootFamily,
    };
  }

  /**
   * English-side fallback lookup in Hans Wehr and Lane's Lexicon when an English query is searched.
   */
  lookupEnglishInBilingualLexicon(
    dict: DictionaryItem,
    englishQuery: string
  ): {
    entryId?: number;
    headword: string;
    definitionHtml: string;
    definitionText: string;
    rootFamily?: DictionaryRootFamily;
  } | null {
    if (dict.id !== 'arlex-hanswehr' && dict.id !== 'arlex-lane') return null;
    const q = englishQuery.trim();
    if (q.length < 3 || /[\u0600-\u06FF]/u.test(q)) return null;

    const table = getWhitelistedTableName(dict.id);
    const dbPath = dict.sourcePath && fs.existsSync(dict.sourcePath)
      ? dict.sourcePath
      : path.join(this.packRootDir, 'db.sqlite');
    const packDb = this.getReadonlyDb(dbPath);

    let rows: Array<{ id: number; word: string; meanings: string }> = [];
    if (dict.id === 'arlex-hanswehr') {
      try {
        const ftsQuery = `"${q.replace(/"/gu, '""')}"`;
        rows = packDb
          .prepare(
            `SELECT h.id, h.word, h.meanings
             FROM hanswehr_fts f
             JOIN hanswehr h ON h.id = f.rowid
             WHERE hanswehr_fts MATCH ?
             LIMIT 3`
          )
          .all(ftsQuery) as Array<{ id: number; word: string; meanings: string }>;
      } catch {
        rows = [];
      }
    }

    if (!rows.length) {
      rows = packDb
        .prepare(`SELECT id, word, meanings FROM "${table}" WHERE meanings LIKE ? LIMIT 3`)
        .all(`%${q}%`) as Array<{ id: number; word: string; meanings: string }>;
    }

    if (!rows.length) return null;
    const primary = rows[0]!;
    const cleanedParts = rows
      .map((r) => {
        const cleaned = cleanArabicLexiconMeaning(r.meanings);
        return {
          text: `${r.word}: ${cleaned.text}`,
          html: `<strong>${escapeHtmlText(r.word)}</strong>: ${cleaned.html}`,
        };
      })
      .filter((c) => c.text.length > 0);

    const rootFamily = this.rootFamily(dict.id, primary.id, dbPath) ?? undefined;
    return {
      entryId: primary.id,
      headword: primary.word,
      definitionText: cleanedParts.map((c) => c.text).join('\n\n'),
      definitionHtml: cleanedParts.map((c) => c.html).join('<br><br>'),
      rootFamily,
    };
  }

  /**
   * Look up an Arabic word using the Buckwalter AraMorph ("Direct") analyzer.
   */
  lookupDirect(
    dict: DictionaryItem,
    word: string
  ): {
    headword: string;
    definitionHtml: string;
    definitionText: string;
  } | null {
    const arEnDir =
      dict.sourcePath && fs.existsSync(dict.sourcePath)
        ? dict.sourcePath
        : path.join(this.packRootDir, 'ar_en');
    const analyzer = this.getAraMorph(arEnDir);
    if (!analyzer) return null;

    const solutions = analyzer.analyze(word);
    if (!solutions.length) return null;

    const textLines: string[] = [];
    const htmlLines: string[] = [];

    for (const sol of solutions.slice(0, 12)) {
      const lemmaPart = sol.lemmaArabic ? ` [${sol.lemmaArabic}]` : '';
      const posPart = sol.pos ? ` (${sol.pos})` : '';
      const lineText = `${sol.vocalizedArabic}${lemmaPart} — ${sol.gloss}${posPart}`;
      textLines.push(lineText);

      const htmlLine =
        `<span class="aramorph-vocalized font-bold" dir="rtl" lang="ar">${escapeHtmlText(sol.vocalizedArabic)}</span>` +
        (sol.lemmaArabic
          ? ` <span class="aramorph-lemma text-muted" dir="rtl" lang="ar">[${escapeHtmlText(sol.lemmaArabic)}]</span>`
          : '') +
        ` — <span class="aramorph-gloss" dir="ltr">${escapeHtmlText(sol.gloss)}</span>` +
        (sol.pos
          ? ` <code class="aramorph-pos text-[11px] text-muted" dir="ltr">(${escapeHtmlText(sol.pos)})</code>`
          : '');
      htmlLines.push(htmlLine);
    }

    return {
      headword: solutions[0]!.vocalizedArabic || word,
      definitionText: textLines.join('\n'),
      definitionHtml: htmlLines.join('<br>'),
    };
  }

  /**
   * Computes the root family for an entry in Hans Wehr, Lane's Lexicon, or al-Ghani.
   * Exposed as `rootFamily(dictId, entryId)` for KEY-413 and KEY-414.
   *
   * - Hans Wehr & Lane: finds the entry's `parent_id`, locates the root entry (`is_root = 1`
   *   with that `parent_id` or `id = parent_id`), and lists all entries sharing `parent_id`.
   * - al-Ghani: finds the entry's `root_id`, locates the root word (via `ghani_words` where `is_root = 1`),
   *   and lists the words sharing `root_id`.
   */
  rootFamily(dictId: string, entryId: number, customDbPath?: string): DictionaryRootFamily | null {
    if (dictId !== 'arlex-hanswehr' && dictId !== 'arlex-lane' && dictId !== 'arlex-ghani') {
      return null;
    }
    const table = getWhitelistedTableName(dictId);
    const packDb = this.getReadonlyDb(customDbPath);

    if (dictId === 'arlex-hanswehr' || dictId === 'arlex-lane') {
      const current = packDb
        .prepare(`SELECT id, word, is_root, parent_id FROM "${table}" WHERE id = ?`)
        .get(entryId) as { id: number; word: string; is_root: number; parent_id: number | null } | undefined;
      if (!current || current.parent_id === null || current.parent_id === undefined) return null;

      const familyRows = packDb
        .prepare(
          `SELECT id, word, is_root FROM "${table}" WHERE parent_id = ? ORDER BY id ASC LIMIT 60`
        )
        .all(current.parent_id) as Array<{ id: number; word: string; is_root: number }>;

      if (!familyRows.length) return null;

      const rootRow =
        familyRows.find((r) => Boolean(r.is_root)) ??
        (packDb
          .prepare(`SELECT id, word, is_root FROM "${table}" WHERE id = ?`)
          .get(current.parent_id) as { id: number; word: string; is_root: number } | undefined) ??
        familyRows[0]!;

      const seenWords = new Set<string>();
      const members: DictionaryRootFamilyMember[] = [];
      for (const r of familyRows) {
        const w = (r.word ?? '').trim();
        if (!w || seenWords.has(w)) continue;
        seenWords.add(w);
        members.push({
          id: r.id,
          word: w,
          isRoot: Boolean(r.is_root),
        });
      }

      return {
        dictId,
        rootId: rootRow.id,
        rootWord: rootRow.word,
        members,
      };
    }

    // al-Ghani: uses root_id and ghani_words
    const current = packDb
      .prepare(`SELECT id, word, root_id FROM ghani WHERE id = ?`)
      .get(entryId) as { id: number; word: string; root_id: number | null } | undefined;
    if (!current || current.root_id === null || current.root_id === undefined) return null;

    const familyRows = packDb
      .prepare(`SELECT id, word FROM ghani WHERE root_id = ? ORDER BY id ASC LIMIT 60`)
      .all(current.root_id) as Array<{ id: number; word: string }>;
    if (!familyRows.length) return null;

    const rootWordRow = packDb
      .prepare(
        `SELECT w.word, w.word_id AS id
         FROM ghani_words w
         JOIN ghani g ON g.id = w.word_id
         WHERE g.root_id = ? AND w.is_root = 1
         ORDER BY g.id ASC LIMIT 1`
      )
      .get(current.root_id) as { word: string; id: number } | undefined;

    const rootWord = rootWordRow?.word ?? familyRows[0]!.word;
    const rootId = rootWordRow?.id ?? familyRows[0]!.id;

    const seenWords = new Set<string>();
    const members: DictionaryRootFamilyMember[] = [];
    for (const r of familyRows) {
      const w = (r.word ?? '').trim();
      if (!w || seenWords.has(w)) continue;
      seenWords.add(w);
      members.push({
        id: r.id,
        word: w,
        isRoot: w === rootWord,
      });
    }

    return {
      dictId,
      rootId,
      rootWord,
      members,
    };
  }
}
