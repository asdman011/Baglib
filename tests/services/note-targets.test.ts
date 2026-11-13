import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commentaryTarget, markerCounts, noteTargets, notesForTarget, poetryRowCount, targetMatches } from '../../src/shared/note-targets';

const note = (id: string, content: string, sourceRef?: string) => ({ id, content, sourceRef });
const lecture = '0f3b0a2e-1111-4222-8333-444455556666';

// KEY-337: the note side panel lists the notes of a passage, and the text shows a marker where notes exist.
test('a personal comment is about the passage of its reference', () => {
  assert.equal(commentaryTarget('commentary:quran:2:255:reflection'), 'quran:hafs:2:255');
  assert.equal(commentaryTarget('commentary:quran:warsh:2:255:insight'), 'quran:warsh:2:255');
  assert.equal(commentaryTarget('commentary:hadith:77:question'), null, 'research ids are not study targets');
  assert.equal(commentaryTarget('page:12'), null);
});

test('a note points at its links, its comment passage and its poetry location', () => {
  assert.deepEqual(noteTargets(note('a', 'تأمل [[quran:hafs:2:255|البقرة ٢٥٥]] و[[sunnah:Bukhari:1:1|البخاري ١]]')), ['quran:hafs:2:255', 'sunnah:Bukhari:1:1']);
  assert.deepEqual(noteTargets(note('b', 'نص', 'poetry:ashaar:12:3:4')), ['poetry:ashaar:12:3:4']);
});

test('passages match across readings, ranges, lecture moments and overlapping verses', () => {
  assert.ok(targetMatches('quran:warsh:2:255', 'quran:hafs:2:255'), 'the same ayah in another reading');
  assert.ok(targetMatches('quran:hafs:2:254-256', 'quran:hafs:2:255'), 'an ayah inside a noted range');
  assert.ok(!targetMatches('quran:hafs:2:256', 'quran:hafs:2:255'));
  assert.ok(targetMatches(`media:${lecture}:90`, `media:${lecture}:300`), 'any moment of the same lecture');
  assert.ok(targetMatches('poetry:ashaar:12:3:5', 'poetry:ashaar:12:5:6'));
  assert.ok(!targetMatches('poetry:ashaar:12:3:4', 'poetry:ashaar:12:5:6'));
  assert.ok(!targetMatches('sunnah:Bukhari:1:1', 'sunnah:Bukhari:1:2'));
});

test('the panel lists only the notes of the passage; markers count each note once', () => {
  const notes = [
    note('1', '[[quran:hafs:2:255|آية الكرسي]] والكرسي [[quran:hafs:2:255|again]]'),
    note('2', 'comment', 'commentary:quran:2:255:reflection'),
    note('3', '[[quran:hafs:1:1|الفاتحة]]'),
    note('4', '[[poetry:ashaar:12:3:4|بيت]]'),
  ];
  assert.deepEqual(notesForTarget(notes, 'quran:hafs:2:255').map(item => item.id), ['1', '2']);
  const counts = markerCounts(notes);
  assert.equal(counts.get('quran:2:255'), 2);
  assert.equal(counts.get('quran:1:1'), 1);
  assert.equal(poetryRowCount(counts, 12, 4, 4), 1, 'a verse row inside the noted range');
  assert.equal(poetryRowCount(counts, 12, 5, 6), 0);
});
