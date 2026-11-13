import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decodeSubtitles, LectureSubtitles, readSubtitles } from '../../src/main/services/lectures/subtitles';

const srt = '1\n00:00:01,000 --> 00:00:03,000\nWelcome';
test('UTF-8 BOM and legacy Arabic cp1256 decode without modifying canonical text', () => {
  assert.equal(decodeSubtitles(Buffer.from('\uFEFFالعِلْم Welcome')), 'العِلْم Welcome');
  assert.equal(decodeSubtitles(Buffer.from([0xc7, 0xe1, 0xda, 0xe1, 0xe3])), 'العلم');
});
test('subtitle discovery, explicit choice, persisted choice and moved-sidecar fallback', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'baglib-subs-'));
  const db = new Database(':memory:');
  db.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
  try {
    const media = path.join(directory, 'lesson.mp4');
    const companion = path.join(directory, 'lesson.ar.srt');
    const selected = path.join(directory, 'English.vtt');
    await writeFile(companion, srt.replace('Welcome', 'العِلْم'));
    await writeFile(selected, srt);
    const service = new LectureSubtitles(db);
    assert.equal((await service.load('id', media))?.cues[0].text, 'العِلْم');
    await service.load('id', media, selected);
    assert.equal((await new LectureSubtitles(db).load('id', media))?.path, selected);
    await rm(selected);
    assert.equal((await service.load('id', media))?.path, companion);
    assert.equal(await service.load('other', path.join(directory, 'missing.mp4')), null);
  } finally { db.close(); await rm(directory, { recursive: true, force: true }); }
});
test('file validation rejects missing files, directories, extensions and oversized files', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'baglib-subs-'));
  try {
    await assert.rejects(readSubtitles(path.join(directory, 'absent.srt')));
    await assert.rejects(readSubtitles(path.join(directory, 'bad.txt')));
    const large = path.join(directory, 'large.srt');
    await writeFile(large, Buffer.alloc(5_000_001));
    await assert.rejects(readSubtitles(large));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
