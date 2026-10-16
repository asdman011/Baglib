/**
 * Baglib — Unit Tests for Audio Utilities, SMIL Parser & TTS Language Segmenter (KEY-145)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSmilClock, parseSmilXml } from '../../src/shared/utils/smil-parser';
import {
  detectCharScript,
  detectDominantLanguage,
  segmentMixedTextForTTS,
} from '../../src/shared/utils/tts-language-segmenter';
import { buildSequentialAudiobookMappings } from '../../src/shared/utils/audiobook-mapping';

describe('Audio Utilities (KEY-145)', () => {
  describe('SMIL Clock Parser (parseSmilClock)', () => {
    it('parses mm:ss and mm:ss.mmm', () => {
      assert.strictEqual(parseSmilClock('02:15'), 135);
      assert.strictEqual(parseSmilClock('00:45.500'), 45.5);
    });

    it('parses hh:mm:ss and hh:mm:ss.mmm', () => {
      assert.strictEqual(parseSmilClock('01:00:00'), 3600);
      assert.strictEqual(parseSmilClock('01:23:45.678'), 5025.678);
    });

    it('parses timecount units (s, ms, min, h)', () => {
      assert.strictEqual(parseSmilClock('45s'), 45);
      assert.strictEqual(parseSmilClock('500ms'), 0.5);
      assert.strictEqual(parseSmilClock('2.5min'), 150);
      assert.strictEqual(parseSmilClock('1.5h'), 5400);
    });

    it('gracefully handles null, empty, and invalid strings', () => {
      assert.strictEqual(parseSmilClock(''), 0);
      assert.strictEqual(parseSmilClock(null), 0);
      assert.strictEqual(parseSmilClock(undefined), 0);
      assert.strictEqual(parseSmilClock('invalid:clock:format:xyz'), 0);
    });
  });

  describe('SMIL Media Overlay XML Parser (parseSmilXml)', () => {
    it('parses standard EPUB 3 SMIL media overlay XML', () => {
      const sampleSmil = `<?xml version="1.0" encoding="utf-8"?>
      <smil xmlns="http://www.w3.org/ns/SMIL" version="3.0">
        <body>
          <seq id="seq1">
            <par id="par1">
              <text src="chapter01.xhtml#p1" />
              <audio src="audio/chapter01.mp3" clipBegin="00:00:00.000" clipEnd="00:00:05.500" />
            </par>
            <par id="par2">
              <text src="chapter01.xhtml#p2" />
              <audio src="audio/chapter01.mp3" clipBegin="00:00:05.500" clipEnd="00:00:12.800" />
            </par>
            <par id="par3">
              <text src="chapter01.xhtml" />
              <audio src="audio/chapter01.mp3" clipBegin="12.8s" clipEnd="25s" />
            </par>
          </seq>
        </body>
      </smil>`;

      const pars = parseSmilXml(sampleSmil);
      assert.strictEqual(pars.length, 3);

      assert.strictEqual(pars[0].textHref, 'chapter01.xhtml');
      assert.strictEqual(pars[0].textId, 'p1');
      assert.strictEqual(pars[0].audioHref, 'audio/chapter01.mp3');
      assert.strictEqual(pars[0].clipBegin, 0);
      assert.strictEqual(pars[0].clipEnd, 5.5);

      assert.strictEqual(pars[1].textId, 'p2');
      assert.strictEqual(pars[1].clipBegin, 5.5);
      assert.strictEqual(pars[1].clipEnd, 12.8);

      assert.strictEqual(pars[2].textId, '');
      assert.strictEqual(pars[2].clipBegin, 12.8);
      assert.strictEqual(pars[2].clipEnd, 25);
    });

    it('returns empty array for invalid or empty XML', () => {
      assert.deepStrictEqual(parseSmilXml(''), []);
      assert.deepStrictEqual(parseSmilXml('<not-smil></not-smil>'), []);
    });
  });

  describe('Multilingual Script Segmenter & Language Detector', () => {
    it('detects character script correctly', () => {
      assert.strictEqual(detectCharScript('A'), 'en');
      assert.strictEqual(detectCharScript('z'), 'en');
      assert.strictEqual(detectCharScript('ب'), 'ar');
      assert.strictEqual(detectCharScript('ي'), 'ar');
      assert.strictEqual(detectCharScript(' '), 'neutral');
      assert.strictEqual(detectCharScript('.'), 'neutral');
    });

    it('detects dominant language of string', () => {
      assert.strictEqual(detectDominantLanguage('This is an English paragraph.'), 'en');
      assert.strictEqual(detectDominantLanguage('هذا نص عربي فصيح ذو بلاغة وبيان.'), 'ar');
    });

    it('segments mixed English and Arabic sentences without splitting words', () => {
      const mixedText = 'As the author noted: قال رسول الله صلى الله عليه وسلم in his book.';
      const segments = segmentMixedTextForTTS(mixedText);

      assert.strictEqual(segments.length, 3);
      assert.strictEqual(segments[0].lang, 'en');
      assert.strictEqual(segments[0].text.trim(), 'As the author noted:');

      assert.strictEqual(segments[1].lang, 'ar');
      assert.strictEqual(segments[1].text.trim(), 'قال رسول الله صلى الله عليه وسلم');

      assert.strictEqual(segments[2].lang, 'en');
      assert.strictEqual(segments[2].text.trim(), 'in his book.');
    });

    it('preserves single language sentences intact', () => {
      const arabicText = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
      const segments = segmentMixedTextForTTS(arabicText);

      assert.strictEqual(segments.length, 1);
      assert.strictEqual(segments[0].lang, 'ar');
      assert.strictEqual(segments[0].text, arabicText);
    });
  });

  describe('Continuum Chapter Anchor Mapping (buildSequentialAudiobookMappings)', () => {
    it('builds direct 1-to-1 sequential mappings', () => {
      const ebookChapters = ['ch1', 'ch2', 'ch3', 'ch4'];
      const audioChapters = ['track1', 'track2', 'track3', 'track4'];

      const mappings = buildSequentialAudiobookMappings(ebookChapters, audioChapters, {
        ebookChapterId: 'ch1',
        audioChapterId: 'track1',
      });

      assert.strictEqual(mappings.length, 4);
      assert.deepStrictEqual(mappings[0], { ebookChapterId: 'ch1', audioChapterId: 'track1' });
      assert.deepStrictEqual(mappings[1], { ebookChapterId: 'ch2', audioChapterId: 'track2' });
      assert.deepStrictEqual(mappings[2], { ebookChapterId: 'ch3', audioChapterId: 'track3' });
      assert.deepStrictEqual(mappings[3], { ebookChapterId: 'ch4', audioChapterId: 'track4' });
    });

    it('handles offset when Track 1 is an Intro / Prologue', () => {
      const ebookChapters = ['ch1', 'ch2', 'ch3'];
      const audioChapters = ['track_intro', 'track1', 'track2', 'track3', 'track_outro'];

      // User anchors eBook Chapter 1 with audio Track 1 (skipping intro)
      const mappings = buildSequentialAudiobookMappings(ebookChapters, audioChapters, {
        ebookChapterId: 'ch1',
        audioChapterId: 'track1',
      });

      // track_intro is at index 0, offset = 0 - 1 = -1 -> targetEbookIndex = -1 (excluded)
      // track1 (idx 1) -> ch1 (idx 0)
      // track2 (idx 2) -> ch2 (idx 1)
      // track3 (idx 3) -> ch3 (idx 2)
      // track_outro (idx 4) -> index 3 (out of range, excluded)
      assert.strictEqual(mappings.length, 3);
      assert.deepStrictEqual(mappings[0], { ebookChapterId: 'ch1', audioChapterId: 'track1' });
      assert.deepStrictEqual(mappings[1], { ebookChapterId: 'ch2', audioChapterId: 'track2' });
      assert.deepStrictEqual(mappings[2], { ebookChapterId: 'ch3', audioChapterId: 'track3' });
    });

    it('supports options object signature', () => {
      const ebookChapters = ['c1', 'c2'];
      const audioChapters = ['a1', 'a2'];

      const mappings = buildSequentialAudiobookMappings({
        ebookChapterIds: ebookChapters,
        audioChapterIds: audioChapters,
      });

      assert.strictEqual(mappings.length, 2);
      assert.strictEqual(mappings[0].ebookChapterId, 'c1');
      assert.strictEqual(mappings[0].audioChapterId, 'a1');
    });

    it('returns empty array if anchor is not found', () => {
      const mappings = buildSequentialAudiobookMappings(['c1'], ['a1'], {
        ebookChapterId: 'c_non_existent',
        audioChapterId: 'a1',
      });
      assert.deepStrictEqual(mappings, []);
    });
  });
});
