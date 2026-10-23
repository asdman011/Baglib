import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanReadableText, segmentTextIntoSentences } from '../../src/shared/utils/tts-text';
import { translations } from '../../src/renderer/translations';

describe('TTS readable text utilities', () => {
  it('provides Arabic and English engine-failure and fallback notices', () => {
    for (const key of ['ttsProviderUnavailable', 'ttsArabicFallback', 'ttsPlaybackFallback'] as const) {
      assert.match(translations.ar[key], /[\u0600-\u06FF]/);
      assert.match(translations.en[key], /[A-Za-z]/);
      assert.notEqual(translations.ar[key], translations.en[key]);
    }
  });

  it('removes navigation and non-reading markup', () => {
    assert.equal(
      cleanReadableText('<nav>Next</nav><article><p>First paragraph.</p><button>Close</button></article>'),
      'First paragraph.'
    );
  });

  it('segments at sentence boundaries without losing punctuation', () => {
    assert.deepEqual(
      segmentTextIntoSentences('First sentence. Second sentence? ثالث جملة!'),
      [
        { text: 'First sentence.', startIndex: 0, endIndex: 15 },
        { text: 'Second sentence?', startIndex: 16, endIndex: 32 },
        { text: 'ثالث جملة!', startIndex: 33, endIndex: 43 },
      ]
    );
  });
});
