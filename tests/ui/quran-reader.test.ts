import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { QuranPassageView } from '../../src/renderer/components/quran/QuranReaderView';
import { QuranMushafView } from '../../src/renderer/components/quran/QuranMushafView';
import { translations, type TranslationKey } from '../../src/renderer/translations';
import type { QuranMushafPage, QuranPassage } from '../../src/shared/types/quran';

const passage: QuranPassage = { profile: 'hafs', surah: 1, surahs: [{ number: 1, count: 7 }], next: null, ayahs: [{ number: 1, words: [{ position: 1, text: 'بِسۡمِ', marker: false, meaning: 'In the name' }, { position: 2, text: '١', marker: true }], translation: { text: 'Meaning <script>not executed</script>', notes: ['A source note'] } }] };
for (const lang of ['ar', 'en'] as const) {
  test(`Quran passage preserves Arabic and renders safe English/tafsir content in ${lang}`, () => {
    const translate = (key: TranslationKey, params?: Record<string, string | number>) => Object.entries(params || {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translations[lang][key]);
    const html = renderToStaticMarkup(createElement(QuranPassageView, { passage, t: translate, lang, selected: 1, showWords: true, commentary: { from: '1:1', to: '1:2', nodes: [{ tag: 'p', children: [{ tag: 'text', text: 'تفسير <img src=x onerror=alert(1)>' }] }] }, onCommentary() {}, onCopy() {} }));
    const { document } = parseHTML(html);
    assert.equal(document.querySelectorAll('script,img').length, 0);
    assert.equal(document.querySelector('[lang=ar]')?.getAttribute('dir'), 'rtl');
    assert.equal(document.querySelector('[lang=en]')?.getAttribute('dir'), 'ltr');
    assert.ok(html.includes('بِسۡمِ'));
    assert.ok(document.querySelector('aside')?.textContent.includes('تفسير'));
    assert.ok(document.querySelector('summary')?.textContent.includes('1'));
    assert.equal(document.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded'), 'true');
    assert.ok(html.includes('leading-[2.5]'));
    assert.ok(html.includes(translations[lang].quranCopyAyah));
  });
}

const mockMushafPage: QuranMushafPage = {
  pageNumber: 1,
  totalPages: 604,
  surahStart: 1,
  ayahStart: 1,
  surahEnd: 1,
  ayahEnd: 7,
  profile: 'hafs',
  svg: `<svg viewBox="0 0 382 547" xmlns="http://www.w3.org/2000/svg"><g id="md-page" data-page-number="001"><g id="w1" data-surah="001" data-aya="001" data-hafs="بِسۡمِ" data-imlaey="بسم"><path d="M0,0"/></g></g></svg>`,
  words: [
    { id: 'w1', surah: 1, ayah: 1, wordIndex: 1, textHafs: 'بِسۡمِ', imlaey: 'بسم' },
  ],
};

for (const lang of ['ar', 'en'] as const) {
  test(`QuranMushafView renders vector Mushaf page and selected ayah inspector in ${lang}`, () => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    const translate = (key: TranslationKey, params?: Record<string, string | number>) => Object.entries(params || {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translations[lang][key]);
    const html = renderToStaticMarkup(createElement(QuranMushafView, {
      page: mockMushafPage,
      surahs: [{ number: 1, count: 7, arabic: 'الفاتحة', name: 'Al-Fatihah' }],
      t: translate,
      lang,
      dir,
      selectedAyah: { surah: 1, ayah: 1 },
      onSelectAyah() {},
      onNavigatePage() {},
      onOpenInStudyReader() {},
      onCopyText() {},
    }));
    const { document } = parseHTML(html);
    assert.equal(document.querySelector(`[dir=${dir}]`) !== null, true);
    assert.ok(html.includes('mushaf-svg-surface'));
    assert.ok(html.includes('بِسۡمِ'));
    assert.ok(html.includes('604'));
    assert.ok(document.querySelector('aside') !== null);
    assert.ok(html.includes(translations[lang].quranOpenInStudyReader));
    assert.ok(html.includes(translations[lang].quranCopyPage));
  });
}

