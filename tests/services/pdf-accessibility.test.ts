import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReflowParagraphs,
  isArabicText,
  selectTtsVoiceForParagraph,
  type TextBlockItem,
} from '../../src/shared/pdf-accessibility-utils';
import { isVeraPdfAvailable } from '../../src/main/services/pdf-editor/accessibility';

test('KEY-272: PDF Accessibility & Reflow Utilities', async (t) => {
  await t.test('isArabicText correctly identifies Arabic script', () => {
    assert.equal(isArabicText('بسم الله الرحمن الرحيم'), true);
    assert.equal(isArabicText('الحمد لله رب العالمين، والصلاة والسلام على رسول الله.'), true);
    assert.equal(isArabicText('Introduction to Cognitive Science and Poetry'), false);
    assert.equal(isArabicText('Chapter 1: The Foundations (الفصل الأول)'), false); // Primarily English title
    assert.equal(isArabicText(''), false);
  });

  await t.test('buildReflowParagraphs from string splits and sets RTL/LTR direction', () => {
    const raw = `
      هذا هو المقطع الأول من النص العربي المقروء.
      ويحتوي على جمل متعددة للتجربة والتحقق.

      This is the second paragraph in English.
      It contains multiple sentences for testing reflow.
    `;

    const paragraphs = buildReflowParagraphs(raw);
    assert.equal(paragraphs.length, 2);

    // Paragraph 1: Arabic
    assert.equal(paragraphs[0].direction, 'rtl');
    assert.equal(paragraphs[0].sentences.length >= 1, true);
    assert.match(paragraphs[0].text, /المقطع الأول/u);

    // Paragraph 2: English
    assert.equal(paragraphs[1].direction, 'ltr');
    assert.equal(paragraphs[1].sentences.length >= 1, true);
    assert.match(paragraphs[1].text, /second paragraph/u);
  });

  await t.test('buildReflowParagraphs from TextBlockItem respects geometry and RTL order', () => {
    // Two lines of Arabic text: on the same line (y=100), the rightmost block (higher x) comes first in RTL
    const arabicBlocks: TextBlockItem[] = [
      { text: 'العلم نافع', x: 200, y: 100, width: 80, height: 16, direction: 'rtl' },
      { text: 'قال الإمام:', x: 300, y: 100, width: 80, height: 16, direction: 'rtl' },
      { text: 'المقطع الثاني في سطر مستقل', x: 250, y: 150, width: 140, height: 16, direction: 'rtl' },
    ];

    const reflowed = buildReflowParagraphs(arabicBlocks, 'rtl');
    assert.equal(reflowed.length, 2);
    // Line 1 should put higher X first in RTL: "قال الإمام: العلم نافع"
    assert.equal(reflowed[0].direction, 'rtl');
    assert.equal(reflowed[0].text, 'قال الإمام: العلم نافع');
    assert.equal(reflowed[1].text, 'المقطع الثاني في سطر مستقل');
  });

  await t.test('buildReflowParagraphs from TextBlockItem respects LTR order', () => {
    const englishBlocks: TextBlockItem[] = [
      { text: 'The experiment', x: 50, y: 100, width: 90, height: 14, direction: 'ltr' },
      { text: 'proved successful.', x: 150, y: 100, width: 110, height: 14, direction: 'ltr' },
    ];

    const reflowed = buildReflowParagraphs(englishBlocks, 'ltr');
    assert.equal(reflowed.length, 1);
    assert.equal(reflowed[0].direction, 'ltr');
    assert.equal(reflowed[0].text, 'The experiment proved successful.');
  });

  await t.test('selectTtsVoiceForParagraph with Arabic voice available selects Arabic voice', () => {
    const mockVoices = [
      { lang: 'en-US', voiceURI: 'Microsoft-David', name: 'Microsoft David' },
      { lang: 'ar-SA', voiceURI: 'Microsoft-Naayf', name: 'Microsoft Naayf' },
    ];

    const arResult = selectTtsVoiceForParagraph('كتب التاريخ واللغة', mockVoices);
    assert.equal(arResult.hasVoice, true);
    assert.equal(arResult.voiceURI, 'Microsoft-Naayf');
    assert.equal(arResult.missingArabicNotice, false);

    const enResult = selectTtsVoiceForParagraph('Economics and Public Finance', mockVoices);
    assert.equal(enResult.hasVoice, true);
    assert.equal(enResult.voiceURI, 'Microsoft-David');
    assert.equal(enResult.missingArabicNotice, false);
  });

  await t.test('selectTtsVoiceForParagraph without Arabic voice (real dev box) returns missing notice without crash', () => {
    // Realistic test machine voices: only en-US and ja-JP
    const testBoxVoices = [
      { lang: 'en-US', voiceURI: 'Microsoft-David', name: 'Microsoft David' },
      { lang: 'en-US', voiceURI: 'Microsoft-Zira', name: 'Microsoft Zira' },
      { lang: 'ja-JP', voiceURI: 'Microsoft-Haruka', name: 'Microsoft Haruka' },
    ];

    // English text works smoothly
    const enResult = selectTtsVoiceForParagraph('Why lyrics last and cognitive evolution', testBoxVoices);
    assert.equal(enResult.hasVoice, true);
    assert.equal(enResult.voiceURI, 'Microsoft-David');
    assert.equal(enResult.missingArabicNotice, false);

    // Arabic text detects missing Arabic voice and signals notice
    const arResult = selectTtsVoiceForParagraph('تفسير المعوذتين للإمام ابن تيمية', testBoxVoices);
    assert.equal(arResult.hasVoice, false);
    assert.equal(arResult.missingArabicNotice, true);
    assert.equal(arResult.lang, 'ar');
  });

  await t.test('isVeraPdfAvailable gracefully handles missing java or verapdf paths', () => {
    assert.equal(isVeraPdfAvailable({ python: '', script: '', tessdata: '' }), false);
    assert.equal(isVeraPdfAvailable({ python: '', script: '', tessdata: '', java: 'C:/non-existent/java.exe', veraPdfJar: 'C:/non-existent/cli.jar' }), false);
  });
});
