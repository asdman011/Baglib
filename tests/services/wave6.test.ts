import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { chplSections, id3Sections, matroskaSections, readSections } from '../../src/main/services/lectures/media-sections';
import { LectureLibrary } from '../../src/main/services/lectures/lecture-library';
import { CourseraClient, toProgress } from '../../src/main/services/courses/coursera';
import { validAccount } from '../../src/shared/courses';
import { clockTime, validProgress, validSections } from '../../src/shared/lectures';
import { compareTexts } from '../../src/shared/ocr-compare';
import { proposeFromCover } from '../../src/shared/cover-text';
import { validStudyTarget } from '../../src/shared/study-notes';
import { LAYOUT_PAGE_SEGMENTATION } from '../../src/main/services/pdf-editor/layout-ocr';

const u32 = (value: number) => { const buffer = Buffer.alloc(4); buffer.writeUInt32BE(value); return buffer; };
const syncsafe = (value: number) => Buffer.from([(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f]);

function id3(chapters: { id: string; startMs: number; title: string }[]): Buffer {
  const frames = chapters.map(chapter => {
    const title = Buffer.concat([Buffer.from([3]), Buffer.from(chapter.title, 'utf8')]);
    const tit2 = Buffer.concat([Buffer.from('TIT2'), syncsafe(title.length), Buffer.alloc(2), title]);
    const body = Buffer.concat([Buffer.from(`${chapter.id}\0`), u32(chapter.startMs), u32(chapter.startMs + 1000), u32(0xffffffff), u32(0xffffffff), tit2]);
    return Buffer.concat([Buffer.from('CHAP'), syncsafe(body.length), Buffer.alloc(2), body]);
  });
  const all = Buffer.concat(frames);
  return Buffer.concat([Buffer.from('ID3'), Buffer.from([4, 0, 0]), syncsafe(all.length), all, Buffer.from([0xff, 0xfb, 0x90, 0x00])]);
}

function box(type: string, ...parts: Buffer[]): Buffer { const body = Buffer.concat(parts); return Buffer.concat([u32(body.length + 8), Buffer.from(type, 'latin1'), body]); }
function chpl(chapters: { start: number; title: string }[]): Buffer {
  const entries = chapters.map(chapter => { const title = Buffer.from(chapter.title, 'utf8'); const start = Buffer.alloc(8); start.writeBigUInt64BE(BigInt(Math.round(chapter.start * 10_000_000))); return Buffer.concat([start, Buffer.from([title.length]), title]); });
  return box('chpl', Buffer.from([1, 0, 0, 0]), Buffer.alloc(4), Buffer.from([chapters.length]), ...entries);
}

function ebml(id: number[], body: Buffer): Buffer {
  const size = body.length;
  return Buffer.concat([Buffer.from(id), Buffer.from([0x01, 0, 0, 0, (size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff]), body]);
}
function mkv(chapters: { start: number; title: string }[]): Buffer {
  const atoms = chapters.map(chapter => {
    const time = Buffer.alloc(8); time.writeBigUInt64BE(BigInt(Math.round(chapter.start * 1e9)));
    return ebml([0xb6], Buffer.concat([ebml([0x91], time), ebml([0x80], ebml([0x85], Buffer.from(chapter.title, 'utf8')))]));
  });
  const segment = ebml([0x18, 0x53, 0x80, 0x67], Buffer.concat([ebml([0x10, 0x43, 0xa7, 0x70], ebml([0x45, 0xb9], Buffer.concat(atoms))), ebml([0x1f, 0x43, 0xb6, 0x75], Buffer.alloc(16))]));
  return Buffer.concat([ebml([0x1a, 0x45, 0xdf, 0xa3], Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d])), segment]);
}

test('sections come from MP3 CHAP frames, MP4 chpl and Matroska chapters, with Arabic titles intact', () => {
  assert.deepEqual(id3Sections(id3([{ id: 'c1', startMs: 0, title: 'المقدمة' }, { id: 'c2', startMs: 65_500, title: 'الباب الأول' }])), [{ title: 'المقدمة', start: 0 }, { title: 'الباب الأول', start: 65.5 }]);
  assert.deepEqual(chplSections(box('udta', chpl([{ start: 0, title: 'Intro' }, { start: 125.25, title: 'شرح' }]))), [{ title: 'Intro', start: 0 }, { title: 'شرح', start: 125.25 }]);
  assert.deepEqual(matroskaSections(mkv([{ start: 0, title: 'أ' }, { start: 3600, title: 'ب' }])), [{ title: 'أ', start: 0 }, { title: 'ب', start: 3600 }]);
  assert.deepEqual(id3Sections(Buffer.from('not a tag')), []);
});

test('readSections finds a moov box placed after the media data', async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'baglib-sections-'));
  try {
    const file = path.join(folder, 'talk.m4a');
    writeFileSync(file, Buffer.concat([box('ftyp', Buffer.from('M4A isom')), box('mdat', Buffer.alloc(2048)), box('moov', box('udta', chpl([{ start: 10, title: 'Part' }])))]));
    assert.deepEqual(await readSections(file), [{ title: 'Part', start: 10 }]);
    writeFileSync(path.join(folder, 'chapters.mkv'), mkv([{ start: 1, title: 'x' }]));
    assert.deepEqual(await readSections(path.join(folder, 'chapters.mkv')), [{ title: 'x', start: 1 }]);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('the lecture library keeps position and rate, and removing a lecture keeps the file', async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'baglib-lectures-'));
  const db = new Database(':memory:'); runMigrations(db, migrations);
  try {
    const file = path.join(folder, 'درس.mp3');
    writeFileSync(file, id3([{ id: 'a', startMs: 0, title: 'بداية' }]));
    writeFileSync(path.join(folder, 'notes.txt'), 'x');
    const library = new LectureLibrary(db, path.join(folder, 'shots'));
    const [lecture] = await library.add([file, path.join(folder, 'notes.txt'), file]);
    assert.deepEqual([lecture.title, lecture.kind, lecture.sectionSource, lecture.sections.length], ['درس', 'audio', 'file', 1]);
    assert.equal(library.list().length, 1);
    library.saveProgress(lecture.id, { position: 42.5, rate: 1.5, completed: false });
    assert.deepEqual(library.progress(lecture.id), { position: 42.5, rate: 1.5, completed: false });
    assert.equal(library.update(lecture.id, { sections: [] }).sectionSource, 'none');
    const shot = await library.saveShot(lecture.id, `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(8)]).toString('base64')}`);
    assert.ok(readFileSync(path.join(folder, 'shots', `${shot}.png`)).length > 0);
    await assert.rejects(library.saveShot(lecture.id, 'data:image/png;base64,AAAA'), /invalid-request/);
    library.remove(lecture.id);
    assert.deepEqual([library.list().length, library.progress(lecture.id)], [0, null]);
    assert.ok(readFileSync(file).length > 0);
  } finally { db.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('lecture targets are valid study links and inputs are checked', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  assert.ok(validStudyTarget(`media:${id}:125`));
  assert.ok(validStudyTarget(`media:${id}:0:${id}`));
  assert.ok(!validStudyTarget(`media:${id}:-1`));
  assert.ok(!validStudyTarget('media:x:1'));
  assert.equal(clockTime(3725), '1:02:05');
  assert.equal(clockTime(65), '1:05');
  assert.throws(() => validProgress({ position: 1, rate: 7 }), /invalid-request/);
  assert.deepEqual(validSections([{ title: ' ب ', start: 9 }, { title: 'أ', start: 2 }]).map(item => item.title), ['أ', 'ب']);
});

test('Coursera progress keeps only the learner, follows paging and stops on refusal', async () => {
  const calls: string[] = [];
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/oauth2/client_credentials/token')) {
      assert.equal((init?.headers as Record<string, string>).Authorization, `Basic ${Buffer.from('key:secret').toString('base64')}`);
      return reply({ access_token: 'token' });
    }
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer token');
    return url.includes('start=0')
      ? reply({ elements: [{ id: 'a', contentId: 'c1', contentType: 'Course', contentName: 'Islamic Finance', contentSlug: 'islamic-finance', externalId: 'Me@Example.com', overallProgress: 37, isCompleted: false, lastActivityAt: 1569229361000 }, { id: 'b', contentId: 'c2', contentType: 'Course', externalId: 'other@example.com' }], paging: { next: '2', total: 3 } })
      : reply({ elements: [{ id: 'c', contentId: 'c3', contentType: 'Specialization', contentSlug: 'arabic', email: 'me@example.com', overallProgress: 120, isCompleted: true }], paging: { total: 3 } });
  }) as typeof fetch;
  const snapshot = await new CourseraClient('https://example.test', fake).progress(validAccount({ organizationId: 'org-1', learner: 'me@example.com', key: 'key', secret: 'secret' }));
  assert.deepEqual(snapshot.courses.map(course => [course.name, course.progress, course.completed, course.url]), [
    ['Islamic Finance', 37, false, 'https://www.coursera.org/learn/islamic-finance'],
    ['c3', 100, true, 'https://www.coursera.org/specializations/arabic'],
  ]);
  assert.equal(calls.length, 3);
  const refused = (async () => new Response('{}', { status: 401 })) as typeof fetch;
  await assert.rejects(new CourseraClient('https://example.test', refused).progress(validAccount({ organizationId: 'o', learner: 'l', key: 'k', secret: 's' })), /coursera-denied/);
  assert.throws(() => validAccount({ organizationId: 'o/../x', learner: 'l', key: 'k', secret: 's' }), /invalid-request/);
  assert.equal(toProgress({ id: 'x', contentId: 'y', contentType: 'Video' }).url, null);
});

test('compare aligns words, ignores marks, and keeps ة apart from ه', () => {
  const result = compareTexts('قَالَ رسول الله صلي عليه وسلم زيادة', 'قال رسول الله صلى الله عليه وسلم');
  assert.deepEqual(result.pieces.map(piece => piece.kind), ['same', 'same', 'same', 'changed', 'missing', 'same', 'same', 'extra']);
  assert.equal(result.pieces[0].ocr, 'قَالَ');
  assert.equal(compareTexts('رحمه', 'رحمة').changed, 1);
  assert.deepEqual([compareTexts('', 'أ').missing, compareTexts('أ', '').extra], [1, 1]);
});

test('a cover proposes its largest print as the title and finds the author after تأليف', () => {
  const line = (text: string, y: number, height: number) => ({ text, words: [], bbox: { x: 0, y, width: 500, height } });
  assert.deepEqual(proposeFromCover([line('دار المعرفة', 900, 20), line('فتح الباري', 100, 80), line('شرح صحيح البخاري', 190, 70), line('تأليف: ابن حجر العسقلاني', 400, 30), line('٢٠٠٣', 950, 18)]), {
    title: 'فتح الباري شرح صحيح البخاري', author: 'ابن حجر العسقلاني', lines: ['فتح الباري', 'شرح صحيح البخاري', 'تأليف: ابن حجر العسقلاني', 'دار المعرفة'],
  });
  assert.equal(proposeFromCover([line('The Book', 50, 60), line('by Jane Roe', 200, 20)]).author, 'Jane Roe');
  assert.deepEqual(proposeFromCover([]), { title: '', author: '', lines: [] });
});

test('page layouts map to the segmentation the benchmark chose', () => {
  assert.deepEqual(LAYOUT_PAGE_SEGMENTATION, { columns: 3, lines: 6 });
  const worker = readFileSync('assets/ocr/ocrmypdf_worker.py', 'utf8');
  assert.match(worker, /PAGE_SEGMENTATION = \{"lines": 6, "columns": 3\}/u);
});
