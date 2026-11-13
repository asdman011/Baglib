import { test } from 'node:test';
import assert from 'node:assert/strict';
import { childFolders, folderCounts, folderLabels, noteFolders, notePosition, notesInFolder, targetFolder, resolveLectureFolder } from '../../src/shared/notes-tree';

const lecture = '0f3b0a2e-1111-4222-8333-444455556666';
const note = (id: string, content: string, extra: { sourceRef?: string; workId?: string } = {}) => ({ id, content, ...extra });

// KEY-338: the Notes tab files every note under the sources it is about, like folders.
test('passage targets are filed under their source folder', () => {
  assert.equal(targetFolder('quran:hafs:2:255'), 'quran/2');
  assert.equal(targetFolder('quran:warsh:2:255-257'), 'quran/2');
  assert.equal(targetFolder('sunnah:Bukhari:1:Bukhari-1'), 'sunnah/Bukhari/1');
  assert.equal(targetFolder('book:abc'), 'library/abc');
  assert.equal(targetFolder('poetry:ashaar:12:3:4'), 'poetry/12');
  assert.equal(targetFolder(`media:${lecture}:90`), `lectures/${lecture}`);
  assert.equal(targetFolder('note:xyz'), null, 'a link to another note is not a source');
});

test('a note lives in every folder it links to; a note without a source goes under Other', () => {
  assert.deepEqual(noteFolders(note('a', '[[quran:hafs:2:255|آية الكرسي]] و [[sunnah:Muslim:3:Muslim-7|مسلم]]')).sort(), ['quran/2', 'sunnah/Muslim/3']);
  assert.deepEqual(noteFolders(note('b', 'plain thought')), ['other']);
  assert.deepEqual(noteFolders(note('c', 'reading note', { workId: 'w1' })), ['library/w1']);
  assert.deepEqual(noteFolders(note('d', 'comment', { sourceRef: 'commentary:quran:1:1:reflection' })), ['quran/1']);
});

test('folder counts include ancestors and count a note once per folder', () => {
  const notes = [
    note('1', '[[quran:hafs:2:255|255]] [[quran:hafs:2:256|256]]'),
    note('2', '[[quran:hafs:1:1|1]]'),
    note('3', '[[sunnah:Bukhari:1:x|b]]'),
    note('4', 'free'),
  ];
  const counts = folderCounts(notes);
  assert.equal(counts.get('quran'), 2);
  assert.equal(counts.get('quran/2'), 1);
  assert.equal(counts.get('sunnah'), 1);
  assert.equal(counts.get('sunnah/Bukhari/1'), 1);
  assert.equal(counts.get('other'), 1);
  assert.deepEqual(childFolders(counts, 'quran'), ['quran/1', 'quran/2'], 'surahs in number order');
  assert.deepEqual(notesInFolder(notes, 'quran').map(item => item.id), ['1', '2']);
  assert.deepEqual(notesInFolder(notes, 'quran/2').map(item => item.id), ['1']);
});

test('poems and lectures are named from their link labels; notes sort by position', () => {
  const notes = [note('1', `[[media:${lecture}:120|درس الفقه · 2:00]]`), note('2', '[[poetry:ashaar:12:3:4|المتنبي — على قدر أهل العزم]]')];
  const labels = folderLabels(notes);
  assert.equal(labels.get(`lectures/${lecture}`), 'درس الفقه');
  assert.equal(labels.get('poetry/12'), 'المتنبي — على قدر أهل العزم');
  assert.ok(notePosition(note('x', '[[quran:hafs:2:5|5]]'), 'quran/2') < notePosition(note('y', '[[quran:hafs:2:255|255]]'), 'quran/2'));
  assert.equal(notePosition(notes[0], `lectures/${lecture}`), 120);
});


test('lecture series adds exactly one folder level and leaves ungrouped lectures at the root', () => {
  const group = { id: 'course', name: 'سلسلة العلم', autoplayNext: false, createdAt: '', updatedAt: '', items: [{ workId: lecture, title: 'الدرس الأول', completed: false }] };
  const grouped = note('series-note', `[[media:${lecture}:45|الدرس الأول · 0:45]]`);
  const path = `lectures/series-course/${lecture}`;
  assert.equal(targetFolder(`media:${lecture}:45`, [group]), path);
  assert.deepEqual(noteFolders(grouped, [group]), [path]);
  assert.equal(folderCounts([grouped], [group]).get('lectures/series-course'), 1);
  assert.equal(notesInFolder([grouped], 'lectures/series-course', [group]).length, 1);
  assert.equal(folderLabels([grouped], [group]).get('lectures/series-course'), 'سلسلة العلم');
  assert.equal(folderLabels([grouped], [group]).get(path), 'الدرس الأول');
  assert.equal(notePosition(grouped, path, [group]), 45);
  assert.equal(targetFolder(`media:${lecture}:45`, []), `lectures/${lecture}`);
});


test('remembered lecture folders follow assignment and survive series deletion', () => {
  const group = { id: 'course', name: 'Course', autoplayNext: false, createdAt: '', updatedAt: '', items: [{ workId: lecture, title: 'Lecture', completed: false }] };
  assert.equal(resolveLectureFolder(`lectures/${lecture}`, [group]), `lectures/series-course/${lecture}`);
  assert.equal(resolveLectureFolder(`lectures/series-course/${lecture}`, []), `lectures/${lecture}`);
  assert.equal(resolveLectureFolder('lectures/series-course', []), 'lectures');
  assert.equal(resolveLectureFolder('lectures/series-course', [group]), 'lectures/series-course');
  assert.equal(resolveLectureFolder('quran/2', [group]), 'quran/2');
  assert.equal(resolveLectureFolder(null, [group]), null);
});
