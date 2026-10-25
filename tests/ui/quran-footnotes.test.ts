import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { QuranTranslationText } from '../../src/renderer/components/quran/QuranTranslationText';
import { inlineTranslation } from '../../src/main/services/quran/quran-reader';
import { translations, type TranslationKey } from '../../src/renderer/translations';

for (const lang of ['ar', 'en'] as const) {
  test(`numbered footnotes preserve source positions, distinct targets and safe text in ${lang}`, () => {
    const translation = inlineTranslation(JSON.stringify('First phrase[[First note <script>not HTML</script>]], then second[[Second note]].'));
    const t = (key: TranslationKey, params?: Record<string, string | number>) => Object.entries(params || {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translations[lang][key]);
    const html = renderToStaticMarkup(createElement(QuranTranslationText, { translation, t }));
    const { document } = parseHTML(html);
    const paragraph = document.querySelector('[data-quran-translation]')!;
    assert.equal(paragraph.textContent, 'First phrase[1], then second[2].');
    const links = [...paragraph.querySelectorAll('sup a')];
    assert.equal(links.length, 2);
    assert.notEqual(links[0].getAttribute('href'), links[1].getAttribute('href'));
    for (const [index, link] of links.entries()) {
      const id = link.getAttribute('href')!.slice(1);
      assert.ok(document.getElementById(id)?.textContent.includes(index ? 'Second note' : 'First note'));
      assert.equal(link.getAttribute('aria-label'), t('quranFootnoteNumber', { number: index + 1 }));
    }
    assert.equal(document.querySelectorAll('script').length, 0);
    assert.equal(document.querySelectorAll('ol a').length, 2);
    assert.ok(html.includes(translations[lang].quranBackToFootnote.split('{number}')[0]));
  });
}
