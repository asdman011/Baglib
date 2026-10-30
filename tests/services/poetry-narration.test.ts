import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestDatabase } from '../helpers/test-db';
import { PoetryNarrationService, recordingExtension } from '../../src/main/services/poetry/narration';
import { narrationEmbedUrl, parseNarrationLink } from '../../src/shared/poetry-narration';

const webm = (size = 64) => { const bytes = new Uint8Array(size); bytes.set([0x1a, 0x45, 0xdf, 0xa3]); return bytes; };

test('narration links canonicalize supported human-narration providers and reject unsafe or unsupported URLs', () => {
  assert.deepEqual(parseNarrationLink('https://youtu.be/dQw4w9WgXcQ?t=1m5s'), { provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65' });
  assert.deepEqual(parseNarrationLink('https://youtu.be/dQw4w9WgXcQ?t=1M5S'), { provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65' });
  assert.deepEqual(parseNarrationLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x'), { provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(parseNarrationLink('https://www.youtube.com/watch/?v=dQw4w9WgXcQ')?.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(parseNarrationLink('https://m.youtube.com/shorts/dQw4w9WgXcQ')?.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(parseNarrationLink('https://www.youtube.com/embed/dQw4w9WgXcQ')?.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.deepEqual(parseNarrationLink('https://m.soundcloud.com/reciter/qasida-burda?si=abc'), { provider: 'soundcloud', url: 'https://soundcloud.com/reciter/qasida-burda' });
  assert.equal(parseNarrationLink('https://soundcloud.com/reciter/track/s-AbC123')?.url, 'https://soundcloud.com/reciter/track/s-AbC123');
  assert.equal(parseNarrationLink('https://soundcloud.com/reciter/track/comments/456')?.url, 'https://soundcloud.com/reciter/track');
  assert.equal(parseNarrationLink('https://soundcloud.com/reciter/sets/diwan-kamil')?.url, 'https://soundcloud.com/reciter/sets/diwan-kamil');
  assert.deepEqual(parseNarrationLink('https://vimeo.com/123456789'), { provider: 'vimeo', url: 'https://vimeo.com/123456789' });
  assert.equal(parseNarrationLink('https://vimeo.com/123456789/')?.url, 'https://vimeo.com/123456789');
  assert.deepEqual(parseNarrationLink('https://example.org/audio/%D9%82%D8%B5%D9%8A%D8%AF%D8%A9.mp3#x'), { provider: 'url', url: 'https://example.org/audio/%D9%82%D8%B5%D9%8A%D8%AF%D8%A9.mp3' });
  for (const bad of ['javascript:alert(1)', 'file:///C:/a.mp3', 'http://example.org/a.mp3', 'https://user:pw@youtu.be/dQw4w9WgXcQ', 'https://youtu.be/short', 'https://soundcloud.com/only-user', 'https://example.org/page', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'not a url'])
    assert.equal(parseNarrationLink(bad), null, bad);
  assert.equal(narrationEmbedUrl('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=65');
  assert.equal(narrationEmbedUrl('soundcloud', 'https://soundcloud.com/reciter/qasida'), 'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Freciter%2Fqasida&visual=false&show_comments=false');
  assert.equal(narrationEmbedUrl('vimeo', 'https://vimeo.com/123456789'), 'https://player.vimeo.com/video/123456789');
  assert.equal(narrationEmbedUrl('soundcloud', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(narrationEmbedUrl('local', 'https://vimeo.com/1'), null);
});

test('recordings are accepted only when bytes match the declared container', () => {
  assert.equal(recordingExtension(webm(), 'audio/webm;codecs=opus'), '.webm');
  assert.equal(recordingExtension(new TextEncoder().encode('OggS-------'), 'audio/ogg'), '.ogg');
  assert.equal(recordingExtension(new TextEncoder().encode('\0\0\0 ftypM4A '), 'audio/mp4'), '.m4a');
  assert.equal(recordingExtension(webm(), 'audio/ogg'), null);
  assert.equal(recordingExtension(new TextEncoder().encode('<html>----------'), 'audio/webm'), null);
});

test('poem narrations persist human recordings, local files and links in managed storage without touching library works', async () => {
  const database = createTestDatabase();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-narration-'));
  const directory = path.join(root, 'poetry-narrations');
  try {
    const service = new PoetryNarrationService(database, directory);
    const worksBefore = database.prepare('SELECT COUNT(*) AS n FROM work').get();
    const recording = await service.addRecording({ poemId: 7, label: 'بصوتي', mimeType: 'audio/webm;codecs=opus', durationSeconds: 12.34, data: webm().buffer });
    assert.equal(recording.kind, 'recording');
    assert.equal(recording.provider, 'local');
    assert.equal(recording.durationSeconds, 12.3);
    assert.match(recording.mediaUrl ?? '', /^baglib-asset:\/\/.+\.webm$/u);
    assert.equal(fs.readdirSync(directory).length, 1);

    const source = path.join(root, "إلقاء الشاعر's.mp3");
    fs.writeFileSync(source, Buffer.from('ID3 test audio'));
    const file = await service.addFile(7, source);
    assert.equal(file.label, "إلقاء الشاعر's");
    assert.equal(file.mimeType, 'audio/mpeg');
    assert.ok(fs.existsSync(source), 'original file is copied, never moved');

    const upperSource = path.join(root, "إلقاء_كبير.MP3");
    fs.writeFileSync(upperSource, Buffer.from('ID3 test uppercase audio'));
    const upperFile = await service.addFile(7, upperSource);
    assert.equal(upperFile.label, 'إلقاء_كبير', 'uppercase extension should be stripped from default label');
    assert.equal(upperFile.mimeType, 'audio/mpeg');
    await assert.rejects(service.addFile(7, path.join(root, 'notes.txt')), /unsupported-poetry-narration/u);

    const link = service.addLink({ poemId: 7, url: 'https://youtu.be/dQw4w9WgXcQ' });
    assert.equal(link.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(link.mediaUrl, null);
    assert.throws(() => service.addLink({ poemId: 7, url: 'https://example.org/page' }), /unsupported-poetry-narration/u);
    assert.throws(() => service.addLink({ poemId: 0, url: 'https://youtu.be/dQw4w9WgXcQ' }), /invalid-poetry-narration/u);
    assert.throws(() => service.addLink({ poemId: 7, url: 'https://youtu.be/dQw4w9WgXcQ', label: 'x'.repeat(201) }), /invalid-poetry-narration/u);
    await assert.rejects(service.addRecording({ poemId: 7, mimeType: 'audio/webm', durationSeconds: 0, data: webm().buffer }), /invalid-poetry-narration/u);
    await assert.rejects(service.addRecording({ poemId: 7, mimeType: 'audio/webm', durationSeconds: 3, data: new TextEncoder().encode('<script>alert(1)</script>').buffer }), /unsupported-poetry-narration/u);

    assert.equal(service.list(7).length, 4);
    assert.equal(service.list(8).length, 0);
    assert.equal(await service.delete(recording.id), true);
    assert.equal(await service.delete(recording.id), false);
    assert.equal(fs.readdirSync(directory).length, 2, 'deleting a recording removes its managed file');
    assert.equal(await service.delete(upperFile.id), true);
    assert.equal(fs.readdirSync(directory).length, 1, 'deleting upperFile removes its managed file');
    await assert.rejects(service.delete('../../etc/passwd'), /invalid-poetry-narration/u);
    assert.throws(() => database.prepare("INSERT INTO poetry_narration(id,poem_id,kind,provider,file_name,url,created_at) VALUES('x',1,'online','local',NULL,'https://a',datetime())").run(), /CHECK/u);
    assert.deepEqual(database.prepare('SELECT COUNT(*) AS n FROM work').get(), worksBefore);
  } finally { database.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
