import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, rename, rm, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import type { QuranAudioSegment, QuranAyah, QuranAyahAudio, QuranAyahTheme, QuranCommentary, QuranDivision, QuranMushafPage, QuranMushafWord, QuranPack, QuranPassage, QuranReadQuery, QuranReaderCatalog, QuranRichNode, QuranSearchHit, QuranSimilarAyah, QuranStructure, QuranSurahIntro, QuranTopic } from '../../../shared/types/quran';
import { normalizeQuranSearch } from './qul-catalog';
import type { QuranFrequency, QuranFrequencyFamily, QuranFrequencyPlace, QuranFrequencyQuery } from '../../../shared/types/quran';
import { readerPreset, readerPresets } from './reader-resources';
import { buildWarshLayout, type WarshLayout, type WarshLayoutWord } from './warsh-layout';

/** Roots are stored spaced, as in "ر ح م"; a reader types them joined. */
const frequencyText = (value: string) => normalizeQuranSearch(value).replace(/\s/gu, '');

type Word = { id: number; surah: number; ayah: number; word: number; text: string };
const marker = (text: string) => /^[\u0660-\u0669]+$/.test(text.trim());
type TopicRow = {
  topic_id: number; name: string; arabic_name: string; parent_id: number | null; thematic_parent_id: number | null; ontology_parent_id: number | null;
  description: string; wiki_link: string; thematic: number; ontology: number; ayahs: string | null; related_topics: string | null;
};
const topicColumns = 'topic_id, name, arabic_name, parent_id, thematic_parent_id, ontology_parent_id, description, wiki_link, thematic, ontology, ayahs, related_topics';

export function inlineTranslation(value: string) {
  const decoded = JSON.parse(value);
  if (typeof decoded !== 'string' || decoded.length > 200000) throw new Error('invalid-package');
  const notes: string[] = [];
  const anchors: { offset: number; note: number }[] = [];
  let text = '';
  let cursor = 0;
  for (const match of decoded.matchAll(/\[\[([\s\S]*?)\]\]/g)) {
    text += decoded.slice(cursor, match.index);
    notes.push(match[1]);
    anchors.push({ offset: text.length, note: notes.length });
    cursor = match.index! + match[0].length;
  }
  text += decoded.slice(cursor);
  return { text, notes, anchors };
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
    const tag = ({ strong: 'b', em: 'i', p: 'p', div: 'div', br: 'br', b: 'b', i: 'i', u: 'u', sup: 'sup', h1: 'h2', h2: 'h2', h3: 'h3', h4: 'h3' } as Record<string, QuranRichNode['tag']>)[name];
    return tag ? [{ tag, children }] : children;
  };
  return [...document.body.childNodes].flatMap(node => walk(node as typeof document.body, 0));
}

export class QuranReader {
  private databases = new Map<string, Database.Database>();
  private warshLayouts = new Map<string, Promise<WarshLayout>>();
  constructor(private readonly root: string, private readonly packs: QuranPack[]) {}
  catalog(): QuranReaderCatalog {
    return { sources: this.packs.flatMap(pack => { const preset = readerPreset(pack); return preset ? [{ id: pack.id, title: pack.resource.title, kind: preset.kind, profile: preset.profile, language: preset.language }] : []; }), presets: readerPresets.map(preset => ({ id: preset.id, title: preset.title, kind: preset.kind, installed: this.packs.some(pack => readerPreset(pack)?.id === preset.id), importOnly: preset.importOnly })) };
  }
  private source(id: string, kind: string) {
    const pack = this.packs.find(value => value.id === id);
    const preset = pack && readerPreset(pack);
    if (!pack || !preset || preset.kind !== kind || !/^[a-f0-9-]{36}$/.test(pack.id) || !/^[a-f0-9]{64}$/.test(pack.digest)) throw new Error('invalid-resource');
    return { pack, preset };
  }
  private async database(id: string, kind: string): Promise<Database.Database> {
    const { pack } = this.source(id, kind);
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
          const index = pack.files.findIndex(file => file.type === 'sqlite');
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
            } else if (kind === 'ayah-topics') {
              working.exec(`
                CREATE INDEX IF NOT EXISTS baglib_topics_id ON topics(topic_id);
                CREATE TABLE IF NOT EXISTS topic_ayahs (topic_id INTEGER NOT NULL, surah INTEGER NOT NULL, ayah INTEGER NOT NULL, PRIMARY KEY(surah, ayah, topic_id));
                CREATE INDEX IF NOT EXISTS idx_topic_ayahs_lookup ON topic_ayahs(surah, ayah);
                CREATE VIRTUAL TABLE IF NOT EXISTS baglib_topics_search USING fts5(topic_id UNINDEXED, name, arabic_name, description);
              `);
              const insertSearch = working.prepare('INSERT INTO baglib_topics_search VALUES (?, ?, ?, ?)');
              const insertAyah = working.prepare('INSERT OR IGNORE INTO topic_ayahs VALUES (?, ?, ?)');
              const rows = working.prepare('SELECT topic_id, name, arabic_name, description, ayahs FROM topics').all() as { topic_id: number; name: string; arabic_name: string; description: string; ayahs: string | null }[];
              working.transaction(() => {
                for (const row of rows) {
                  insertSearch.run(row.topic_id, row.name || '', row.arabic_name || '', row.description || '');
                  if (row.ayahs) {
                    const refs = row.ayahs.split(',').map(s => s.trim()).filter(Boolean);
                    for (const ref of refs) {
                      const [sStr, aStr] = ref.split(':');
                      const s = Number(sStr);
                      const a = Number(aStr);
                      if (Number.isInteger(s) && Number.isInteger(a) && s >= 1 && s <= 114 && a >= 1 && a <= 300) {
                        insertAyah.run(row.topic_id, s, a);
                      }
                    }
                  }
                }
              })();
            } else {
              const sql: Record<string, string> = {
                translation: 'CREATE INDEX baglib_translation ON translation(sura, ayah)',
                tafsir: 'CREATE INDEX baglib_tafsir ON tafsir(ayah_key)',
                'word-translation': 'CREATE INDEX baglib_meanings ON word_translation(surah_number, ayah_number)',
                'word-transliteration': 'CREATE INDEX baglib_transliteration ON word_transliteration(surah_number, ayah_number)',
                'ayah-transliteration': 'CREATE INDEX baglib_ayah_transliteration ON transliterations(sura, ayah)',
                surahs: 'CREATE INDEX baglib_surahs ON chapters(id)',
                recitation: 'CREATE INDEX baglib_recitation ON verses(surah_number, ayah_number)',
                'surah-info': 'CREATE INDEX baglib_surah_info ON surah_infos(surah_number)',
                'ayah-theme': 'CREATE INDEX baglib_ayah_theme ON themes(surah_number, ayah_from, ayah_to)',
                'similar-ayah': 'CREATE INDEX IF NOT EXISTS baglib_similar_verse ON similar_ayahs(verse_key); CREATE INDEX IF NOT EXISTS baglib_similar_matched ON similar_ayahs(matched_ayah_key);',
                'glyph-script': 'CREATE INDEX baglib_glyph_id ON words(id); CREATE INDEX baglib_glyph_location ON words(surah,ayah,word)',
                'glyph-layout': 'CREATE INDEX baglib_glyph_page ON pages(page_number,line_number)',
                'word-root': 'CREATE INDEX baglib_root_location ON root_words(word_location)',
                'word-lemma': 'CREATE INDEX baglib_lemma_location ON lemma_words(word_location)',
                'word-stem': 'CREATE INDEX baglib_stem_location ON stem_words(word_location)',
              };
              if (sql[kind]) working.exec(sql[kind]);
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
    if (query.translation && this.source(query.translation, 'translation').preset.profile !== preset.profile) throw new Error('invalid-resource');
    if (query.meanings && this.source(query.meanings, 'word-translation').preset.profile !== preset.profile) throw new Error('invalid-resource');
    if (query.transliteration && this.source(query.transliteration, 'word-transliteration').preset.profile !== preset.profile) throw new Error('invalid-resource');
    if (query.ayahTransliteration && this.source(query.ayahTransliteration, 'ayah-transliteration').preset.profile !== preset.profile) throw new Error('invalid-resource');
    const database = await this.database(query.script, 'script');
    const surahs = database.prepare('SELECT surah AS number, COUNT(DISTINCT ayah) AS count FROM words GROUP BY surah ORDER BY surah').all() as QuranPassage['surahs'];
    let basmala: string | undefined;
    const metadata = this.catalog().sources.find(source => source.kind === 'surahs' && source.profile === preset.profile);
    if (metadata) {
      const names = (await this.database(metadata.id, 'surahs')).prepare('SELECT * FROM chapters').all() as { id: number; name_arabic: string; name_simple: string; bismillah_pre: number; revelation_place?: string; revelation_order?: number }[];
      for (const surah of surahs) { const name = names.find(value => value.id === surah.number); if (name) { surah.arabic = name.name_arabic; surah.name = name.name_simple; surah.revelationPlace = name.revelation_place; surah.revelationOrder = name.revelation_order; } }
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
    if (query.ayahTransliteration) {
      const lines = await this.database(query.ayahTransliteration, 'ayah-transliteration');
      for (const ayah of ayahs) { const row = lines.prepare('SELECT text FROM transliterations WHERE sura=? AND ayah=?').get(query.surah, ayah.number) as { text: string } | undefined; if (row) ayah.transliteration = richText(row.text); }
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
    const scriptSource = this.source(query.script, 'script');
    const tafsirSource = this.source(query.pack, 'tafsir');
    if (scriptSource.preset.profile !== tafsirSource.preset.profile || !Number.isInteger(query.surah) || query.surah < 1 || query.surah > 114 || !Number.isInteger(query.ayah) || query.ayah < 1 || query.ayah > 300) throw new Error('invalid-resource');
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
  async inspectAyah(query: { script: string; layout?: string; surah: number; ayah: number }) {
    const passage = await this.read({ script: query.script, surah: query.surah, from: query.ayah });
    const ayah = passage.ayahs.find(value => value.number === query.ayah);
    if (!ayah) throw new Error('invalid-resource');
    let imlaey: string | null = null;
    if (query.layout) {
      const layoutSource = this.source(query.layout, 'mushaf-layout');
      if (layoutSource.preset.profile === passage.profile) {
        const database = await this.database(query.layout, 'mushaf-layout');
        const pages = database.prepare('SELECT words_json FROM pages WHERE page_number IN (SELECT page_number FROM page_ayahs WHERE surah=? AND ayah=?) ORDER BY page_number').all(query.surah, query.ayah) as { words_json: string }[];
        const words = pages.flatMap(page => JSON.parse(page.words_json) as QuranMushafWord[]).filter(word => word.surah === query.surah && word.ayah === query.ayah && word.type !== 'aya-mark');
        if (words.length && words.every(word => word.imlaey)) {
          imlaey = words.map(word => parseHTML(`<html><body>${word.imlaey}</body></html>`).document.body.textContent).join(' ');
        }
      }
    }
    return { surah: query.surah, ayah: query.ayah, profile: passage.profile, canonical: ayah.words.map(word => word.text).join(' '), imlaey };
  }
  async mushafPage(packId: string, pageNumber: number, scriptId?: string): Promise<QuranMushafPage> {
    if (scriptId && this.source(scriptId, 'script').preset.profile === 'warsh') {
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 604) throw new Error('invalid-resource');
      const layout = await this.warshLayout(packId, scriptId);
      const page = layout.pages.get(pageNumber);
      if (!page) throw new Error('invalid-resource');
      const font = this.catalog().sources.find(source => source.kind === 'font' && source.profile === 'warsh');
      if (!font) throw new Error('invalid-resource');
      const { pack } = this.source(font.id, 'font');
      const index = pack.files.findIndex(file => file.type === 'font');
      const directory = await realpath(path.join(this.root, 'packs', pack.id));
      const filename = await realpath(path.join(directory, `${index}.bin`));
      if (path.dirname(filename) !== directory) throw new Error('invalid-resource');
      return { ...page, fontUrl: `baglib-asset://${filename.replace(/\\/g, '/')}` };
    }
    if (this.catalog().sources.find(source => source.id === packId)?.kind === 'glyph-layout') return this.glyphPage(packId, pageNumber);
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
  async mushafPageForAyah(packId: string, surah: number, ayah: number, scriptId?: string): Promise<{ pageNumber: number }> {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1 || ayah > 300) throw new Error('invalid-resource');
    if (scriptId && this.source(scriptId, 'script').preset.profile === 'warsh') {
      const layout = await this.warshLayout(packId, scriptId);
      const pageNumber = layout.references.get(`${surah}:${ayah}`);
      if (!pageNumber) throw new Error('invalid-resource');
      return { pageNumber };
    }
    if (this.catalog().sources.find(source => source.id === packId)?.kind === 'glyph-layout') {
      const glyph = this.catalog().sources.find(source => source.kind === 'glyph-script');
      if (!glyph) throw new Error('invalid-resource');
      const words = await this.database(glyph.id, 'glyph-script');
      const word = words.prepare('SELECT id FROM words WHERE surah=? AND ayah=? ORDER BY word LIMIT 1').get(surah, ayah) as { id: number } | undefined;
      const layout = await this.database(packId, 'glyph-layout');
      const row = word && layout.prepare('SELECT page_number FROM pages WHERE first_word_id<=? AND last_word_id>=? ORDER BY page_number LIMIT 1').get(word.id, word.id) as { page_number: number } | undefined;
      if (!row) throw new Error('invalid-resource');
      return { pageNumber: row.page_number };
    }
    this.source(packId, 'mushaf-layout');
    const database = await this.database(packId, 'mushaf-layout');
    const row = database.prepare('SELECT page_number FROM page_ayahs WHERE surah = ? AND ayah = ? ORDER BY page_number ASC LIMIT 1').get(surah, ayah) as { page_number: number } | undefined;
    if (!row) throw new Error('invalid-resource');
    return { pageNumber: row.page_number };
  }
  async recitationAudio(packId: string, surah: number, ayah: number): Promise<QuranAyahAudio> {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1 || ayah > 300) throw new Error('invalid-resource');
    const row = (await this.recitationSurah(packId, surah)).find(value => value.ayah === ayah);
    if (!row) throw new Error('invalid-resource');
    return row;
  }
  async recitationSurah(packId: string, surah: number): Promise<QuranAyahAudio[]> {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) throw new Error('invalid-resource');
    const { preset } = this.source(packId, 'recitation');
    const database = await this.database(packId, 'recitation');
    const rows = database.prepare('SELECT surah_number, ayah_number, audio_url, duration, segments FROM verses WHERE surah_number = ? ORDER BY ayah_number ASC').all(surah) as {
      surah_number: number;
      ayah_number: number;
      audio_url: string;
      duration: number | null;
      segments: string | null;
    }[];
    const seen = new Set<number>();
    return rows.map(row => {
      const reference = new URL(row.audio_url).pathname.match(/\/(\d{3})(\d{3})\.mp3$/);
      const localAyah = Number(reference?.[2]);
      if (!reference || Number(reference[1]) !== surah || localAyah < 1 || localAyah > 300 || seen.has(localAyah)) throw new Error('invalid-resource');
      seen.add(localAyah);
      let segments: QuranAudioSegment[] = [];
      if (row.segments) {
        try {
          const parsed = JSON.parse(row.segments);
          if (Array.isArray(parsed)) {
            segments = parsed.filter(s => Array.isArray(s) && s.length >= 4 && typeof s[2] === 'number' && typeof s[3] === 'number');
          }
        } catch {}
      }
      return {
        surah: row.surah_number,
        ayah: localAyah,
        audioUrl: row.audio_url,
        duration: row.duration ?? null,
        segments,
        profile: preset.profile,
      };
    }).sort((first, second) => first.ayah - second.ayah);
  }
  async morphology(script: string, surah: number, ayah: number): Promise<import('../../../shared/types/quran').QuranMorphology[]> {
    if (this.source(script, 'script').preset.profile !== 'hafs' || !Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1 || ayah > 300) throw new Error('invalid-resource');
    const values = new Map<string, import('../../../shared/types/quran').QuranMorphology>();
    for (const family of ['root', 'lemma', 'stem'] as const) {
      const kind = `word-${family}`;
      const source = this.catalog().sources.find(item => item.kind === kind);
      if (!source) continue;
      const database = await this.database(source.id, kind);
      const field = family === 'root' ? 'arabic_trilateral' : 'text';
      const rows = database.prepare(`SELECT link.word_location AS location, entry.${field} AS text FROM ${family}_words link JOIN ${family}s entry ON entry.id=link.${family}_id WHERE link.word_location GLOB ? LIMIT 600`).all(`${surah}:${ayah}:*`) as { location: string; text: string }[];
      for (const row of rows) {
        const record = values.get(row.location) || { location: row.location };
        record[family] = row.text;
        values.set(row.location, record);
      }
    }
    return [...values.values()].sort((first, second) => Number(first.location.split(':')[2]) - Number(second.location.split(':')[2]));
  }
  private async frequencySource(family: QuranFrequencyFamily) {
    const kind = `word-${family}`;
    const source = this.catalog().sources.find(item => item.kind === kind);
    if (!source) throw new Error('missing-resource');
    return { database: await this.database(source.id, kind), field: family === 'root' ? 'arabic_trilateral' : 'text' };
  }
  /** Counts come from the installed morphology pack's word links, never from matching text. */
  async frequency(query: QuranFrequencyQuery): Promise<QuranFrequency> {
    const { family, surah } = query;
    const { database, field } = await this.frequencySource(family);
    const within = surah ? 'WHERE link.word_location GLOB ?' : '';
    // The pack's own total agrees with the Quranic Arabic Corpus. Its word links run wider for 14 roots: they
    // also tie names and compounds such as محمد and يومئذ to a root. The total covers the whole Quran only.
    const hasTotal = !surah && (database.pragma(`table_info(${family}s)`) as { name: string }[]).some(column => column.name === 'words_count');
    const rows = database.prepare(`SELECT entry.${field} AS text, COUNT(*) AS count${hasTotal ? ', entry.words_count AS stated' : ''} FROM ${family}_words link JOIN ${family}s entry ON entry.id=link.${family}_id ${within} GROUP BY entry.id ORDER BY count DESC, text`).all(...(surah ? [`${surah}:*`] : [])) as { text: string; count: number; stated?: number }[];
    const wanted = frequencyText(query.text ?? '');
    return { family, total: rows.reduce((sum, row) => sum + row.count, 0), distinct: rows.length, rows: rows.filter(row => frequencyText(row.text).includes(wanted)).slice(0, query.limit ?? 100) };
  }
  async frequencyPlaces(family: QuranFrequencyFamily, text: string): Promise<QuranFrequencyPlace[]> {
    const { database, field } = await this.frequencySource(family);
    const rows = database.prepare(`SELECT link.word_location AS location FROM ${family}_words link JOIN ${family}s entry ON entry.id=link.${family}_id WHERE entry.${field}=?`).all(text) as { location: string }[];
    const places = new Map<string, QuranFrequencyPlace>();
    for (const { location } of rows) {
      const [surah, ayah] = location.split(':').map(Number);
      const key = `${surah}:${ayah}`;
      places.set(key, { surah, ayah, count: (places.get(key)?.count ?? 0) + 1 });
    }
    return [...places.values()].sort((first, second) => first.surah - second.surah || first.ayah - second.ayah);
  }
  private warshLayout(packId: string, scriptId: string): Promise<WarshLayout> {
    this.source(packId, 'mushaf-layout');
    if (this.source(scriptId, 'script').preset.profile !== 'warsh') throw new Error('invalid-resource');
    const key = `${packId}:${scriptId}`;
    const cached = this.warshLayouts.get(key);
    if (cached) return cached;
    const pending = (async () => {
      const template = await this.database(packId, 'mushaf-layout');
      const pages = template.prepare('SELECT page_number,words_json FROM pages ORDER BY page_number').all() as { page_number: number; words_json: string }[];
      const script = await this.database(scriptId, 'script');
      const words = script.prepare('SELECT id,surah,ayah,word,text FROM words ORDER BY surah,ayah,word').all() as WarshLayoutWord[];
      return buildWarshLayout(pages.map(page => ({ pageNumber: page.page_number, words: JSON.parse(page.words_json) as QuranMushafWord[] })), words);
    })();
    this.warshLayouts.set(key, pending);
    void pending.catch(() => this.warshLayouts.delete(key));
    return pending;
  }
  private async glyphPage(packId: string, pageNumber: number): Promise<QuranMushafPage> {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 604) throw new Error('invalid-resource');
    const sources = this.catalog().sources;
    const glyph = sources.find(source => source.kind === 'glyph-script' && source.profile === 'hafs');
    const canonical = sources.find(source => source.kind === 'script' && source.profile === 'hafs');
    const font = sources.find(source => source.kind === 'font' && source.profile === 'hafs');
    if (!glyph || !canonical || !font) throw new Error('invalid-resource');
    const layout = await this.database(packId, 'glyph-layout');
    const glyphs = await this.database(glyph.id, 'glyph-script');
    const script = await this.database(canonical.id, 'script');
    const { pack: fonts } = this.source(font.id, 'font');
    const index = fonts.files.findIndex(file => file.type === 'font' && new RegExp(`(?:^|/)p${pageNumber}\\.(?:woff2|ttf)$`).test(file.name));
    if (index < 0) throw new Error('invalid-resource');
    const fontPath = await realpath(path.join(this.root, 'packs', fonts.id, `${index}.bin`));
    if (path.dirname(fontPath) !== await realpath(path.join(this.root, 'packs', fonts.id))) throw new Error('invalid-resource');
    const rows = layout.prepare('SELECT line_number,line_type,is_centered,first_word_id,last_word_id,surah_number FROM pages WHERE page_number=? ORDER BY line_number').all(pageNumber) as { line_number: number; line_type: string; is_centered: number; first_word_id: number; last_word_id: number; surah_number: number }[];
    if (!rows.length || rows.length > 20) throw new Error('invalid-package');
    const words: QuranMushafWord[] = [];
    const lines: NonNullable<QuranMushafPage['glyphLines']> = [];
    for (const row of rows) {
      const tokens = row.line_type === 'ayah' ? glyphs.prepare('SELECT id,surah,ayah,word,text FROM words WHERE id BETWEEN ? AND ? ORDER BY id').all(row.first_word_id, row.last_word_id) as Word[] : [];
      const lineWords = tokens.map(token => {
        const original = script.prepare('SELECT surah,ayah,word,text FROM words WHERE id=?').get(token.id) as Word | undefined;
        if (!original || original.surah !== token.surah || original.ayah !== token.ayah || original.word !== token.word) throw new Error('invalid-package');
        words.push({ id: String(token.id), surah: token.surah, ayah: token.ayah, wordIndex: token.word, type: marker(original.text) ? 'aya-mark' : 'text', line: row.line_number, textHafs: original.text });
        return { surah: token.surah, ayah: token.ayah, position: token.word, glyph: token.text, text: original.text };
      });
      lines.push({ number: row.line_number, type: row.line_type, centered: Boolean(row.is_centered), surah: Number(row.surah_number) || 0, words: lineWords });
    }
    if (!words.length) throw new Error('invalid-package');
    const basmala = (script.prepare('SELECT text FROM words WHERE surah=1 AND ayah=1 ORDER BY word').all() as { text: string }[]).filter(word => !marker(word.text)).map(word => word.text).join(' ');
    return { pageNumber, totalPages: 604, profile: 'hafs', svg: '', fontUrl: `baglib-asset://${fontPath.replace(/\\/g, '/')}`, basmala, glyphLines: lines, words, surahStart: words[0].surah, ayahStart: words[0].ayah, surahEnd: words[words.length - 1].surah, ayahEnd: words[words.length - 1].ayah };
  }
  async mutashabihat(script: string, surah: number, ayah: number): Promise<import('../../../shared/types/quran').QuranPhraseMatch[]> {
    if (this.source(script, 'script').preset.profile !== 'hafs' || !Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1 || ayah > 300) throw new Error('invalid-resource');
    const source = this.catalog().sources.find(item => item.kind === 'mutashabihat');
    if (!source) return [];
    const { pack } = this.source(source.id, 'mutashabihat');
    const read = async (name: string) => {
      const index = pack.files.findIndex(file => file.name === name && file.type === 'json');
      if (index < 0 || pack.files[index].bytes > 8 * 1024 * 1024) throw new Error('invalid-package');
      const directory = await realpath(path.join(this.root, 'packs', pack.id));
      const filename = await realpath(path.join(directory, `${index}.json`));
      if (path.dirname(filename) !== directory) throw new Error('invalid-resource');
      return JSON.parse(await readFile(filename, 'utf8'));
    };
    const locations = await read('phrase_verses.json') as Record<string, number[]>;
    const phrases = await read('phrases.json') as Record<string, { source: { key: string; from: number; to: number }; ayah: Record<string, [number, number][]> }>;
    const ids = locations[`${surah}:${ayah}`] || [];
    if (!Array.isArray(ids) || ids.length > 500) throw new Error('invalid-package');
    const database = await this.database(script, 'script');
    return ids.slice(0, 50).map(id => {
      const phrase = phrases[String(id)];
      if (!phrase || !/^\d{1,3}:\d{1,3}$/.test(phrase.source.key)) throw new Error('invalid-package');
      const [sourceSurah, sourceAyah] = phrase.source.key.split(':').map(Number);
      const tokens = database.prepare('SELECT text FROM words WHERE surah=? AND ayah=? AND word BETWEEN ? AND ? ORDER BY word').all(sourceSurah, sourceAyah, phrase.source.from, phrase.source.to) as { text: string }[];
      const references = Object.keys(phrase.ayah);
      return { id, text: tokens.map(token => token.text).join(' '), source: phrase.source.key, ranges: phrase.ayah[`${surah}:${ayah}`] || [], references: references.slice(0, 100), total: references.length };
    });
  }
  private resolvePack(kind: string, packId?: string): string {
    if (packId) {
      this.source(packId, kind);
      return packId;
    }
    const sources = this.catalog().sources.filter(s => s.kind === kind);
    const match = sources.find(s => !s.language) || sources[0];
    if (!match) throw new Error('invalid-resource');
    return match.id;
  }
  async surahIntro(packId: string | undefined, surah: number): Promise<QuranSurahIntro | null> {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) throw new Error('invalid-resource');
    const id = this.resolvePack('surah-info', packId);
    const database = await this.database(id, 'surah-info');
    const row = database.prepare('SELECT surah_number, surah_name, text, short_text FROM surah_infos WHERE surah_number = ?').get(surah) as {
      surah_number: number;
      surah_name: string;
      text: string;
      short_text: string;
    } | undefined;
    if (!row) return null;
    return {
      surahNumber: row.surah_number,
      surahName: row.surah_name,
      text: row.text,
      shortText: row.short_text,
      nodes: richText(row.text),
    };
  }
  async ayahThemes(packId: string | undefined, surah: number, ayah?: number): Promise<QuranAyahTheme[]> {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) throw new Error('invalid-resource');
    if (ayah !== undefined && (!Number.isInteger(ayah) || ayah < 1 || ayah > 300)) throw new Error('invalid-resource');
    const id = this.resolvePack('ayah-theme', packId);
    const { preset } = this.source(id, 'ayah-theme');
    if (preset.profile !== 'hafs') throw new Error('invalid-resource');
    const database = await this.database(id, 'ayah-theme');
    const rows = (ayah !== undefined
      ? database.prepare('SELECT theme, surah_number, ayah_from, ayah_to, keywords, total_ayahs FROM themes WHERE surah_number = ? AND ayah_from <= ? AND ayah_to >= ? ORDER BY ayah_from, ayah_to').all(surah, ayah, ayah)
      : database.prepare('SELECT theme, surah_number, ayah_from, ayah_to, keywords, total_ayahs FROM themes WHERE surah_number = ? ORDER BY ayah_from, ayah_to').all(surah)) as {
        theme: string;
        surah_number: number;
        ayah_from: number;
        ayah_to: number;
        keywords: string | null;
        total_ayahs: number;
      }[];
    return rows.map(r => ({
      theme: r.theme,
      surahNumber: r.surah_number,
      ayahFrom: r.ayah_from,
      ayahTo: r.ayah_to,
      keywords: r.keywords ? r.keywords.split(',').map(k => k.trim()).filter(Boolean) : [],
      totalAyahs: r.total_ayahs,
    }));
  }
  private topic(row: TopicRow): QuranTopic {
    const ayahs: { surah: number; ayah: number }[] = [];
    for (const item of (row.ayahs || '').split(',').map(value => value.trim()).filter(Boolean)) {
      const [surah, ayah] = item.split(':').map(Number);
      if (surah && ayah) ayahs.push({ surah, ayah });
    }
    return {
      topicId: row.topic_id,
      name: row.name,
      arabicName: row.arabic_name,
      parentId: row.parent_id ?? null,
      thematicParentId: row.thematic_parent_id ?? null,
      ontologyParentId: row.ontology_parent_id ?? null,
      description: row.description || '',
      wikiLink: row.wiki_link || '',
      thematic: Boolean(row.thematic),
      ontology: Boolean(row.ontology),
      ayahs,
      relatedTopics: (row.related_topics || '').split(',').map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value > 0),
    };
  }
  async ayahTopics(packId: string | undefined, surah: number, ayah: number): Promise<QuranTopic[]> {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1 || ayah > 300) throw new Error('invalid-resource');
    const id = this.resolvePack('ayah-topics', packId);
    const { preset } = this.source(id, 'ayah-topics');
    if (preset.profile !== 'hafs') throw new Error('invalid-resource');
    const database = await this.database(id, 'ayah-topics');
    const rows = database.prepare(`
      SELECT ${topicColumns.split(', ').map(column => `t.${column}`).join(', ')}
      FROM topic_ayahs ta
      JOIN topics t ON ta.topic_id = t.topic_id
      WHERE ta.surah = ? AND ta.ayah = ?
      ORDER BY t.name ASC
    `).all(surah, ayah) as TopicRow[];
    return rows.map(row => this.topic(row));
  }
  async topics(packId: string | undefined, ids: number[]): Promise<QuranTopic[]> {
    if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error('invalid-resource');
    if (!ids.length) return [];
    const database = await this.database(this.resolvePack('ayah-topics', packId), 'ayah-topics');
    const rows = database.prepare(`SELECT ${topicColumns} FROM topics WHERE topic_id IN (${ids.map(() => '?').join(',')})`).all(...ids) as TopicRow[];
    return rows.map(row => this.topic(row));
  }
  async searchTopics(packId: string | undefined, text: string): Promise<QuranTopic[]> {
    if (typeof text !== 'string' || text.length > 200) throw new Error('invalid-resource');
    const query = text.trim();
    if (!query) return [];
    const id = this.resolvePack('ayah-topics', packId);
    const database = await this.database(id, 'ayah-topics');
    const terms = query.split(/\s+/).filter(Boolean);
    const match = terms.map(term => `"${term.replaceAll('"', '""')}"*`).join(' AND ');
    let rows: TopicRow[] = [];
    try {
      rows = database.prepare(`
        SELECT ${topicColumns.split(', ').map(column => `t.${column}`).join(', ')}
        FROM baglib_topics_search s
        JOIN topics t ON s.topic_id = t.topic_id
        WHERE baglib_topics_search MATCH ?
        LIMIT 30
      `).all(match) as TopicRow[];
    } catch {
      rows = database.prepare(`SELECT ${topicColumns} FROM topics WHERE name LIKE ? OR arabic_name LIKE ? LIMIT 30`).all(`%${query}%`, `%${query}%`) as TopicRow[];
    }
    return rows.map(row => this.topic(row));
  }
  async structure(): Promise<QuranStructure> {
    const rows = async <Row>(kind: 'juz' | 'hizb' | 'rub' | 'ruku' | 'manzil' | 'sajda', sql: string): Promise<Row[]> => {
      const source = this.catalog().sources.find(item => item.kind === kind);
      return source ? (await this.database(source.id, kind)).prepare(sql).all() as Row[] : [];
    };
    const divisions = (kind: 'juz' | 'hizb' | 'rub' | 'manzil', table: string, column = `${kind}_number`) =>
      rows<QuranDivision>(kind, `SELECT ${column} AS number, first_verse_key AS first, last_verse_key AS last FROM ${table} ORDER BY ${column}`);
    return {
      juz: await divisions('juz', 'juz'),
      hizb: await divisions('hizb', 'hizbs'),
      rub: await divisions('rub', 'rub'),
      manzil: await divisions('manzil', 'manzil'),
      ruku: await rows<QuranDivision>('ruku', 'SELECT ruku_number AS number, first_verse_key AS first, last_verse_key AS last, surah_ruku_number AS surahRuku FROM ruku ORDER BY ruku_number'),
      sajdah: await rows<QuranStructure['sajdah'][number]>('sajda', 'SELECT sajdah_number AS number, verse_key AS reference, sajdah_type AS type FROM sajdah ORDER BY sajdah_number'),
    };
  }
  async similarAyahs(packId: string | undefined, surah: number, ayah: number): Promise<QuranSimilarAyah[]> {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1 || ayah > 300) throw new Error('invalid-resource');
    const id = this.resolvePack('similar-ayah', packId);
    const { preset } = this.source(id, 'similar-ayah');
    if (preset.profile !== 'hafs') throw new Error('invalid-resource');
    const database = await this.database(id, 'similar-ayah');
    const verseKey = `${surah}:${ayah}`;
    const rows = database.prepare(`
      SELECT verse_key, matched_ayah_key, matched_words_count, coverage, score, match_words_range
      FROM similar_ayahs
      WHERE verse_key = ?
      ORDER BY score DESC, coverage DESC
    `).all(verseKey) as {
      verse_key: string;
      matched_ayah_key: string;
      matched_words_count: number;
      coverage: number;
      score: number;
      match_words_range: string | null;
    }[];
    return rows.map(r => {
      const [mSurah, mAyah] = r.matched_ayah_key.split(':').map(Number);
      let matchWordsRange: [number, number][] = [];
      if (r.match_words_range) {
        try {
          const parsed = JSON.parse(r.match_words_range);
          if (Array.isArray(parsed)) {
            matchWordsRange = parsed.filter(item => Array.isArray(item) && item.length === 2 && typeof item[0] === 'number' && typeof item[1] === 'number');
          }
        } catch {}
      }
      return {
        verseKey: r.verse_key,
        matchedAyahKey: r.matched_ayah_key,
        surah: mSurah,
        ayah: mAyah,
        matchedWordsCount: r.matched_words_count,
        coverage: r.coverage,
        score: r.score,
        matchWordsRange,
      };
    });
  }
  close(): void { for (const database of this.databases.values()) database.close(); this.databases.clear(); this.warshLayouts.clear(); }
}
