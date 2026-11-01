import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { SunnahChapterView, type SunnahTranslate } from '../../src/renderer/components/sunnah/SunnahChapterView';
import { SunnahGradingList, SunnahSourcesList } from '../../src/renderer/components/sunnah/SunnahGradingPanel';
import type { SunnahChapter, SunnahGradingJudgment, SunnahHadith, SunnahMergedResearch } from '../../src/shared/types/sunnah';
import { translations, type TranslationKey } from '../../src/renderer/translations';

const translator = (language: 'ar' | 'en'): SunnahTranslate => (key: TranslationKey, params) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translations[language][key]);
const judgment = (overrides: Partial<SunnahGradingJudgment>): SunnahGradingJudgment => ({ id: 'a', origin: 'quranlab_fawazahmed0', graderRaw: 'Al-Albani', graderAr: 'الألباني', graderRole: 'scholar', graderStatus: 'verified', gradeRaw: 'Isnaad Sahih', gradeAlt: '', gradeAr: 'إسناده صحيح', gradeArStatus: 'glossary', scope: 'isnad', reviewStatus: 'glossary_reviewed', assessedPart: 'whole_record', note: '', dataset: 'quranlab/hadith', config: 'abudawud-ar', fieldPath: 'grades[0]', lineage: ['fawazahmed0/hadith-api'], sameLabelAs: [], wordingSimilarity: 1, ...overrides });
const merged = (judgments: SunnahGradingJudgment[], opposed = false): SunnahMergedResearch => ({ judgments, opposed, wordingDiffers: opposed, variants: [], explanations: [], fieldSources: [], missingFields: [], datasets: [] });
const grading = (data: SunnahMergedResearch, language: 'ar' | 'en') => parseHTML(renderToStaticMarkup(createElement(SunnahGradingList, { data, t: translator(language) }))).document;

for (const language of ['ar', 'en'] as const) {
  it(`shows an attributed chain ruling with its scope in ${language}`, () => {
    const page = grading(merged([judgment({})]), language);
    assert.equal(page.querySelector('strong')?.getAttribute('dir'), 'rtl');
    assert.equal(page.querySelector('strong')?.textContent, 'الألباني');
    assert.equal(page.querySelector('.sunnah-judgment-grade span')?.textContent, 'إسناده صحيح');
    assert.ok(page.toString().includes(translations[language].sunnahScopeIsnad));
    assert.ok(page.toString().includes(translations[language].sunnahGradeGlossary));
    assert.ok(page.toString().includes('Isnaad Sahih'), 'raw wording stays reachable');
  });

  it(`keeps disagreement visible and shows no combined verdict in ${language}`, () => {
    const page = grading(merged([judgment({ id: '1', gradeRaw: 'Sahih', gradeAr: 'صحيح', scope: 'hadith' }), judgment({ id: '2', graderRaw: 'Zubair Ali Zai', graderAr: 'زبير علي زئي', gradeRaw: 'Daif', gradeAr: 'ضعيف', scope: 'hadith' })], true), language);
    assert.equal(page.querySelectorAll('.sunnah-judgment').length, 2);
    assert.ok(page.querySelector('.is-opposed'));
  });

  it(`does not guess Arabic for an unverified grader or unreviewed term in ${language}`, () => {
    const page = grading(merged([judgment({ graderAr: '', graderRaw: 'Salim al-Hilali', gradeAr: '', gradeArStatus: 'unresolved', gradeRaw: 'Shadh, Sahih', reviewStatus: 'needs_review', scope: 'unresolved' })]), language);
    assert.equal(page.querySelector('strong')?.textContent, 'Salim al-Hilali');
    assert.equal(page.querySelector('.sunnah-judgment-grade span')?.textContent, 'Shadh, Sahih');
    assert.ok(page.toString().includes(translations[language].sunnahGraderUnverifiedName));
    assert.ok(page.toString().includes(translations[language].sunnahGradeUnreviewed));
    assert.ok(page.toString().includes(translations[language].sunnahScopeUnresolved));
  });

  it(`names a missing grader as missing in ${language}`, () => {
    const page = grading(merged([judgment({ graderRaw: '', graderAr: '', graderRole: 'unattributed', graderStatus: 'unattributed', gradeArStatus: 'source_arabic', gradeRaw: 'صحيح', gradeAr: 'صحيح' })]), language);
    assert.equal(page.querySelector('strong')?.textContent, translations[language].sunnahGraderUnattributed);
  });

  it(`says when an unattributed label may repeat a named ruling in ${language}`, () => {
    const page = grading(merged([judgment({ id: '1', graderAr: 'الألباني', graderRaw: 'Al-Albani' }), judgment({ id: '2', graderRaw: '', graderAr: '', graderRole: 'unattributed', sameLabelAs: ['Al-Albani'] })]), language);
    assert.ok(page.toString().includes(translations[language].sunnahGradeSameLabel.replace('{names}', 'الألباني')));
  });

  it(`says when a ruling covers only part of the record in ${language}`, () => {
    assert.ok(grading(merged([judgment({ assessedPart: 'cited_report_not_chain_specific' })]), language).toString().includes(translations[language].sunnahPartCited));
    assert.ok(grading(merged([judgment({ assessedPart: 'report_inside_row' })]), language).toString().includes(translations[language].sunnahPartInner));
  });

  it(`lists sources and unresolved ancestry in ${language}`, () => {
    const data: SunnahMergedResearch = { ...merged([]), fieldSources: [{ source: 'base:db', dataset: '', revision: '', record: 'hadiths.id=1', transformation: 'inherited_upstream_unresolved', fields: ['Arabic_Tafseel'], unresolved: true }], variants: [{ sourceKey: 'malik:1', config: 'malik-en', text: 'A variant', relation: 'one_to_one', score: 1, englishSimilarity: null, license: 'reference-only', attribution: 'credit' }], missingFields: ['English_Isnad'] };
    const page = parseHTML(renderToStaticMarkup(createElement(SunnahSourcesList, { data, t: translator(language) }))).document;
    assert.ok(page.toString().includes(translations[language].sunnahUpstreamUnresolved));
    assert.ok(page.toString().includes('reference-only'));
    assert.ok(page.toString().includes('English_Isnad'));
  });
}

const hadith: SunnahHadith = { id: 'AbuDaud:1:1', number: '1', section: { number: '', title: { ar: '', en: '' } }, text: { ar: { full: 'حدثنا فلان', isnad: '', matn: 'حدثنا فلان' }, en: { full: '', isnad: '', matn: '' } }, comment: '', grade: { ar: '', en: '' } };
const chapter = (collection: SunnahChapter['collection'], row: SunnahHadith): SunnahChapter => ({ collection, number: 1, title: { ar: 'كتاب', en: 'Book' }, hadithCount: 1, hadiths: [row] });
const render = (data: SunnahChapter, language: 'ar' | 'en') => parseHTML(renderToStaticMarkup(createElement(SunnahChapterView, { chapter: data, hadiths: data.hadiths, showEnglish: true, single: false, t: translator(language), onFocus: () => {} }))).document;

it('shows a compact ruling line, and none when the corpus has no summary', () => {
  const page = render(chapter('AbuDaud', { ...hadith, gradingSummary: { count: 3, opposed: true, wordingDiffers: true, unresolved: 0 } }), 'ar');
  assert.ok(page.querySelector('.sunnah-grading-line')?.textContent?.includes(translations.ar.sunnahGradingLine.replace('{count}', '3')));
  assert.equal(render(chapter('Bukhari', hadith), 'ar').querySelector('.sunnah-grading-line'), null);
});

it('labels a translation that came from another source', () => {
  const page = render(chapter('MuwattaMalik', { ...hadith, text: { ...hadith.text, en: { full: 'Variant', isnad: '', matn: '' } }, translation: { config: 'malik-en', partial: true } }), 'en');
  assert.ok(page.toString().includes(translations.en.sunnahVariantEnglishUsed));
  assert.ok(page.toString().includes(translations.en.sunnahVariantEnglishPartial));
});
