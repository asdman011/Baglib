import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { id3Tags, mp4Tags, matroskaTags, readMediaTags } from '../../src/main/services/lectures/media-sections';
import { mergeMediaMetadata } from '../../src/main/services/lectures/media-metadata';
import { isLectureFormat } from '../../src/shared/lectures';
import { LectureLibrary } from '../../src/main/services/lectures/lecture-library';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { DigitalFileValidatorService } from '../../src/main/services/digital/digital-file-validator.service';
import { DigitalImportPipelineService } from '../../src/main/services/digital/digital-import-pipeline.service';

const u32 = (value: number) => { const result = Buffer.alloc(4); result.writeUInt32BE(value); return result; };
const box = (name: string, body: Buffer) => Buffer.concat([u32(body.length + 8), Buffer.from(name, 'latin1'), body]);
const textBox = (name: string, value: string) => box(name, box('data', Buffer.concat([u32(1), u32(0), Buffer.from(value)])));
const id3 = () => {
  const frames = Object.entries({ TIT2: 'العِلْم النافع', TPE1: 'أحمد Smith', TDRC: '2026-11-13' }).map(([id, value]) => {
    const body = Buffer.concat([Buffer.from([3]), Buffer.from(value)]);
    return Buffer.concat([Buffer.from(id), u32(body.length), Buffer.alloc(2), body]);
  });
  const body = Buffer.concat(frames), size = body.length;
  return Buffer.concat([Buffer.from([73, 68, 51, 3, 0, 0, size >> 21 & 127, size >> 14 & 127, size >> 7 & 127, size & 127]), body]);
};
const ebml = (id: number[], body: Buffer) => Buffer.concat([Buffer.from(id), Buffer.from([0x10 | body.length >>> 24, body.length >>> 16 & 255, body.length >>> 8 & 255, body.length & 255]), body]);
const tag = (name: string, value: string) => ebml([0x67, 0xc8], Buffer.concat([ebml([0x45, 0xa3], Buffer.from(name)), ebml([0x44, 0x87], Buffer.from(value))]));
const mkv = () => ebml([0x18, 0x53, 0x80, 0x67], Buffer.concat([
  ebml([0x15, 0x49, 0xa9, 0x66], ebml([0x7b, 0xa9], Buffer.from('Container title'))),
  ebml([0x12, 0x54, 0xc3, 0x67], ebml([0x73, 0x73], Buffer.concat([tag('TITLE', 'Tagged lecture'), tag('ARTIST', 'Speaker'), tag('DATE_RECORDED', '2025')]))),
]));

test('ID3, MP4 ilst and Matroska tags preserve Arabic and recording dates', () => {
  assert.deepEqual(id3Tags(id3()), { title: 'العِلْم النافع', speaker: 'أحمد Smith', recordingDate: '2026-11-13' });
  const mp4 = box('udta', box('meta', Buffer.concat([Buffer.alloc(4), box('ilst', Buffer.concat([textBox('©nam', 'English title'), textBox('©ART', 'Speaker'), textBox('©day', '2026')]))])));
  assert.deepEqual(mp4Tags(mp4), { title: 'English title', speaker: 'Speaker', recordingDate: '2026' });
  assert.deepEqual(matroskaTags(mkv()), { title: 'Tagged lecture', speaker: 'Speaker', recordingDate: '2025' });
  assert.deepEqual(id3Tags(Buffer.from('ID3')), {});
  assert.deepEqual(mp4Tags(u32(999)), {});
});
test('media metadata merges tags over filename candidates and excludes bibliographic fields', () => {
  const metadata = mergeMediaMetadata('John Smith - English Lecture (2020).mp4', { title: 'عنوان أصلي', speaker: 'المتحدث', recordingDate: '2026' });
  assert.equal(metadata.title, 'عنوان أصلي'); assert.equal(metadata.speaker, 'المتحدث');
  assert.equal(metadata.recordingDate, '2026');
  assert.equal(metadata.publicationYear, undefined); assert.equal(metadata.isbn, undefined); assert.equal(metadata.publisher, undefined); assert.equal(metadata.edition, undefined);
  assert.ok(mergeMediaMetadata('English Lecture.mp4', {}).title?.includes('English Lecture'));
  assert.equal(mergeMediaMetadata('English Lecture by John Smith.webm', {}).speaker, 'John Smith');
  const realArabic = mergeMediaMetadata('6.طريقة تربية الطفل  ايمن عبدالرحيم.mp4', {});
  assert.equal(realArabic.title, 'طريقة تربية الطفل'); assert.equal(realArabic.speaker, 'ايمن عبدالرحيم');
  const realEnglish = mergeMediaMetadata('10.A Plea for Balance.mp4', {});
  assert.equal(realEnglish.title, 'A Plea for Balance'); assert.equal(realEnglish.speaker, undefined);
  assert.equal(mergeMediaMetadata('المحاضرة -- أحمد محمد -- 2020.webm', {}).speaker, 'أحمد محمد');
});
test('legacy conversion is idempotent and preserves ids, sections, progress, subtitle and note targets', async () => {
  const db = new Database(':memory:'); runMigrations(db, migrations);
  const id = '9ef46e2d-c6ed-47ee-a4fc-1ee31bff4646';
  const settings = new SqliteSettingsRepository(db);
  settings.set('media.lectures.v1', [{ id, title: 'Old lecture', path: 'D:/missing.mp4', kind: 'video', sections: [{ title: 'Section', start: 12 }], sectionSource: 'user', addedAt: '2020-01-01' }]);
  settings.set('media.lecture-subtitles.v1', { [id]: 'D:/choice.srt' });
  const service = new LectureLibrary(db, 'D:/shots');
  try {
    new SqliteWorkRepository(db).addBook({title:'Lecture transcript PDF',workType:'lecture',bookType:'digital',digitalFormat:'PDF',filePath:'D:/transcript.pdf'});
    assert.equal(isLectureFormat('PDF'), false); assert.equal(isLectureFormat('MP4'), true);
    assert.equal(service.list().length, 1);
    assert.equal(service.list()[0].id, id);
    service.saveProgress(id, { position: 12, rate: 1.5, completed: false });
    assert.equal(new LectureLibrary(db, 'D:/shots').list().length, 1);
    assert.equal(service.list()[0].sections[0].start, 12);
    assert.equal(service.progress(id)?.position, 12);
    assert.equal((settings.get('media.lecture-subtitles.v1') as Record<string, string>)[id], 'D:/choice.srt');
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM work').get() as { n: number }).n, 2);
    assert.equal(new SqliteWorkRepository(db).getById(id)?.workType, 'lecture');
    service.remove(id); assert.equal(service.list().length, 0);
    assert.ok(new SqliteWorkRepository(db).getById(id)?.deletedAt);
  } finally { db.close(); }
});
test('media validator and normal import pipeline create a lecture Work with a speaker and no publication year', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'baglib-media-'));
  const db = new Database(':memory:'); runMigrations(db, migrations);
  try {
    const matroska = path.join(directory, 'recorded.webm');
    await writeFile(matroska, Buffer.concat([ebml([0x1a,0x45,0xdf,0xa3], Buffer.alloc(0)), Buffer.from([0x18,0x53,0x80,0x67,1,255,255,255,255,255,255,255]), mkv().subarray(8)]));
    assert.equal((await readMediaTags(matroska)).speaker, 'Speaker');
    const filename = path.join(directory, 'lecture.mp3'); await writeFile(filename, id3());
    assert.equal((await readMediaTags(filename)).speaker, 'أحمد Smith');
    const validator = new DigitalFileValidatorService();
    assert.equal((await validator.validateFile(filename)).format, 'mp3');
    assert.equal(validator.validateBuffer(Buffer.from('not media'), 'bad.mp4').isValid, false);
    assert.equal(validator.isFormatSupported('.wma'), false);
    const repository = new SqliteWorkRepository(db);
    const pipeline = new DigitalImportPipelineService(repository);
    const result = await pipeline.importFile({ filePath: filename, duplicateAction: 'skip', skipExactDuplicatesOnly: true });
    assert.equal(result.success, true, result.error);
    const work = repository.getById(result.workId!);
    assert.equal(work?.workType, 'lecture'); assert.equal(work?.speaker, 'أحمد Smith'); assert.equal(work?.recordingDate, '2026-11-13');
    assert.equal(work?.publicationYear, undefined); assert.equal(work?.digitalFormat, 'mp3');
    assert.equal((await pipeline.importFile({ filePath: filename, duplicateAction: 'skip', skipExactDuplicatesOnly: true })).skipped, true);
    assert.equal(new LectureLibrary(db, directory).list()[0].id, result.workId);
  } finally { db.close(); await rm(directory, { recursive: true, force: true }); }
});
