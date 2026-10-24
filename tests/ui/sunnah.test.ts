import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { SunnahChapterView, type SunnahTranslate } from '../../src/renderer/components/sunnah/SunnahChapterView';
import type { SunnahChapter } from '../../src/shared/types/sunnah';
import { translations, type TranslationKey } from '../../src/renderer/translations';
import { formatHadith } from '../../src/renderer/components/sunnah/HadithActions';
import { isnadTokens, shortenArabicChain } from '../../src/renderer/libs/sunnah/text';

const chapter: SunnahChapter = {
  collection: 'Bukhari', number: 3, title: { ar: 'كِتَابُ العِلْمِ', en: 'Knowledge' }, hadithCount: 2,
  hadiths: [1, 2].map(number => ({
    id: `Bukhari:3:${number}`, number: '59', section: { number: '2', title: { ar: 'بَابُ العِلْمِ', en: 'Knowledge chapter' } },
    text: {
      ar: { full: 'حَدَّثَنَا فُلَانٌ، قَالَ: عِلْمٌ Knowledge', isnad: 'حدثنا فلان قال', matn: 'علم Knowledge' },
      en: { full: number === 1 ? 'Narrated A: Knowledge.' : '', isnad: number === 1 ? 'Narrated A:' : '', matn: number === 1 ? 'Knowledge.' : '' },
    },
    comment: 'تعليق <script>not executable</script>', grade: { ar: 'صحيح', en: 'Sahih' },
  })),
};

it('groups a complete Arabic narrator name without altering the original chain', () => {
  const text = 'حَدَّثَنَا عَبْدُ اللَّهِ بْنُ يُوسُفَ، قَالَ';
  const tokens = isnadTokens(text);
  assert.equal(tokens.map(token => token.text).join(''), text);
  assert.ok(tokens.some(token => token.narrator && token.text === 'عَبْدُ اللَّهِ بْنُ يُوسُفَ'));
});

it('exports selected languages and matn with optional trailing references', () => {
  const record = chapter.hadiths[0];
  assert.equal(formatHadith(chapter, record, false, false, false), record.text.ar.matn);
  assert.equal(formatHadith(chapter, record, true, true, false), 'عن فُلَانٌ، قَالَ: عِلْمٌ Knowledge\n\n' + record.text.en.full);
  const referenced = formatHadith(chapter, record, true, false, true);
  assert.ok(referenced.startsWith(record.text.ar.matn));
  assert.ok(referenced.endsWith('Hadith 59'));
  assert.ok(referenced.includes('صحيح البخاري'));
});

it('retains the final narrator and all following source words without a reference', () => {
  const earlier = 'حَدَّثَنَا الْحُمَيْدِيُّ عَبْدُاللَّهِ بْنُ الزُّبَيْرِ، قَالَ حَدَّثَنَا سُفْيَانُ، قَالَ حَدَّثَنَا يَحْيَى بْنُ سَعِيدٍ الأَنْصَارِيُّ، قَالَ أَخْبَرَنِي مُحَمَّدُ بْنُ إِبْرَاهِيمَ التَّيْمِيُّ، أَنَّهُ سَمِعَ عَلْقَمَةَ بْنَ وَقَّاصٍ اللَّيْثِيَّ، يَقُولُ سَمِعْتُ ';
  const companion = 'عُمَرَ بْنَ الْخَطَّابِ ـ رضى الله عنه ـ عَلَى الْمِنْبَرِ قَالَ ';
  const matn = 'سَمِعْتُ رَسُولَ اللَّهِ صلى الله عليه وسلم يَقُولُ ‏ ‏ إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ';
  const passage = { full: earlier + companion + matn, isnad: earlier + companion, matn };
  assert.equal(shortenArabicChain(passage), 'عن ' + companion + matn);
  const record = { ...chapter.hadiths[0], text: { ...chapter.hadiths[0].text, ar: passage } };
  assert.equal(formatHadith(chapter, record, false, true, false), 'عن ' + companion + matn);
  assert.ok(formatHadith(chapter, record, false, true, true).startsWith(passage.full));
  assert.equal(formatHadith(chapter, record, false, false, false), matn);
  assert.equal(shortenArabicChain({ ...passage, isnad: 'غير مطابق' }), passage.full);
  const ambiguous = { full: 'حدثنا فلان عن أبيه قال كلام', isnad: 'حدثنا فلان عن أبيه قال', matn: 'كلام' };
  assert.equal(shortenArabicChain(ambiguous), ambiguous.full);
});

it('keeps numbered empty section titles blank and hides grading only for the two Sahih collections', () => {
  for (const collection of ['Bukhari', 'Muslim', 'AbuDaud'] as const) {
    const record = { ...chapter.hadiths[0], section: { number: '7', title: { ar: '', en: '' } } };
    const html = renderToStaticMarkup(createElement(SunnahChapterView, { chapter: { ...chapter, collection }, hadiths: [record], showEnglish: true, single: true, t: key => translations.en[key], onFocus: () => {} }));
    const { document } = parseHTML(html);
    assert.equal(document.querySelector('.sunnah-section-heading .sunnah-arabic')?.textContent, '7');
    assert.equal(document.querySelector('.sunnah-section-heading .sunnah-english')?.textContent, '7');
    assert.equal(document.querySelectorAll('.sunnah-grade').length, collection === 'AbuDaud' ? 1 : 0);
  }
});

for (const language of ['ar', 'en'] as const) {
  const t: SunnahTranslate = (key, params) => {
    let text: string = translations[language][key];
    for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };
  it(`renders aligned source headings, passages and safe related data in ${language}`, () => {
    const html = renderToStaticMarkup(createElement(SunnahChapterView, { chapter, hadiths: chapter.hadiths, showEnglish: true, single: false, t, onFocus: () => {} }));
    const { document } = parseHTML(html);
    assert.equal(document.querySelectorAll('article').length, 2);
    assert.equal(document.querySelectorAll('.sunnah-section-heading').length, 1);
    assert.equal(document.querySelector('.sunnah-chapter-heading .sunnah-arabic h2')?.textContent, '3كِتَابُ العِلْمِ');
    assert.equal(document.querySelector('.sunnah-chapter-heading .sunnah-english h2')?.textContent, '3Knowledge');
    assert.equal(document.querySelector('article .sunnah-arabic .sunnah-passage')?.textContent, chapter.hadiths[0].text.ar.full);
    assert.equal(document.querySelector('[lang="ar"]')?.getAttribute('dir'), 'rtl');
    assert.equal(document.querySelector('[lang="en"]')?.getAttribute('dir'), 'ltr');
    assert.equal(document.querySelectorAll('script').length, 0);
    assert.match(document.querySelector('details')!.textContent!, /<script>not executable<\/script>/);
    assert.ok(html.includes(translations[language].sunnahMissingEnglish));
    assert.equal(document.querySelectorAll('audio').length, 0);
    assert.ok(document.querySelector('.sunnah-narrator'));
  });

  it(`shows one Arabic-only hadith when translation is disabled in ${language}`, () => {
    const html = renderToStaticMarkup(createElement(SunnahChapterView, { chapter, hadiths: [chapter.hadiths[1]], showEnglish: false, single: true, t, onFocus: () => {} }));
    const { document } = parseHTML(html);
    assert.equal(document.querySelectorAll('article').length, 1);
    assert.equal(document.querySelectorAll('.sunnah-english').length, 0);
    assert.equal(document.querySelectorAll('.sunnah-bilingual').length, 0);
    assert.equal(document.querySelectorAll('article > div button').length, 0);
    assert.equal(document.querySelectorAll('article footer button').length, 3);
    assert.equal(document.querySelector('article footer button[aria-expanded]')?.getAttribute('aria-expanded'), 'false');
    assert.equal(document.querySelector('article footer textarea')?.getAttribute('rows'), '2');
    assert.equal(document.querySelectorAll('article footer details').length, 0);
    assert.equal(document.querySelectorAll('.sunnah-grade').length, 0);
  });
}

it('has matching nonempty Sunnah strings and placeholders in both interface languages', () => {
  for (const key of Object.keys(translations.ar).filter(key => key.startsWith('sunnah') || key === 'navSunnah') as TranslationKey[]) {
    assert.ok(translations.en[key], key);
    assert.deepEqual(translations.ar[key].match(/\{\w+\}/g), translations.en[key].match(/\{\w+\}/g), key);
  }
});
