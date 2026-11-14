import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EpubCoverExtractor } from '../../src/main/services/metadata/epub-cover-extractor.service';
import { LectureLibrary } from '../../src/main/services/lectures/lecture-library';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { MediaCoverService } from '../../src/main/services/lectures/media-cover';
import { id3Tags, mp4Tags } from '../../src/main/services/lectures/media-sections';
import { resolveMediaCover, captureMiddleFrame } from '../../src/renderer/utils/media-cover';
import type { BookItem } from '../../src/shared/types/work';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1kAAAAASUVORK5CYII=', 'base64');
const data = 'data:image/png;base64,' + png.toString('base64');
const book: BookItem = { id: 'media', title: 'درس Video', filePath: '/video.mp4', digitalFormat: 'mp4', bookType: 'digital', categories: [], tags: [], lendingHistory: [] };

test('cover fallback prefers the saved cover, then embedded art, then the middle frame', async () => {
  const calls: string[] = [];
  const api = { embeddedCover: async () => { calls.push('embedded'); return '/embedded.png' as string | null; }, saveCoverFrame: async () => { calls.push('save'); return '/frame.png'; } };
  const capture = async () => { calls.push('capture'); return data; };
  assert.equal(await resolveMediaCover({ ...book, coverImage: '/custom.png' }, api, capture), '/custom.png'); assert.deepEqual(calls, []);
  assert.equal(await resolveMediaCover(book, api, capture), '/embedded.png'); assert.deepEqual(calls, ['embedded']);
  calls.length = 0;
  api.embeddedCover = async () => { calls.push('embedded'); return null; };
  assert.equal(await resolveMediaCover(book, api, capture), '/frame.png'); assert.deepEqual(calls, ['embedded', 'capture', 'save']);
});

test('capture, unsupported audio, IPC and persistence failures fail softly to the placeholder', async () => {
  let captured = 0;
  const api = { embeddedCover: async () => null, saveCoverFrame: async () => { throw Error('storage'); } };
  const capture = async () => { captured++; return null; };
  assert.equal(await resolveMediaCover({ ...book, filePath: '/audio.mp3' }, api, capture), null); assert.equal(captured, 0);
  assert.equal(await resolveMediaCover(book, api, capture), null);
  assert.equal(await resolveMediaCover(book, api, async () => data), null);
  assert.equal(await resolveMediaCover(book, { ...api, embeddedCover: async () => { throw Error('missing'); } }, capture), null);
});

test('MP4 covr and ID3 APIC reuse the bounded metadata readers', () => {
  const box = (type: string, body: Buffer) => { const header = Buffer.alloc(8); header.writeUInt32BE(body.length + 8); header.write(type, 4, 'latin1'); return Buffer.concat([header, body]); };
  const flags = Buffer.alloc(8); flags.writeUInt32BE(14);
  const moov = box('udta', box('meta', Buffer.concat([Buffer.alloc(4), box('ilst', box('covr', box('data', Buffer.concat([flags, png]))))])));
  assert.deepEqual(mp4Tags(moov).coverBuffer, png); assert.equal(mp4Tags(moov).coverMimeType, 'image/png');
  const body = Buffer.concat([Buffer.from([3]), Buffer.from('image/png\0', 'latin1'), Buffer.from([3, 0]), png]);
  const frame = Buffer.alloc(10); frame.write('APIC'); frame.writeUInt32BE(body.length, 4);
  const header = Buffer.from([73, 68, 51, 3, 0, 0, 0, 0, 0, frame.length + body.length]);
  assert.deepEqual(id3Tags(Buffer.concat([header, frame, body])).coverBuffer, png);
  assert.equal(id3Tags(Buffer.concat([header, frame, body])).coverMimeType, 'image/png');
});

test('frame persistence patches only cover metadata and preserves an existing cover on retries', () => {
  const db = new Database(':memory:'); runMigrations(db, migrations);
  try {
    const works = new SqliteWorkRepository(db);
    works.addBook({ ...book, seriesTitle: 'Course', speaker: 'Speaker', workType: 'lecture' });
    let saved = 0;
    const service = new MediaCoverService(db, bytes => { assert.deepEqual(bytes, png); saved++; return '/covers/frame.png'; });
    assert.throws(() => service.saveFrame(book.id, 'bad'), /invalid-request/);
    assert.equal(service.saveFrame(book.id, data), '/covers/frame.png');
    assert.equal(service.saveFrame(book.id, data), '/covers/frame.png'); assert.equal(saved, 1);
    const after = works.getById(book.id)!;
    assert.equal(after.title, book.title); assert.equal(after.seriesTitle, 'Course'); assert.equal(after.speaker, 'Speaker');
    works.softDeleteBook(book.id);
    assert.throws(() => service.saveFrame(book.id, data), /invalid-request/, 'deleted work gets no cover update');
  } finally { db.close(); }
});

test('renderer captures the midpoint, bounds output size and releases its decoder', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let released = false, drawn = false;
  const video = { muted: false, preload: '', crossOrigin: '', src: '', videoWidth: 1920, videoHeight: 1080, duration: 120, currentTime: 0, onloadedmetadata: null as null | (() => void), onseeked: null as null | (() => void), onerror: null, pause() {}, removeAttribute() { released = true; }, load() { if (this.src && this.onloadedmetadata) queueMicrotask(() => { this.onloadedmetadata?.(); assert.equal(this.currentTime, 60); this.onseeked?.(); }); } };
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() { drawn = true; } }), toDataURL: () => data };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: (type: string) => type === 'video' ? video : canvas } });
  try { assert.equal(await captureMiddleFrame('/video.mp4'), data); assert.equal(canvas.width, 640); assert.equal(canvas.height, 360); assert.ok(drawn && released); }
  finally { if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document'); }
});

test('embedded artwork is stored on direct import and lazily for an existing Work, while invalid art is skipped', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'baglib-media-cover-'));
  const db = new Database(':memory:'); runMigrations(db, migrations);
  const persist = EpubCoverExtractor.persistCoverBuffer;
  const coverPath = path.join(directory, 'embedded.png');
  let writes = 0;
  EpubCoverExtractor.persistCoverBuffer = (bytes, mime) => { assert.deepEqual(bytes, png); assert.equal(mime, 'image/png'); writes++; return coverPath; };
  const mediaFile = async (name: string, image: Buffer) => {
    const body = Buffer.concat([Buffer.from([3]), Buffer.from('image/png\0', 'latin1'), Buffer.from([3, 0]), image]);
    const frame = Buffer.alloc(10); frame.write('APIC'); frame.writeUInt32BE(body.length, 4);
    const header = Buffer.from([73, 68, 51, 3, 0, 0, 0, 0, 0, frame.length + body.length]);
    const filename = path.join(directory, name);
    await writeFile(filename, Buffer.concat([header, frame, body]));
    return filename;
  };
  try {
    const filePath = await mediaFile('art.mp3', png);
    const works = new SqliteWorkRepository(db);
    const added = await new LectureLibrary(db, directory).add([filePath]);
    assert.equal(works.getById(added[0].id)!.coverImage, coverPath);
    works.addBook({ id: 'legacy-art', title: 'Legacy', bookType: 'digital', filePath, digitalFormat: 'mp3', workType: 'podcast' });
    assert.equal(await new MediaCoverService(db).embedded('legacy-art'), coverPath);
    assert.equal(works.getById('legacy-art')!.coverImage, coverPath);
    assert.equal(writes, 2);
    assert.equal(await new MediaCoverService(db).embedded('legacy-art'), coverPath);
    assert.equal(writes, 2, 'existing cover bypasses extraction');
    const invalid = await mediaFile('invalid.mp3', Buffer.from('corrupt artwork'));
    works.addBook({ id: 'invalid-art', title: 'Invalid', bookType: 'digital', filePath: invalid, digitalFormat: 'mp3', workType: 'lecture' });
    assert.equal(await new MediaCoverService(db).embedded('invalid-art'), null);
    assert.equal(writes, 2);
  } finally { EpubCoverExtractor.persistCoverBuffer = persist; db.close(); await rm(directory, { recursive: true, force: true }); }
});
