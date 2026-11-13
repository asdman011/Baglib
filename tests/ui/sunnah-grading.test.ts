import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { SunnahChapterView, type SunnahTranslate } from '../../src/renderer/components/sunnah/SunnahChapterView';
import { orderJudgments, SunnahGradingList, SunnahSourcesList } from '../../src/renderer/components/sunnah/SunnahGradingPanel';
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

// KEY-334: in the calm reader the chapter never mounts its own research panel, so the ruling line must hand off to the side panel.
it('calm reading: the ruling line asks the side panel for the judgments of that hadith', async () => {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  const saved = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const calls: [string, number][] = [];
    const root = createRoot(window.document.getElementById('root')!);
    const row = { ...hadith, researchId: 77, gradingSummary: { count: 5, opposed: false, wordingDiffers: false, unresolved: 0 } };
    await React.act(async () => root.render(createElement(SunnahChapterView, { calm: true, chapter: chapter('AbuDaud', row), hadiths: [row], showEnglish: false, single: false, t: translator('ar'), onFocus: () => {}, onShowGrading: (id: string, researchId: number) => calls.push([id, researchId]) })));
    const button = window.document.querySelector<HTMLButtonElement>('[data-sunnah-grading-button]');
    assert.ok(button, 'the ruling button is shown in calm mode');
    assert.equal(window.document.querySelector('.sunnah-research'), null, 'calm mode keeps the chapter free of the research panel');
    await React.act(async () => { button!.dispatchEvent(new window.Event('click', { bubbles: true })); });
    assert.deepEqual(calls, [['AbuDaud:1:1', 77]]);
    await React.act(async () => root.unmount());
  } finally { Object.assign(globalThis, saved); }
});

it('puts Al-Albani first and keeps the rest in corpus order (KEY-334)', () => {
  const list = [judgment({ id: '1', graderRaw: 'Shuaib Al Arnaut', graderAr: 'شعيب الأرنؤوط' }), judgment({ id: '2', graderRaw: 'Zubair Ali Zai', graderAr: 'زبير علي زئي' }), judgment({ id: '3', graderRaw: 'Al-Albani', graderAr: 'الألباني' }), judgment({ id: '4', graderRaw: 'Albani', graderAr: '' })];
  assert.deepEqual(orderJudgments(list).map(item => item.id), ['3', '4', '1', '2']);
  const page = grading(merged(list), 'en');
  assert.equal(page.querySelector('.sunnah-judgment strong')?.textContent, 'الألباني');
});
