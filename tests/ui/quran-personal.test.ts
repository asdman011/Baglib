import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { quranCopyText, quranReferenceLabel } from '../../src/renderer/utils/quran-reference-label';
import { quranBookmarks } from '../../src/renderer/utils/quran-bookmarks';
import { quranActions } from '../../src/renderer/components/actions/quran-actions';
import { QuranPassageView } from '../../src/renderer/components/quran/QuranReaderView';
import { QuranAyahInspector } from '../../src/renderer/components/quran/QuranAyahInspector';
import { QuranMushafView } from '../../src/renderer/components/quran/QuranMushafView';
import { QuranSimilarAyahsDrawer } from '../../src/renderer/components/quran/QuranSimilarAyahsDrawer';
import { QuranBookmarks } from '../../src/renderer/components/quran/QuranBookmarks';
import { useQuranBookmarks } from '../../src/renderer/hooks/useQuranBookmarks';
import { translations, type TranslationKey } from '../../src/renderer/translations';
import { studyLinkText } from '../../src/shared/study-notes';
import type { QuranMushafPage, QuranPassage } from '../../src/shared/types/quran';

const canonical = 'بِسْمِ ٱللَّهِ';
const reference = { surah: 2, ayah: 255 };
const note = (id: string, target: string, tags = ['bookmark']) => ({ id, content: studyLinkText(target, canonical), tags });
const notes = [note('h', 'quran:hafs:2:255'), note('w', 'quran:warsh:2:255'), note('d', 'quran:hafs:2:255'), note('r', 'quran:hafs:1:2-3'), note('ordinary', 'quran:hafs:2:10', []), note('other', 'sunnah:Bukhari:1:row-1')];

test('bookmark projection filters profiles, expands ranges, sorts and deduplicates without changing note markers', () => {
  assert.deepEqual(quranBookmarks(notes, 'hafs').map(b => b.target), ['quran:hafs:1:2', 'quran:hafs:1:3', 'quran:hafs:2:255']);
  assert.deepEqual(quranBookmarks(notes, 'warsh').map(b => b.target), ['quran:warsh:2:255']);
});

for (const lang of ['ar', 'en'] as const) {
  const t = (key: TranslationKey) => translations[lang][key];
  test('shared copy formatter preserves canonical text and localizes same/cross-surah ranges / ' + lang, () => {
    const expected = quranReferenceLabel({ surah: 2, from: 255, to: 255 }, lang);
    assert.ok(expected.includes(lang === 'ar' ? 'البقرة' : 'Al-Baqarah'));
    assert.ok(expected.includes(new Intl.NumberFormat(lang).format(255)));
    // Clipboard citations carry no bidi isolate controls (they paste as stray characters elsewhere).
    const plain = (label: string) => label.replace(/[⁦-⁩]/gu, '');
    assert.equal(quranCopyText(canonical, reference, lang), canonical + '\n[' + plain(expected) + ']');
    assert.equal(quranCopyText(canonical, reference, lang, { surah: 2, ayah: 257 }), canonical + '\n[' + plain(quranReferenceLabel({ surah: 2, from: 255, to: 257 }, lang)) + ']');
    const cross = quranCopyText(canonical, reference, lang, { surah: 3, ayah: 2 });
    assert.equal(cross, canonical + '\n[' + plain(expected) + ' – ' + plain(quranReferenceLabel({ surah: 3, from: 2, to: 2 }, lang)) + ']');
    assert.ok(!/[⁦-⁩?]/u.test(cross.split('\n').pop()!));
  });

  test('all Quran copy/share paths and profile bookmark UI execute localized handlers / ' + lang, async () => {
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    let copied = '', shared = '';
    const globals = { window, document: window.document, navigator: { clipboard: { writeText: async (text: string) => { copied = text; } } }, React, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { studyNotes: { list: async () => notes }, sunnah: { share: async (text: string) => { shared = text; return { ok: true }; } } } });
    const root = createRoot(window.document.getElementById('root')!);
    const $ = (selector: string) => window.document.querySelector<HTMLElement>(selector)!;
    const clickLabel = async (label: string) => { const button = [...window.document.querySelectorAll<HTMLElement>('button')].find(b => b.getAttribute('aria-label') === label || b.textContent === label); assert.ok(button, label); await act(async () => button.click()); };
    const onCopy = (text: string) => { copied = text; };
    try {
      const actions = quranActions({ reference, script: 'script', profile: 'hafs', language: lang, text: canonical, t });
      for (const id of ['copy', 'copyReference', 'share', 'copyPlain']) {
        await actions.find(action => action.id === id)!.onClick!();
        const text = id === 'copyPlain' ? canonical.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/gu, '') : canonical;
        assert.equal(id === 'share' ? shared : copied, quranCopyText(text, reference, lang));
      }
      const passage: QuranPassage = { profile: 'hafs', surah: 2, surahs: [], next: null, ayahs: [{ number: 255, words: [{ position: 1, text: canonical, marker: false }] }] };
      await act(async () => root.render(createElement(QuranPassageView, { passage, t, lang, onCopy, commentary: null, selected: null, showWords: false })));
      await clickLabel(t('quranCopyAyah'));
      assert.equal(copied, quranCopyText(canonical, reference, lang));
      await act(async () => root.render(createElement(QuranAyahInspector, { floating: true, details: { ...reference, profile: 'hafs', canonical, imlaey: 'imlaey' }, reference, surahName: canonical, error: false, t, dir: lang === 'ar' ? 'rtl' : 'ltr', onClose() {}, onCopy, onStudy() {} })));
      await clickLabel(t('quranCopyCanonical')); assert.equal(copied, quranCopyText(canonical, reference, lang));
      await clickLabel(t('quranCopyImlaey')); assert.equal(copied, quranCopyText('imlaey', reference, lang));
      const page: QuranMushafPage = { pageNumber: 1, totalPages: 604, profile: 'hafs', surahStart: 2, ayahStart: 255, surahEnd: 3, ayahEnd: 2, svg: '<svg><g data-surah="2" data-aya="255"><path/></g></svg>', words: [{ id: 'a', surah: 2, ayah: 255, wordIndex: 1, canonicalText: canonical }] };
      const renderPage = (profile: 'hafs' | 'warsh') => root.render(createElement(QuranMushafView, { page: { ...page, profile }, bookmarks: quranBookmarks(notes, profile), surahs: [], t, lang, dir: lang === 'ar' ? 'rtl' : 'ltr', selectedAyah: null, onSelectAyah() {}, onNavigatePage() {}, onCopyText: onCopy }));
      await act(async () => renderPage('hafs'));
      assert.ok($('[data-baglib-bookmark]'));
      await clickLabel(t('quranCopyPage'));
      assert.equal(copied, quranCopyText(canonical, reference, lang, { surah: 3, ayah: 2 }));
      // Only a Hafs bookmark is passed on a Warsh page: no indicator can leak.
      await act(async () => root.render(createElement(QuranMushafView, { page: { ...page, profile: 'warsh' }, bookmarks: quranBookmarks(notes, 'hafs'), surahs: [], t, lang, dir: 'rtl', selectedAyah: null, onSelectAyah() {}, onNavigatePage() {}, onCopyText: onCopy })));
      assert.equal($('[data-baglib-bookmark]'), null);
      await act(async () => root.render(createElement(QuranSimilarAyahsDrawer, { surah: 1, ayah: 1, similarAyahs: [{ verseKey: '1:1', matchedAyahKey: '2:255', surah: 2, ayah: 255, matchedWordsCount: 1, coverage: 1, score: 1, matchWordsRange: [] }], t, lang, dir: lang === 'ar' ? 'rtl' : 'ltr', onClose() {}, onNavigateAyah() {}, onCopy, fetchAyahText: async () => canonical })));
      await clickLabel(t('quranCopyAyah')); assert.equal(copied, quranCopyText(canonical, reference, lang));
      let jumped: unknown;
      function List({ profile }: { profile: 'hafs' | 'warsh' }) {
        const { bookmarks, failed } = useQuranBookmarks(profile);
        return createElement(QuranBookmarks, { bookmarks, failed, lang, t, onNavigate: r => { jumped = r; } });
      }
      await act(async () => root.render(createElement(List, { profile: 'hafs' })));
      assert.equal(window.document.querySelectorAll('[data-quran-bookmark]').length, 3);
      await act(async () => $('[data-quran-bookmark="quran:hafs:2:255"]').click());
      assert.deepEqual(jumped, { target: 'quran:hafs:2:255', ...reference });
      await act(async () => root.render(createElement(List, { profile: 'warsh' })));
      assert.equal(window.document.querySelectorAll('[data-quran-bookmark]').length, 1);
      assert.ok($('[data-quran-bookmark="quran:warsh:2:255"]'));
    } finally { await act(async () => root.unmount()); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } }
  });
}
