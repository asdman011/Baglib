import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { SunnahResearchCorpus } from '../../src/main/services/sunnah/research-corpus';
import { subjectKey, sunnahSubjects } from '../../src/shared/sunnah-subjects';
import { SITE_SEARCHES, siteSearchUrl } from '../../src/shared/site-search';
import type { SunnahCatalog } from '../../src/shared/types/sunnah';

const chapter = (number: number, ar: string, hadithCount: number) => ({ number, title: { ar, en: '' }, hadithCount });
const catalog = { version: 1, sha256: '', importedAt: '', hadithCount: 0, collections: [
  { id: 'Bukhari', hadithCount: 9, chapters: [chapter(1, 'كِتَابُ الصَّلاةِ', 4), chapter(2, 'كتاب الصيام', 5)] },
  { id: 'Muslim', hadithCount: 3, chapters: [chapter(4, 'كتاب الصلاة', 3)] },
] } as SunnahCatalog;

test('subjects group matching titles and keep the source spelling', () => {
  assert.equal(subjectKey('كِتَابُ الصَّلاةِ'), subjectKey('كتاب الصلاة'));
  const [first, second] = sunnahSubjects(catalog, 'ar');
  assert.equal(first.title, 'كِتَابُ الصَّلاةِ');
  assert.deepEqual([first.hadiths, first.chapters.map(item => item.collection)], [7, ['Bukhari', 'Muslim']]);
  assert.equal(second.hadiths, 5);
});

test('ة and ه stay apart, so different subjects do not merge', () => {
  assert.notEqual(subjectKey('كتاب الجنة'), subjectKey('كتاب الجنه'));
});

test('site search encodes Arabic and uses the chosen language', () => {
  const site = SITE_SEARCHES.find(item => item.id === 'islamqa')!;
  assert.equal(siteSearchUrl(site, ' صلاة ', 'ar'), 'https://islamqa.info/ar/search?q=%D8%B5%D9%84%D8%A7%D8%A9');
  assert.ok(SITE_SEARCHES.every(item => siteSearchUrl(item, 'a&b=c', 'en').includes('a%26b%3Dc') && siteSearchUrl(item, 'x', 'en').startsWith('https://')));
});

const real = path.resolve('tools/hadith-alignment/data/output/sunnah_merged_quranlab_v1.sqlite');
test('statistics reconcile with the corpus verifier', { skip: !existsSync(real) }, async () => {
  const corpus = new SunnahResearchCorpus(real);
  try {
    const stats = await corpus.statistics();
    assert.equal(await corpus.statistics(), stats);
    assert.equal(stats.totals.narratorProfiles, 115_735);
    assert.equal(stats.totals.chainLinks, 325_841);
    assert.equal(stats.totals.rootLinks, 844_117);
    assert.equal(stats.totals.hadiths, 73_325);
    const sourceBooks = new Set(['Nawawi40', 'Qudsi40', 'Dehlawi40', 'HadeethEnc', 'SourceOnly', 'ReviewQueue']);
    assert.equal(stats.collections.filter(row => !sourceBooks.has(row.id)).reduce((sum, row) => sum + row.hadiths, 0), 67_611);
    assert.equal(stats.collections.find(row => row.id === 'Bukhari')!.hadiths, 7_345);
    assert.equal(stats.topNarrators.length, 20);
  } finally { corpus.close(); }
});
