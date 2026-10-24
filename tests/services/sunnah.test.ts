import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { parseCsv, parseLkChapter } from '../../src/main/services/sunnah/lk-corpus';
import { SunnahService } from '../../src/main/services/sunnah/sunnah.service';
import { SUNNAH_COLLECTION_IDS } from '../../src/shared/types/sunnah';
import { normalizeSunnahSearch, splitSunnahPassage, isnadTokens } from '../../src/renderer/libs/sunnah/text';

const header = 'Chapter_Number,Chapter_English,Chapter_Arabic,Section_Number,Section_English,Section_Arabic,Hadith_number,English_Hadith,English_Isnad,English_Matn,Arabic_Hadith,Arabic_Isnad,Arabic_Matn,Arabic_Comment,English_Grade,Arabic_Grade';
const arabic = 'حَدَّثَنَا عَبْدُ اللَّهِ، قَالَ: «العِلْمُ نُورٌ».\nسطر ثانٍ';
const row = ['0.0', 'Introduction', 'المقدمة', 'nan', 'nan', 'nan', '1.0', 'Narrated A: "Knowledge, light"', 'Narrated A:', '"Knowledge, light"', arabic, 'حدثنا عبد الله قال', 'العلم نور', 'nan', 'nan', 'nan'];
const csvRow = (fields: string[]) => fields.map(field => `"${field.replaceAll('"', '""')}"`).join(',');
const csv = `${header}\r\n${csvRow(row)}\r\n${csvRow(row)}\r\n`;

describe('LK Hadith corpus', () => {
  it('parses multiline quoted fields, escaped quotes, BOM and CRLF without changing text', () => {
    const parsed = parseCsv('\uFEFF' + csv);
    assert.equal(parsed.length, 3);
    assert.equal(parsed[1][10], arabic);
    assert.equal(parsed[1][7], row[7]);
    assert.throws(() => parseCsv('"unfinished'));
    assert.throws(() => parseCsv('"closed"junk'));
  });

  it('preserves duplicate source numbers, chapter zero, missing sections and grades', () => {
    const chapter = parseLkChapter(csv, 'Muslim', 0);
    assert.equal(chapter.number, 0);
    assert.equal(chapter.hadithCount, 2);
    assert.equal(chapter.hadiths[0].number, '1');
    assert.notEqual(chapter.hadiths[0].id, chapter.hadiths[1].id);
    assert.equal(chapter.hadiths[0].text.ar.full, arabic);
    assert.deepEqual(chapter.hadiths[0].section, { number: '', title: { ar: '', en: '' } });
    assert.equal(chapter.hadiths[0].grade.ar, '');
    assert.throws(() => parseLkChapter(csv, 'Muslim', 1));
    assert.throws(() => parseLkChapter('wrong\ncolumns', 'Muslim', 0));
  });

  it('aligns source annotations without dropping punctuation, diacritics or line breaks', () => {
    const result = splitSunnahPassage({ full: arabic, isnad: row[11], matn: row[12] });
    assert.equal(result.segmented, true);
    assert.equal(result.isnad + result.matn, arabic);
    assert.match(result.matn, /^العِلْم/);
    assert.equal(isnadTokens(result.isnad).map(token => token.text).join(''), result.isnad);
    assert.equal(isnadTokens('حَدَّثَنَا عَبْدُ اللَّهِ')[0].narrator, false);
    const unmatched = splitSunnahPassage({ full: arabic, isnad: 'مختلف', matn: 'incorrect annotation' });
    assert.equal(unmatched.matn, arabic);
    assert.equal(unmatched.isnad, '');
  });

  it('normalizes search only, matching tashkeel and alef variants without merging ta marbuta with ha', () => {
    assert.equal(normalizeSunnahSearch('إِيمَانٌ'), normalizeSunnahSearch('ايمان'));
    assert.equal(normalizeSunnahSearch('عِـلْمٌ Knowledge'), 'علم knowledge');
    assert.notEqual(normalizeSunnahSearch('رحمة'), normalizeSunnahSearch('رحمه'));
    assert.equal(arabic, row[10]);
  });

  it('imports six collections atomically, reopens offline, rejects invalid input and repairs its cache', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-sunnah-'));
    try {
      const archive = path.join(directory, 'corpus.zip');
      const cache = path.join(directory, 'cache');
      const files = Object.fromEntries(SUNNAH_COLLECTION_IDS.map(id => [`LK-Hadith-Corpus-master/${id}/Chapter0.csv`, strToU8(csv)]));
      files['../../outside.txt'] = strToU8('must not be extracted');
      await writeFile(archive, zipSync(files));
      const service = new SunnahService(cache, [archive]);
      const [catalog, sameCatalog] = await Promise.all([service.catalog(), service.catalog()]);
      assert.equal(catalog, sameCatalog);
      assert.equal(catalog?.hadithCount, 12);
      assert.equal(catalog?.collections.length, 6);
      assert.equal((await service.chapter('Muslim', 0)).hadiths[1].text.ar.full, arabic);
      await assert.rejects(service.chapter('../escape' as 'Muslim', 0));
      await assert.rejects(service.chapter('Muslim', -1));
      await assert.rejects(service.chapter('Muslim', 8));
      await assert.rejects(readFile(path.join(directory, 'outside.txt')));
      const badArchive = path.join(directory, 'bad.zip');
      await writeFile(badArchive, zipSync({ 'Bukhari/Chapter0.csv': strToU8(csv) }));
      await assert.rejects(service.importArchive(badArchive));
      assert.equal((await service.catalog())?.sha256, catalog?.sha256);
      await writeFile(path.join(cache, catalog!.sha256, 'Muslim-0.json'), 'corrupt cache');
      await service.importArchive(archive);
      await rm(archive);
      const reopened = new SunnahService(cache);
      assert.equal((await reopened.catalog())?.sha256, catalog?.sha256);
      assert.equal((await reopened.chapter('Muslim', 0)).hadithCount, 2);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
