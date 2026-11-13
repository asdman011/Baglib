import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeCueIndex, companionSubtitleNames, isRtlCue, parseCueTime, parseSubtitles } from '../../src/shared/subtitles';

// KEY-343: lecture subtitles (SRT/VTT) and a transcript that follows playback.
test('cue times in SRT and VTT forms', () => {
  assert.equal(parseCueTime('01:02:03,456'), 3723.456);
  assert.equal(parseCueTime('02:03.5'), 123.5);
  assert.equal(parseCueTime('00:07'), 7);
  assert.ok(Number.isNaN(parseCueTime('soon')));
});

test('SRT with BOM, CRLF and Arabic; malformed cues are skipped', () => {
  const srt = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nبسم الله الرحمن الرحيم\r\n\r\n2\r\n00:00:04,000 --> 00:00:02,000\r\nbackwards\r\n\r\n3\r\nnot a time\r\nignored\r\n\r\n4\r\n00:00:05,000 --> 00:00:07,000\r\n<i>Second</i> &amp; line\r\n';
  const cues = parseSubtitles(srt);
  assert.deepEqual(cues, [{ start: 1, end: 3.5, text: 'بسم الله الرحمن الرحيم' }, { start: 5, end: 7, text: 'Second & line' }]);
});

test('WebVTT header, NOTE blocks, settings and voice tags', () => {
  const vtt = 'WEBVTT - lecture\n\nNOTE written by hand\n\nintro\n00:00.000 --> 00:02.000 align:start position:10%\n<v Shaykh>Welcome</v>\n\n00:02.000 --> 00:04.000\nالدرس الأول';
  const cues = parseSubtitles(vtt);
  assert.deepEqual(cues.map(cue => cue.text), ['Welcome', 'الدرس الأول']);
});

test('the active cue follows the playback time; gaps show nothing', () => {
  const cues = [{ start: 0, end: 2, text: 'a' }, { start: 3, end: 5, text: 'b' }, { start: 5, end: 9, text: 'c' }];
  assert.equal(activeCueIndex(cues, 1), 0);
  assert.equal(activeCueIndex(cues, 2.5), -1, 'between cues');
  assert.equal(activeCueIndex(cues, 5), 2);
  assert.equal(activeCueIndex(cues, 99), -1);
});

test('Arabic cues read right-to-left; companion files share the media name', () => {
  assert.ok(isRtlCue('قال رسول الله ﷺ (hadith)'));
  assert.ok(!isRtlCue('The first condition'));
  assert.deepEqual(companionSubtitleNames('درس.mp4', ['درس.ar.srt', 'درس.vtt', 'other.srt', 'درس.mp4', 'درس-2.srt']), ['درس.ar.srt', 'درس.vtt']);
});


test('invalid timestamp components and VTT metadata containing arrows are skipped', () => {
  assert.ok(Number.isNaN(parseCueTime('00:70:00')));
  assert.ok(Number.isNaN(parseCueTime('00:00:65')));
  assert.deepEqual(parseSubtitles('WEBVTT\n\nNOTE commentary\n00:00 --> 00:02\nignored\n\nSTYLE\n00:00 --> 00:02\nignored\n\n00:03 --> 00:04\nKept'), [{ start: 3, end: 4, text: 'Kept' }]);
  assert.equal(activeCueIndex([{ start: 0, end: 2, text: 'x' }], 2), -1);
});

test('cue and text limits bound malformed or excessive subtitle input', () => {
  assert.throws(() => parseSubtitles('x'.repeat(5_000_001)), /too-large/);
  assert.equal(parseSubtitles('00:00 --> 00:01\nx\n\n'.repeat(20_005)).length, 20_000);
  assert.deepEqual(parseSubtitles('00:00 --> 00:00\nzero\n\n00:00 --> 00:01\n'), []);
});
