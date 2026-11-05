/**
 * Baglib — Pluggable Offline Dictionary & Encyclopedia Service (KEY-142)
 *
 * Implements Readest's multi-format dictionary registry (MDict, StarDict, Babylon, Slob, DictZip)
 * and SQLite sub-10ms headword lookup with Arabic root stripping.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  DictionaryFormat,
  DictionaryItem,
  DictionaryEntryMatch,
  AggregateDictionaryLookupResult,
  ImportDictionaryOptions,
} from '../../../shared/types/dictionary';
import { BIOGRAPHY_SCIENCE } from '../../../shared/types/dictionary';
import {
  buildLookupCandidates,
  stripArabicDiacritics,
  normalizeArabicLetters,
} from '../../../shared/utils/lookup-candidates';
import { StarDictReader } from './stardict-reader';
import { BglReader } from './bgl-reader';
import { SlobReader } from './slob-reader';
import { MdictReader } from './mdict-reader';
import { WikipediaService } from './wikipedia.service';

const SCIENCES_KEY = 'dictionary.sciences.v1';

export class DictionaryService {
  private db: Database.Database;
  private wikipediaService: WikipediaService;
  private readers = new Map<string, StarDictReader | BglReader | SlobReader | MdictReader>();

  constructor(db: Database.Database) {
    this.db = db;
    this.wikipediaService = new WikipediaService();
  }

  /**
   * List all registered dictionaries.
   */
  listDictionaries(): DictionaryItem[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, format, source_path as sourcePath, source_lang as sourceLang,
                target_lang as targetLang, entry_count as entryCount, is_enabled as isEnabled,
                created_at as createdAt
         FROM dictionaries
         ORDER BY created_at DESC`
      )
      .all() as DictionaryItem[];

    const sciences = this.sciences();
    return rows.map((r) => ({
      ...r,
      isEnabled: Boolean(r.isEnabled),
      science: sciences[r.id],
    }));
  }

  /** Science tags live in settings because `dictionaries` has no field for them. */
  private sciences(): Record<string, string> {
    try {
      const row = this.db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(SCIENCES_KEY) as { value: string } | undefined;
      return row ? JSON.parse(row.value) as Record<string, string> : {};
    } catch { return {}; }
  }

  setScience(id: string, science: string | null): boolean {
    if (!this.db.prepare(`SELECT 1 FROM dictionaries WHERE id = ?`).get(id)) return false;
    if (science && science !== BIOGRAPHY_SCIENCE && !this.db.prepare(`SELECT 1 FROM category WHERE id = ?`).get(science)) return false;
    const sciences = this.sciences();
    if (science) sciences[id] = science; else delete sciences[id];
    this.db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .run(SCIENCES_KEY, JSON.stringify(sciences), new Date().toISOString());
    return true;
  }

  private ancestors(id: string): Set<string> {
    const found = new Set<string>();
    const parent = this.db.prepare(`SELECT parent_id AS parent FROM category WHERE id = ?`);
    for (let current: string | null | undefined = id; current && !found.has(current); current = (parent.get(current) as { parent: string | null } | undefined)?.parent) found.add(current);
    return found;
  }

  /** The reading's science comes first. Another science's meaning goes only when this one has an answer. */
  private bySciences(entries: DictionaryEntryMatch[], options?: { science?: string; workId?: string }): DictionaryEntryMatch[] {
    const sciences = this.sciences();
    const tagged = entries.map(entry => ({ ...entry, science: sciences[entry.dictId] }));
    const science = options?.science ?? (options?.workId ? (this.db.prepare(`SELECT primary_category_id AS category FROM work WHERE id = ?`).get(options.workId) as { category: string | null } | undefined)?.category : undefined);
    if (!science) return tagged;
    const family = this.ancestors(science);
    const rank = ({ science: tag }: { science?: string }) => !tag ? 2 : tag === BIOGRAPHY_SCIENCE ? 1 : family.has(tag) || this.ancestors(tag).has(science) ? 0 : 3;
    const sorted = [...tagged].sort((first, second) => rank(first) - rank(second));
    return sorted.some(entry => rank(entry) === 0) ? sorted.filter(entry => rank(entry) !== 3) : sorted;
  }

  /**
   * Detect format from file path.
   */
  detectFormat(filePath: string): DictionaryFormat {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.mdx' || ext === '.mdd') return 'mdict';
    if (ext === '.bgl') return 'bgl';
    if (ext === '.slob') return 'slob';
    if (ext === '.idx' || ext === '.ifo' || filePath.endsWith('.dict.dz') || ext === '.dict') return 'stardict';
    if (ext === '.dz') return 'dictzip';

    // Directory check for StarDict
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      const files = fs.readdirSync(filePath);
      if (files.some((f) => f.endsWith('.ifo'))) return 'stardict';
    }

    return 'stardict';
  }

  /**
   * Import and index a dictionary file or bundle.
   */
  async importDictionary(options: ImportDictionaryOptions): Promise<DictionaryItem> {
    const sourcePath = options.sourcePath;
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Dictionary file or directory does not exist: ${sourcePath}`);
    }

    const format = this.detectFormat(sourcePath);
    const id = crypto.randomUUID();
    const title =
      options.title ||
      path.basename(sourcePath, path.extname(sourcePath)).replace(/[-_]/g, ' ');
    const createdAt = new Date().toISOString();

    let entryCount = 0;
    const headwordsToIndex: Array<{ headword: string; offset?: number; size?: number }> = [];

    if (format === 'stardict') {
      const reader = new StarDictReader();
      await reader.loadFromFiles(sourcePath);
      entryCount = reader.entryCount;
      const all = reader.getAllHeadwords();
      for (const item of all) {
        headwordsToIndex.push({ headword: item.word, offset: item.offset, size: item.size });
      }
      this.readers.set(id, reader);
    } else if (format === 'bgl') {
      const reader = new BglReader();
      reader.loadFromFile(sourcePath);
      entryCount = reader.entryCount;
      const all = reader.getAllHeadwords();
      for (const item of all) {
        headwordsToIndex.push({ headword: item.word });
        if (item.alternates) {
          for (const alt of item.alternates) {
            headwordsToIndex.push({ headword: alt });
          }
        }
      }
      this.readers.set(id, reader);
    } else if (format === 'slob') {
      const reader = new SlobReader();
      reader.loadFromFile(sourcePath);
      entryCount = reader.refCount;
      const all = reader.getAllHeadwords(50000);
      for (const w of all) {
        headwordsToIndex.push({ headword: w });
      }
      this.readers.set(id, reader);
    } else if (format === 'mdict') {
      const reader = new MdictReader();
      reader.loadFromFile(sourcePath, options.companionFiles);
      const all = reader.getAllHeadwords(50000);
      entryCount = all.length;
      for (const w of all) {
        headwordsToIndex.push({ headword: w });
      }
      this.readers.set(id, reader);
    }

    // Insert dictionary record into SQLite
    this.db
      .prepare(
        `INSERT INTO dictionaries (id, title, format, source_path, source_lang, target_lang, entry_count, is_enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
      )
      .run(
        id,
        title,
        format,
        sourcePath,
        options.sourceLang || null,
        options.targetLang || null,
        entryCount,
        createdAt
      );

    // Batch index headwords into headword_index table for sub-10ms lookup
    const insertHeadwordStmt = this.db.prepare(
      `INSERT INTO headword_index (dict_id, headword, normalized_headword, offset, size)
       VALUES (?, ?, ?, ?, ?)`
    );

    const insertMany = this.db.transaction((items: typeof headwordsToIndex) => {
      for (const item of items) {
        const norm = normalizeArabicLetters(stripArabicDiacritics(item.headword.trim().toLowerCase()));
        insertHeadwordStmt.run(id, item.headword, norm, item.offset ?? null, item.size ?? null);
      }
    });

    insertMany(headwordsToIndex);

    return {
      id,
      title,
      format,
      sourcePath,
      sourceLang: options.sourceLang,
      targetLang: options.targetLang,
      entryCount,
      isEnabled: true,
      createdAt,
    };
  }

  /**
   * Toggle dictionary enablement.
   */
  toggleDictionary(id: string, isEnabled: boolean): boolean {
    const res = this.db
      .prepare(`UPDATE dictionaries SET is_enabled = ? WHERE id = ?`)
      .run(isEnabled ? 1 : 0, id);
    return res.changes > 0;
  }

  /**
   * Delete a dictionary and all its indexed headwords.
   */
  deleteDictionary(id: string): boolean {
    const reader = this.readers.get(id);
    if (reader && 'close' in reader && typeof reader.close === 'function') {
      reader.close();
    }
    this.readers.delete(id);

    if (this.sciences()[id]) this.setScience(id, null);
    const res = this.db.prepare(`DELETE FROM dictionaries WHERE id = ?`).run(id);
    return res.changes > 0;
  }

  /**
   * Get or initialize a reader for a dictionary.
   */
  private async getReader(dict: DictionaryItem): Promise<StarDictReader | BglReader | SlobReader | MdictReader | undefined> {
    let reader = this.readers.get(dict.id);
    if (reader) return reader;

    if (dict.format === 'stardict') {
      const r = new StarDictReader();
      await r.loadFromFiles(dict.sourcePath);
      reader = r;
    } else if (dict.format === 'bgl') {
      const r = new BglReader();
      r.loadFromFile(dict.sourcePath);
      reader = r;
    } else if (dict.format === 'slob') {
      const r = new SlobReader();
      r.loadFromFile(dict.sourcePath);
      reader = r;
    } else if (dict.format === 'mdict') {
      const r = new MdictReader();
      r.loadFromFile(dict.sourcePath);
      reader = r;
    }

    if (reader) {
      this.readers.set(dict.id, reader);
    }
    return reader;
  }

  /**
   * Look up a word across all enabled offline dictionaries and online Wikipedia.
   * Leverages Arabic root stripping & prioritized candidate generation.
   */
  async lookup(
    word: string,
    options?: { lang?: string; includeWikipedia?: boolean; maxCandidates?: number; science?: string; workId?: string }
  ): Promise<AggregateDictionaryLookupResult> {
    const startTime = performance.now();
    const candidates = buildLookupCandidates(word, options?.lang);
    const entries: DictionaryEntryMatch[] = [];
    const seenEntries = new Set<string>();

    const enabledDicts = this.listDictionaries().filter((d) => d.isEnabled);

    if (enabledDicts.length > 0 && candidates.length > 0) {
      // Prepared statement for sub-10ms headword lookup using SQLite index
      const queryStmt = this.db.prepare(
        `SELECT headword, offset, size FROM headword_index
         WHERE dict_id = ? AND (normalized_headword = ? OR headword = ?)
         LIMIT 3`
      );

      for (const dict of enabledDicts) {
        const reader = await this.getReader(dict);
        if (!reader) continue;

        for (const candidate of candidates) {
          const normCandidate = normalizeArabicLetters(
            stripArabicDiacritics(candidate.token.trim().toLowerCase())
          );

          // Fast SQLite B-tree query (< 0.5ms)
          const indexedMatches = queryStmt.all(dict.id, normCandidate, candidate.token) as { headword: string }[];

          const wordsToLookup = indexedMatches.length > 0
            ? indexedMatches.map((m) => m.headword)
            : [candidate.token];

          let foundInDict = false;

          for (const wordToLookup of wordsToLookup) {
            const entryKey = `${dict.id}:${wordToLookup.toLowerCase()}`;
            if (seenEntries.has(entryKey)) continue;

            let defHtml = '';
            let defText = '';

            try {
              if (dict.format === 'stardict' && reader instanceof StarDictReader) {
                const match = reader.lookup(wordToLookup);
                if (match) {
                  const raw = await reader.readDefinition(match);
                  defHtml = raw.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>');
                  defText = raw;
                }
              } else if (dict.format === 'bgl' && reader instanceof BglReader) {
                const match = reader.lookup(wordToLookup);
                if (match) {
                  defHtml = match.definition;
                  defText = match.definition.replace(/<[^>]+>/g, '');
                }
              } else if (dict.format === 'slob' && reader instanceof SlobReader) {
                const match = reader.lookup(wordToLookup);
                if (match && match.text) {
                  defHtml = match.text;
                  defText = match.text.replace(/<[^>]+>/g, '');
                }
              } else if (dict.format === 'mdict' && reader instanceof MdictReader) {
                const match = reader.lookup(wordToLookup);
                if (match) {
                  defHtml = match.definitionHtml;
                  defText = match.definitionText;
                }
              }

              if (defHtml) {
                seenEntries.add(entryKey);
                foundInDict = true;
                entries.push({
                  dictId: dict.id,
                  dictTitle: dict.title,
                  dictFormat: dict.format,
                  headword: wordToLookup,
                  matchedCandidate: candidate.token,
                  definitionHtml: defHtml,
                  definitionText: defText,
                });
                break;
              }
            } catch (err) {
              console.warn(`[DictionaryService] Error looking up ${wordToLookup} in ${dict.title}:`, err);
            }
          }

          if (foundInDict) break; // Found best match for this dictionary
        }
      }
    }

    // Online Wikipedia Lookup (unless explicitly disabled)
    let wikipediaCard = null;
    if (options?.includeWikipedia !== false) {
      wikipediaCard = await this.wikipediaService.fetchSummary(word, options?.lang);
    }

    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

    return {
      query: word,
      candidates,
      entries: this.bySciences(entries, options),
      wikipedia: wikipediaCard,
      durationMs,
    };
  }
}
