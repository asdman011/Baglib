import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, rename, rm, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import type { QuranAyah, QuranCommentary, QuranMushafPage, QuranMushafWord, QuranPack, QuranPassage, QuranReadQuery, QuranReaderCatalog, QuranRichNode, QuranSearchHit } from '../../../shared/types/quran';
import { normalizeQuranSearch } from './qul-catalog';
import { readerPreset, readerPresets } from './reader-resources';

type Word = { id: number; surah: number; ayah: number; word: number; text: string };
const marker = (text: string) => /^[\u0660-\u0669]+$/.test(text.trim());

export function inlineTranslation(value: string): { text: string; notes: string[] } {
  const decoded: unknown = JSON.parse(value);
  if (typeof decoded !== 'string' || decoded.length > 200000) throw new Error('invalid-package');
  const notes: string[] = [];
  const text = decoded.replace(/\[\[([\s\S]*?)\]\]/g, (_match, note: string) => { notes.push(note); return ''; });
  return { text, notes };
}

export function richText(value: string): QuranRichNode[] {
  if (value.length > 2000000) throw new Error('unsupported-format');
  const { document } = parseHTML(`<html><body>${value}</body></html>`);
  let count = 0;
  const walk = (node: typeof document.body, depth: number): QuranRichNode[] => {
    if (++count > 20000 || depth > 64) throw new Error('unsupported-format');
    if (node.nodeType === 3) return [{ tag: 'text', text: node.textContent || '' }];
    const name = node.nodeName.toLowerCase();
    if (['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'img', 'link', 'meta'].includes(name)) return [];
    const children = [...node.childNodes].flatMap(child => walk(child as typeof document.body, depth + 1));
    const tag = ({ strong: 'b', em: 'i', p: 'p', div: 'div', br: 'br', b: 'b', i: 'i', u: 'u', sup: 'sup' } as Record<string, QuranRichNode['tag']>)[name];
    return tag ? [{ tag, children }] : children;
  };
  return [...document.body.childNodes].flatMap(node => walk(node as typeof document.body, 0));
}

export class QuranReader {
  private databases = new Map<string, Database.Database>();
  constructor(private readonly root: string, private readonly packs: QuranPack[]) {}
  catalog(): QuranReaderCatalog {
    return { sources: this.packs.flatMap(pack => { const preset = readerPreset(pack); return preset ? [{ id: pack.id, title: pack.resource.title, kind: preset.kind, profile: preset.profile }] : []; }), presets: readerPresets.map(preset => ({ id: preset.id, title: preset.title, kind: preset.kind, installed: this.packs.some(pack => readerPreset(pack)?.id === preset.id) })) };
  }
  private source(id: string, kind: string) {
    const pack = this.packs.find(value => value.id === id);
    const preset = pack && readerPreset(pack);
    if (!pack || !preset || preset.kind !== kind || !/^[a-f0-9-]{36}$/.test(pack.id) || !/^[a-f0-9]{64}$/.test(pack.digest)) throw new Error('invalid-resource');
    return { pack, preset };
  }
  private async database(id: string, kind: string): Promise<Database.Database> {
    const { pack, preset } = this.source(id, kind);
    const cached = this.databases.get(id);
    if (cached) return cached;
    const parent = await realpath(path.join(this.root, 'packs', pack.id));
    if (path.dirname(parent) !== await realpath(path.join(this.root, 'packs'))) throw new Error('invalid-resource');
    const directory = path.join(this.root, 'derived');
    await mkdir(directory, { recursive: true });
    const key = createHash('sha256').update(`${pack.digest}:reader-v1:${kind}`).digest('hex');
    const filename = path.join(directory, `${key}.sqlite`);
    let database: Database.Database | undefined;
    try {
      database = new Database(filename, { readonly: true, fileMustExist: true });
      if (database.pragma('user_version', { simple: true }) !== 1) throw new Error('invalid-package');
    } catch {
      database?.close();
      const temporary = path.join(directory, `${randomUUID()}.sqlite`);
      try {
        if (kind === 'mushaf-layout') {
          const svgFiles = pack.files.filter(file => file.type === 'svg');
          if (!svgFiles.length) throw new Error('invalid-package');
          const working = new Database(temporary);
          try {
            working.pragma('trusted_schema = OFF');
            working.exec(`
              CREATE TABLE pages (page_number INTEGER PRIMARY KEY, surah_start INTEGER NOT NULL, ayah_start INTEGER NOT NULL, surah_end INTEGER NOT NULL, ayah_end INTEGER NOT NULL, svg TEXT NOT NULL, words_json TEXT NOT NULL);
              CREATE TABLE page_ayahs (surah INTEGER NOT NULL, ayah INTEGER NOT NULL, page_number INTEGER NOT NULL, PRIMARY KEY (surah, ayah, page_number));
              CREATE INDEX idx_page_ayahs_lookup ON page_ayahs (surah, ayah);
            `);
            const insertPage = working.prepare('INSERT INTO pages VALUES (?, ?, ?, ?, ?, ?, ?)');
            const insertPageAyah = working.prepare('INSERT OR IGNORE INTO page_ayahs VALUES (?, ?, ?)');
            const wordRegex = /<g\b([^>]*\bdata-surah="(\d+)"[^>]*\bdata-aya="(\d+)"[^>]*)>/g;
            const idRegex = /\bid="([^"]+)"/;
            const hafsRegex = /\bdata-hafs="([^"]+)"/;
            const imlaeyRegex = /\bdata-imlaey="([^"]+)"/;
            const wordIdxRegex = /\bdata-word-index-in-ayah="(\d+)"/;
            const typeRegex = /\bdata-type="([^"]+)"/;
            const lineRegex = /\bdata-line-number="(\d+)"/;

            const pagesData: { pageNumber: number; surahStart: number; ayahStart: number; surahEnd: number; ayahEnd: number; svg: string; words: QuranMushafWord[]; ayahKeys: [number, number][]; }[] = [];
            for (let i = 0; i < pack.files.length; i++) {
              const file = pack.files[i];
              if (file.type !== 'svg') continue;
              const filePath = await realpath(path.join(parent, `${i}.svg`));
              if (path.dirname(filePath) !== parent) throw new Error('invalid-resource');
              const text = await readFile(filePath, 'utf8');
              const pageMatch = text.match(/data-page-number="(\d+)"/) || file.name.match(/(\d+)\.svg/);
              if (!pageMatch) continue;
              const pageNumber = parseInt(pageMatch[1], 10);
              if (!pageNumber || pageNumber < 1 || pageNumber > 1000) continue;
              const words: QuranMushafWord[] = [];
              const ayahSet = new Set<string>();
              let surahStart = 999, ayahStart = 999, surahEnd = 0, ayahEnd = 0;
              let match: RegExpExecArray | null;
              wordRegex.lastIndex = 0;
              while ((match = wordRegex.exec(text)) !== null) {
                const full = match[1];
                const surah = parseInt(match[2], 10);
                const ayah = parseInt(match[3], 10);
                const wordId = full.match(idRegex)?.[1] || '';
                const textHafs = full.match(hafsRegex)?.[1];
                const imlaey = full.match(imlaeyRegex)?.[1];
                const wordIndex = parseInt(full.match(wordIdxRegex)?.[1] || '0', 10);
                const wordType = full.match(typeRegex)?.[1] as 'text' | 'aya-mark' | undefined;
                const line = parseInt(full.match(lineRegex)?.[1] || '0', 10);
                words.push({ id: wordId, surah, ayah, wordIndex, type: wordType, line: line || undefined, textHafs, imlaey });
                ayahSet.add(`${surah}:${ayah}`);
                if (surah < surahStart || (surah === surahStart && ayah < ayahStart)) { surahStart = surah; ayahStart = ayah; }
                if (surah > surahEnd || (surah === surahEnd && ayah > ayahEnd)) { surahEnd = surah; ayahEnd = ayah; }
              }
              const ayahKeys: [number, number][] = Array.from(ayahSet).map(s => { const [su, ay] = s.split(':'); return [Number(su), Number(ay)]; });
              pagesData.push({ pageNumber, surahStart: surahStart === 999 ? 0 : surahStart, ayahStart: ayahStart === 999 ? 0 : ayahStart, surahEnd, ayahEnd, svg: text, words, ayahKeys });
            }
            if (!pagesData.length) throw new Error('invalid-package');
            working.transaction(() => {
              for (const p of pagesData) {
                insertPage.run(p.pageNumber, p.surahStart, p.ayahStart, p.surahEnd, p.ayahEnd, p.svg, JSON.stringify(p.words));
                for (const [su, ay] of p.ayahKeys) insertPageAyah.run(su, ay, p.pageNumber);
              }
            })();
            working.pragma('user_version = 1');
          } finally { working.close(); }
        } else {
          const index = pack.files.findIndex(file => file.type === 'sqlite' && file.name === preset.filename.replace(/\.zip$/, ''));
          const source = await realpath(path.join(parent, `${index}.sqlite`));
          if (path.dirname(source) !== parent) throw new Error('invalid-resource');
          await copyFile(source, temporary);
          const working = new Database(temporary);
          try {
            working.pragma('trusted_schema = OFF');
            if (kind === 'script') {
              working.exec('CREATE INDEX baglib_words ON words(surah, ayah, word); CREATE VIRTUAL TABLE baglib_search USING fts5(surah UNINDEXED, ayah UNINDEXED, original UNINDEXED, normalized);');
              const insert = working.prepare('INSERT INTO baglib_search VALUES (?, ?, ?, ?)');
              const verses = working.prepare("SELECT surah, ayah, group_concat(text, ' ') AS text FROM (SELECT surah, ayah, text FROM words ORDER BY surah, ayah, word) GROUP BY surah, ayah").all() as { surah: number; ayah: number; text: string }[];
              if (!verses.length || verses.length > 7000) throw new Error('invalid-package');
              working.transaction(() => { for (const verse of verses) insert.run(verse.surah, verse.ayah, verse.text, normalizeQuranSearch(verse.text)); })();
            } else {
              const sql: Record<string, string> = { translation: 'CREATE INDEX baglib_translation ON translation(sura, ayah)', tafsir: 'CREATE INDEX baglib_tafsir ON tafsir(ayah_key)', 'word-translation': 'CREATE INDEX baglib_meanings ON word_translation(surah_number, ayah_number)', 'word-transliteration': 'CREATE INDEX baglib_transliteration ON word_transliteration(surah_number, ayah_number)', surahs: 'CREATE INDEX baglib_surahs ON chapters(id)' };
              working.exec(sql[kind]);
            }
            working.pragma('user_version = 1');
          } finally { working.close(); }
        }
        await rename(temporary, filename);
      } finally { await rm(temporary, { force: true }); }
      database = new Database(filename, { readonly: true });
    }
    database.pragma('trusted_schema = OFF');
    if (this.databases.size >= 12) { const [oldId, old] = this.databases.entries().next().value!; old.close(); this.databases.delete(oldId); }
    this.databases.set(id, database);
    return database;
  }
  async read(query: QuranReadQuery): Promise<QuranPassage> {
    if (!Number.isInteger(query.surah) || query.surah < 1 || query.surah > 114 || !Number.isInteger(query.from) || query.from < 1 || query.from > 300) throw new Error('invalid-resource');
    const { preset } = this.source(query.script, 'script');
    if (preset.profile !== 'hafs' && (query.translation || query.meanings || query.transliteration)) throw new Error('invalid-resource');
    const database = await this.database(query.script, 'script');
    const surahs = database.prepare('SELECT surah AS number, COUNT(DISTINCT ayah) AS count FROM words GROUP BY surah ORDER BY surah').all() as QuranPassage['surahs'];
    let basmala: string | undefined;
    const metadata = this.catalog().sources.find(source => source.kind === 'surahs' && source.profile === preset.profile);
    if (metadata) {
      const names = (await this.database(metadata.id, 'surahs')).prepare('SELECT id, name_arabic, name_simple, bismillah_pre FROM chapters').all() as { id: number; name_arabic: string; name_simple: string; bismillah_pre: number }[];
      for (const surah of surahs) { const name = names.find(value => value.id === surah.number); if (name) { surah.arabic = name.name_arabic; surah.name = name.name_simple; } }
      if (query.from === 1 && names.find(value => value.id === query.surah)?.bismillah_pre === 1) {
        const opening = database.prepare('SELECT text FROM words WHERE surah=1 AND ayah=1 ORDER BY word').all() as { text: string }[];
        basmala = opening.filter(word => !marker(word.text)).map(word => word.text).join(' ');
      }
    }
    const references = database.prepare('SELECT DISTINCT ayah FROM words WHERE surah=? AND ayah>=? ORDER BY ayah LIMIT 21').all(query.surah, query.from) as { ayah: number }[];
    const ayahs: QuranAyah[] = [];
    for (const reference of references.slice(0, 20)) {
      const words = database.prepare('SELECT id, surah, ayah, word, text FROM words WHERE surah=? AND ayah=? ORDER BY word LIMIT 1000').all(query.surah, reference.ayah) as Word[];
      ayahs.push({ number: reference.ayah, words: words.map(word => ({ position: word.word, text: word.text, marker: marker(word.text) })) });
    }
    if (query.translation) {
      const translation = await this.database(query.translation, 'translation');
      for (const ayah of ayahs) { const row = translation.prepare('SELECT text FROM translation WHERE sura=? AND ayah=?').get(query.surah, ayah.number) as { text: string } | undefined; if (row) ayah.translation = inlineTranslation(row.text); }
    }
    for (const [id, kind, table, property] of [[query.meanings, 'word-translation', 'word_translation', 'meaning'], [query.transliteration, 'word-transliteration', 'word_transliteration', 'transliteration']] as const) {
      if (!id) continue;
      const words = await this.database(id, kind);
      for (const ayah of ayahs) {
        if (kind === 'word-transliteration' && ['2:181', '8:6', '13:37', '36:52'].includes(`${query.surah}:${ayah.number}`)) continue;
        const rows = words.prepare(`SELECT word_number, text FROM ${table} WHERE surah_number=? AND ayah_number=?`).all(query.surah, ayah.number) as { word_number: string; text: string }[];
        for (const word of ayah.words) { const row = rows.find(value => Number(value.word_number) === word.position); if (!word.marker && row) word[property] = row.text; }
      }
    }
    return { profile: preset.profile, surah: query.surah, surahs, basmala, ayahs, next: references[20]?.ayah ?? null };
  }
  async search(script: string, text: string): Promise<QuranSearchHit[]> {
    if (typeof text !== 'string' || text.length > 200) throw new Error('invalid-resource');
    const terms = normalizeQuranSearch(text).trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const match = terms.map(term => `"${term.replaceAll('"', '""')}"`).join(' AND ');
    const database = await this.database(script, 'script');
    return database.prepare('SELECT surah, ayah, original AS text FROM baglib_search WHERE baglib_search MATCH ? ORDER BY rank LIMIT 30').all(match) as QuranSearchHit[];
  }
  async commentary(query: { script: string; pack: string; surah: number; ayah: number }): Promise<QuranCommentary> {
    if (this.source(query.script, 'script').preset.profile !== 'hafs' || !Number.isInteger(query.surah) || query.surah < 1 || query.surah > 114 || !Number.isInteger(query.ayah) || query.ayah < 1 || query.ayah > 300) throw new Error('invalid-resource');
    const database = await this.database(query.pack, 'tafsir');
    const seen = new Set<string>();
    let key = `${query.surah}:${query.ayah}`;
    while (!seen.has(key) && seen.size < 32) {
      seen.add(key);
      const row = database.prepare('SELECT text, group_ayah_key, from_ayah, to_ayah FROM tafsir WHERE ayah_key=?').get(key) as { text: string; group_ayah_key: string; from_ayah: string; to_ayah: string } | undefined;
      if (!row) break;
      if (row.text) return { from: row.from_ayah, to: row.to_ayah, nodes: richText(row.text) };
      key = row.group_ayah_key;
    }
    throw new Error('invalid-package');
  }
  async mushafPage(packId: string, pageNumber: number): Promise<QuranMushafPage> {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 604) throw new Error('invalid-resource');
    const { preset } = this.source(packId, 'mushaf-layout');
    const database = await this.database(packId, 'mushaf-layout');
    const row = database.prepare('SELECT page_number, surah_start, ayah_start, surah_end, ayah_end, svg, words_json FROM pages WHERE page_number = ?').get(pageNumber) as {
      page_number: number;
      surah_start: number;
      ayah_start: number;
      surah_end: number;
      ayah_end: number;
      svg: string;
      words_json: string;
    } | undefined;
    if (!row) throw new Error('invalid-resource');
    const countRow = database.prepare('SELECT COUNT(*) AS total FROM pages').get() as { total: number };
    return {
      pageNumber: row.page_number,
      totalPages: countRow?.total || 604,
      surahStart: row.surah_start,
      ayahStart: row.ayah_start,
      surahEnd: row.surah_end,
      ayahEnd: row.ayah_end,
      svg: row.svg,
      profile: preset.profile,
      words: JSON.parse(row.words_json),
    };
  }
  async mushafPageForAyah(packId: string, surah: number, ayah: number): Promise<{ pageNumber: number }> {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1 || ayah > 300) throw new Error('invalid-resource');
    this.source(packId, 'mushaf-layout');
    const database = await this.database(packId, 'mushaf-layout');
    const row = database.prepare('SELECT page_number FROM page_ayahs WHERE surah = ? AND ayah = ? ORDER BY page_number ASC LIMIT 1').get(surah, ayah) as { page_number: number } | undefined;
    if (!row) throw new Error('invalid-resource');
    return { pageNumber: row.page_number };
  }
  close(): void { for (const database of this.databases.values()) database.close(); this.databases.clear(); }
}
