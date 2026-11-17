import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SafeCardRenderer, filterCardFrameMessage } from '../../src/renderer/components/knowledge/SafeCardRenderer';
import { computeTypeDiff } from '../../src/shared/revision/template-engine';

test('safe card renderer: iframe has sandbox="allow-scripts" without allow-same-origin and strict CSP', () => {
  const maliciousScript = `
    <script>
      try { window.parent.location = 'about:blank'; } catch(e) { window.__parentBlocked = true; }
      try { window.electronAPI.test(); } catch(e) { window.__electronBlocked = true; }
      try { require('fs'); } catch(e) { window.__requireBlocked = true; }
      try { fetch('https://example.com'); } catch(e) { window.__fetchBlocked = true; }
    </script>
  `;

  // Render component via renderToString
  const comp = React.createElement(SafeCardRenderer, {
    html: `<div>Front Text</div>${maliciousScript}`,
    css: '.card { color: red; }',
    side: 'front',
    rtl: true,
  });

  const htmlOutput = renderToString(comp);

  // Check iframe attributes in the rendered markup
  assert.ok(htmlOutput.includes('sandbox="allow-scripts"'));
  assert.ok(!htmlOutput.includes('allow-same-origin'));

  // Decode srcdoc from HTML attribute
  assert.ok(htmlOutput.includes('default-src &#x27;none&#x27;') || htmlOutput.includes("default-src 'none'"));
  assert.ok(htmlOutput.includes('line-height: 2.2;'));
  assert.ok(htmlOutput.includes('dir=&quot;rtl&quot;') || htmlOutput.includes('dir="rtl"'));
});

test('safe card renderer: type-in card character diff shows exact matching and ignores tashkeel with type:nc', () => {
  const expected = 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ';
  const typedWithTashkeel = 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ';
  const typedPlain = 'انما الاعمال بالنيات';

  // Exact matching with matching diacritics
  const diffMatching = computeTypeDiff(typedWithTashkeel, expected, false);
  assert.equal(diffMatching.isCorrect, true);

  // type:nc ignores combining diacritics
  const diffNc = computeTypeDiff(typedPlain, expected, true);
  assert.ok(diffNc.isCorrect);
  assert.ok(diffNc.html.includes('type-diff'));

  // Without nc, diacritics mismatch is marked
  const diffExact = computeTypeDiff(typedPlain, expected, false);
  assert.equal(diffExact.isCorrect, false);
});

test('safe card renderer: rejects messages from foreign windows or unknown message types', () => {
  const targetWindow = { name: 'iframe-window' };
  const foreignWindow = { name: 'foreign-window' };
  const frameId = ':r1:';

  // 1. Message from foreign window is ignored
  const foreignMsg = filterCardFrameMessage(foreignWindow, targetWindow, {
    type: 'baglib-card-type-answer',
    frameId,
    value: 'secret',
  }, frameId);
  assert.equal(foreignMsg, null);

  // 2. Message with mismatched frameId is ignored
  const wrongFrameMsg = filterCardFrameMessage(targetWindow, targetWindow, {
    type: 'baglib-card-type-answer',
    frameId: ':r999:',
    value: 'answer',
  }, frameId);
  assert.equal(wrongFrameMsg, null);

  // 3. Message with unknown type is ignored
  const unknownTypeMsg = filterCardFrameMessage(targetWindow, targetWindow, {
    type: 'malicious-action',
    frameId,
  }, frameId);
  assert.equal(unknownTypeMsg, null);

  // 4. Valid typing message is accepted and text capped at 2000 chars
  const longValue = 'a'.repeat(3000);
  const validTyping = filterCardFrameMessage(targetWindow, targetWindow, {
    type: 'baglib-card-type-answer',
    frameId,
    value: longValue,
  }, frameId);
  assert.ok(validTyping);
  assert.equal(validTyping.value?.length, 2000);

  // 5. Valid TTS message is accepted and text capped
  const validTts = filterCardFrameMessage(targetWindow, targetWindow, {
    type: 'baglib-card-tts-play',
    frameId,
    text: longValue,
    lang: 'ar_SA',
  }, frameId);
  assert.ok(validTts);
  assert.equal(validTts.text?.length, 2000);
  assert.equal(validTts.lang, 'ar_SA');

  // 6. Height resize is clamped between 60 and 1600
  const smallResize = filterCardFrameMessage(targetWindow, targetWindow, {
    type: 'baglib-card-resize',
    frameId,
    height: 10,
  }, frameId);
  assert.equal(smallResize?.height, 60);

  const largeResize = filterCardFrameMessage(targetWindow, targetWindow, {
    type: 'baglib-card-resize',
    frameId,
    height: 5000,
  }, frameId);
  assert.equal(largeResize?.height, 1600);
});
