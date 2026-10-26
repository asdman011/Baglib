import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { QuranPassageView } from '../../src/renderer/components/quran/QuranReaderView';
import { QuranAyahInspector } from '../../src/renderer/components/quran/QuranAyahInspector';
import { QuranMushafView } from '../../src/renderer/components/quran/QuranMushafView';
import { QuranMushafWorkspace } from '../../src/renderer/components/quran/QuranMushafWorkspace';
import { QuranSurahIntroCard } from '../../src/renderer/components/quran/QuranSurahIntroCard';
import { QuranTopicDrawer } from '../../src/renderer/components/quran/QuranTopicDrawer';
import { QuranSimilarAyahsDrawer } from '../../src/renderer/components/quran/QuranSimilarAyahsDrawer';
import { translations, type TranslationKey } from '../../src/renderer/translations';
import type { QuranAyahTheme, QuranMushafPage, QuranPassage, QuranSimilarAyah, QuranSurahIntro, QuranTopic } from '../../src/shared/types/quran';

const passage: QuranPassage = { profile: 'hafs', surah: 1, surahs: [{ number: 1, count: 7 }], next: null, ayahs: [{ number: 1, words: [{ position: 1, text: 'بِسۡمِ', marker: false, meaning: 'In the name' }, { position: 2, text: '١', marker: true }], translation: { text: 'Meaning <script>not executed</script>', notes: ['A source note'] } }] };
for (const lang of ['ar', 'en'] as const) {
  test(`unified Mushaf exposes localized page tools and a compact play dock in ${lang}`, () => {
    const html = renderToStaticMarkup(createElement(QuranMushafWorkspace, { page: { pageNumber: 1, totalPages: 604, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 7, profile: 'hafs', svg: '<svg/>', words: [] }, selection: { script: '', translation: '', tafsir: '', meanings: '', transliteration: '' }, surahs: [], t: key => translations[lang][key], lang, dir: lang === 'ar' ? 'rtl' : 'ltr', canPlay: true, onStartAudio() {}, selectedAyah: null, onSelectAyah() {}, onNavigatePage() {}, onCopyText() {} }));
    const { document } = parseHTML(html);
    assert.ok(document.querySelector('[data-quran-workspace]'));
    assert.equal(document.querySelectorAll('[data-quran-mode]').length, 0);
    for (const key of ['quranCatTafsir', 'quranCatTranslation', 'quranCatTopics', 'quranCatTheme', 'quranAudioPlay'] as const) assert.ok(document.querySelector(`button[aria-label="${translations[lang][key]}"]`));
  });
  test(`shared Ayah Inspector exposes both canonical forms and a start-side drawer in ${lang}`, () => {
    const translate = (key: TranslationKey) => translations[lang][key];
    const html = renderToStaticMarkup(createElement(QuranAyahInspector, { reference: { surah: 1, ayah: 1 }, details: { surah: 1, ayah: 1, profile: 'hafs', canonical: 'بِسۡمِ ٱللَّهِ', imlaey: 'بسم الله' }, surahName: 'الفاتحة', error: false, t: translate, dir: lang === 'ar' ? 'rtl' : 'ltr', onClose() {}, onCopy() {}, onStudy() {}, onSimilar() {} }));
    const { document } = parseHTML(html);
    assert.ok(document.querySelector('[role=dialog]')?.classList.contains('start-0'));
    assert.ok(document.querySelector('[role=dialog]')?.textContent.includes('بسم الله'));
    assert.ok(document.querySelector('[role=dialog]')?.textContent.includes('بِسۡمِ ٱللَّهِ'));
    for (const key of ['quranCopyCanonical', 'quranCopyImlaey', 'quranOpenInStudyReader', 'quranSimilarAyahs'] as const) assert.ok(html.includes(translations[lang][key]));
    assert.equal(document.querySelector('[role=dialog]')?.getAttribute('aria-modal'), 'true');
  });
  test(`floating Ayah Inspector is resizable and does not block other study windows in ${lang}`, () => {
    const html = renderToStaticMarkup(createElement(QuranAyahInspector, { floating: true, reference: { surah: 1, ayah: 1 }, details: null, surahName: 'الفاتحة', error: false, t: key => translations[lang][key], dir: lang === 'ar' ? 'rtl' : 'ltr', onClose() {}, onCopy() {}, onStudy() {} }));
    const { document } = parseHTML(html);
    assert.ok(document.querySelector('[data-quran-inspector-layer]')?.classList.contains('resize'));
    assert.equal(document.querySelector('[role=dialog]')?.hasAttribute('aria-modal'), false);
    assert.equal(document.querySelectorAll('button[tabindex="-1"]').length, 0);
  });
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
    assert.equal(document.querySelector('aside'), null);
    assert.ok(html.includes(translations[lang].quranCopyPage));
  });
}

for (const lang of ['ar', 'en'] as const) {
  test(`QuranPassageView renders active audio ayah and synchronized word highlight in ${lang}`, () => {
    const translate = (key: TranslationKey, params?: Record<string, string | number>) => Object.entries(params || {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translations[lang][key]);
    const html = renderToStaticMarkup(createElement(QuranPassageView, {
      passage,
      t: translate,
      lang,
      selected: null,
      showWords: true,
      commentary: null,
      onCommentary() {},
      onCopy() {},
      activeAudio: { surah: 1, ayah: 1, isPlaying: true, activeWordIndex: 1 },
      onPlayAyah() {},
    }));
    const { document } = parseHTML(html);
    assert.ok(html.includes('border-emerald-500'));
    assert.ok(html.includes('text-amber-600'));
    assert.ok(html.includes(translations[lang].quranAudioPause));
  });

  test(`QuranMushafView renders dynamic CSS rules for active audio ayah and word segment in ${lang}`, () => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    const translate = (key: TranslationKey, params?: Record<string, string | number>) => Object.entries(params || {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translations[lang][key]);
    const html = renderToStaticMarkup(createElement(QuranMushafView, {
      page: mockMushafPage,
      surahs: [{ number: 1, count: 7, arabic: 'الفاتحة', name: 'Al-Fatihah' }],
      t: translate,
      lang,
      dir,
      selectedAyah: { surah: 1, ayah: 1 },
      activeAudio: { surah: 1, ayah: 1, isPlaying: true, activeWordIndex: 1 },
      onSelectAyah() {},
      onNavigatePage() {},
      onOpenInStudyReader() {},
      onCopyText() {},
      onPlayAyah() {},
    }));
    assert.ok(html.includes('data-baglib-audio-word'));
    assert.ok(html.includes('#059669'));
    assert.ok(html.includes('#d97706'));
    assert.ok(html.includes('data-baglib-playing'));
  });
}

test('audio translations have complete parity in Arabic and English', () => {
  const audioKeys: TranslationKey[] = [
    'quranAudioPlay',
    'quranAudioPause',
    'quranAudioResume',
    'quranAudioStop',
    'quranAudioNext',
    'quranAudioPrev',
    'quranAudioReciter',
    'quranAudioSpeed',
    'quranAudioRepeatMode',
    'quranAudioRepeatNone',
    'quranAudioRepeatAyah',
    'quranAudioRepeatSurah',
    'quranAudioRepeatCount',
    'quranAudioRepeatInfinite',
    'quranAudioSleepTimer',
    'quranAudioSleepTimerOff',
    'quranAudioSleepMinutes',
    'quranAudioSleepEndOfSurah',
    'quranAudioDownloadSurah',
    'quranAudioDownloadingSurah',
    'quranAudioDownloadedSurah',
    'quranAudioOfflineReady',
    'quranAudioOnlineStream',
    'quranAudioRecitationRequired',
    'quranAudioGapDuration',
    'quranAudioGapNone',
    'quranAudioGapSeconds',
    'quranAudioPlayingAyah',
  ];

  for (const key of audioKeys) {
    assert.ok(translations.ar[key], `Missing Arabic translation for ${key}`);
    assert.ok(translations.en[key], `Missing English translation for ${key}`);
  }
});

for (const lang of ['ar', 'en'] as const) {
  test(`QuranSurahIntroCard renders surah introduction bilingually in ${lang}`, () => {
    const translate = (key: TranslationKey, params?: Record<string, string | number>) => Object.entries(params || {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translations[lang][key]);
    const intro: QuranSurahIntro = {
      surahNumber: 1,
      surahName: 'Al-Fatihah',
      text: 'Overview text of the opening chapter.',
      shortText: 'A concise summary of Al-Fatihah.',
    };
    const html = renderToStaticMarkup(createElement(QuranSurahIntroCard, { intro, t: translate }));
    const { document } = parseHTML(html);
    assert.ok(html.includes(translations[lang].quranSurahIntro));
    assert.ok(html.includes('Al-Fatihah'));
    assert.ok(html.includes('A concise summary of Al-Fatihah.'));
    assert.ok(document.querySelector('section'));
  });

  test(`QuranTopicDrawer renders concept cards and related ayah links in ${lang}`, () => {
    const translate = (key: TranslationKey, params?: Record<string, string | number>) => Object.entries(params || {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translations[lang][key]);
    const topic: QuranTopic = {
      topicId: 1,
      name: 'Allah',
      arabicName: 'الله',
      parentId: null,
      thematicParentId: 1837,
      ontologyParentId: null,
      description: '<b>Allah</b> is the one and only true God.',
      wikiLink: 'wiki/Allah',
      thematic: true,
      ontology: true,
      ayahs: [{ surah: 1, ayah: 1 }, { surah: 2, ayah: 7 }],
      relatedTopics: [],
    };
    const html = renderToStaticMarkup(createElement(QuranTopicDrawer, {
      topics: [topic],
      activeTopic: topic,
      onSelectTopic() {},
      onSelectAyah() {},
      onClose() {},
      t: translate,
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
    }));
    const { document } = parseHTML(html);
    assert.ok(html.includes('Allah'));
    assert.ok(html.includes('الله'));
    assert.ok(html.includes('1:1'));
    assert.ok(html.includes('2:7'));
    assert.equal(document.querySelectorAll('button').length >= 3, true);
  });

  test(`QuranPassageView displays theme badges and topic buttons in ${lang}`, () => {
    const translate = (key: TranslationKey, params?: Record<string, string | number>) => Object.entries(params || {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translations[lang][key]);
    const themes: QuranAyahTheme[] = [
      { theme: 'Opening of the book', surahNumber: 1, ayahFrom: 1, ayahTo: 7, keywords: ['fatihah'], totalAyahs: 7 },
    ];
    let topicOpenedAyah: number | null = null;
    const html = renderToStaticMarkup(createElement(QuranPassageView, {
      passage,
      t: translate,
      lang,
      selected: null,
      showWords: false,
      commentary: null,
      themes,
      onOpenTopics: (a) => { topicOpenedAyah = a; },
      onCopy() {},
    }));
    const { document } = parseHTML(html);
    assert.ok(html.includes(translations[lang].quranTheme));
    assert.ok(html.includes('Opening of the book'));
    assert.ok(html.includes(translations[lang].quranTopics));
  });

  test(`QuranPassageView displays similar ayahs button when onOpenSimilar is provided in ${lang}`, () => {
    const translate = (key: TranslationKey, params?: Record<string, string | number>) => Object.entries(params || {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translations[lang][key]);
    let openedAyah: number | null = null;
    const html = renderToStaticMarkup(createElement(QuranPassageView, {
      passage,
      t: translate,
      lang,
      selected: null,
      showWords: false,
      commentary: null,
      onOpenSimilar: (a) => { openedAyah = a; },
      onCopy() {},
    }));
    assert.ok(html.includes(translations[lang].quranSimilarAyahs));
  });

  test(`QuranSimilarAyahsDrawer renders similar verses with score, coverage, and navigation in ${lang}`, () => {
    const translate = (key: TranslationKey, params?: Record<string, string | number>) => Object.entries(params || {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translations[lang][key]);
    const similarItem: QuranSimilarAyah = {
      verseKey: '1:1',
      matchedAyahKey: '27:30',
      surah: 27,
      ayah: 30,
      matchedWordsCount: 4,
      coverage: 100,
      score: 80,
      matchWordsRange: [[1, 4]],
    };
    const html = renderToStaticMarkup(createElement(QuranSimilarAyahsDrawer, {
      surah: 1,
      ayah: 1,
      similarAyahs: [similarItem],
      surahName: lang === 'ar' ? 'الفاتحة' : 'Al-Fatihah',
      surahs: [{ number: 27, count: 93, name: 'An-Naml', arabic: 'النمل' }],
      t: translate,
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      onClose() {},
      onNavigateAyah() {},
    }));
    const { document } = parseHTML(html);
    assert.ok(html.includes(translations[lang].quranSimilarAyahs));
    assert.ok(html.includes('27:30'));
    assert.ok(html.includes(translations[lang].quranJumpToSimilarAyah));
    assert.ok(html.includes(translations[lang].quranSimilarDrawerClose));
    assert.equal(document.querySelectorAll('button').length >= 2, true);
  });
}


