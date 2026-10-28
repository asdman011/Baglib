/**
 * Baglib — Audiobook Service & SQLite Persistence Unit Tests (KEY-145)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { AudiobookService } from '../../src/main/services/audio/audiobook.service';
import { SqliteAudiobookRepository } from '../../src/main/database/repositories/audiobook.repository';
import type {
  SaveAudiobookPairingPayload,
  AudiobookPlaybackProgress,
} from '../../src/shared/types/audio';

describe('Audiobook Service & Repository (KEY-145)', () => {
  let db: Database.Database;
  let service: AudiobookService;
  let repo: SqliteAudiobookRepository;
  let tempAudioDir: string;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteAudiobookRepository(db);
    service = new AudiobookService(db);

    tempAudioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-audio-test-'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempAudioDir)) {
        fs.rmSync(tempAudioDir, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup error
    }
  });

  describe('Audiobook Pairing Persistence', () => {
    it('returns null when no pairing exists for book', () => {
      const pairing = service.getPairing('book_123');
      assert.strictEqual(pairing, null);
    });

    it('saves and retrieves audiobook pairing with deserialized JSON fields', () => {
      const payload: SaveAudiobookPairingPayload = {
        bookId: 'book_mukaddimah',
        title: 'مقدمة ابن خلدون الصوتي',
        narrator: 'الشيخ عبد الله',
        sourceType: 'local',
        audioFiles: [
          {
            id: 'track_1',
            name: '01 - المقدمة',
            path: '/audio/track1.mp3',
            duration: 1800,
            sizeBytes: 25000000,
          },
          {
            id: 'track_2',
            name: '02 - الفصل الأول',
            path: '/audio/track2.mp3',
            duration: 2400,
            sizeBytes: 32000000,
          },
        ],
        chapterMappings: [
          {
            ebookChapterId: 'ch_intro',
            audioChapterId: 'track_1',
            audioFilePath: '/audio/track1.mp3',
          },
          {
            ebookChapterId: 'ch_1',
            audioChapterId: 'track_2',
            audioFilePath: '/audio/track2.mp3',
          },
        ],
      };

      const saved = service.savePairing(payload);
      assert.strictEqual(saved.bookId, 'book_mukaddimah');
      assert.strictEqual(saved.title, 'مقدمة ابن خلدون الصوتي');
      assert.strictEqual(saved.narrator, 'الشيخ عبد الله');
      assert.strictEqual(saved.audioFiles.length, 2);
      assert.strictEqual(saved.chapterMappings.length, 2);

      const retrieved = service.getPairing('book_mukaddimah');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.bookId, 'book_mukaddimah');
      assert.strictEqual(retrieved.title, 'مقدمة ابن خلدون الصوتي');
      assert.strictEqual(retrieved.narrator, 'الشيخ عبد الله');
      assert.strictEqual(retrieved.sourceType, 'local');
      assert.strictEqual(retrieved.audioFiles.length, 2);
      assert.strictEqual(retrieved.audioFiles[0].name, '01 - المقدمة');
      assert.strictEqual(retrieved.chapterMappings.length, 2);
      assert.strictEqual(retrieved.chapterMappings[1].ebookChapterId, 'ch_1');
    });

    it('updates an existing pairing without duplicating', () => {
      service.savePairing({
        bookId: 'book_update_test',
        title: 'Initial Title',
        sourceType: 'local',
        audioFiles: [],
        chapterMappings: [],
      });

      const updated = service.savePairing({
        bookId: 'book_update_test',
        title: 'Updated Title',
        narrator: 'New Narrator',
        sourceType: 'audiobookshelf',
        serverUrl: 'http://abs.local:13378',
        audioFiles: [{ id: 'f1', name: 'File 1', path: 'http://abs/1', duration: 100 }],
        chapterMappings: [{ ebookChapterId: 'c1', audioChapterId: 'f1' }],
      });

      assert.strictEqual(updated.title, 'Updated Title');
      assert.strictEqual(updated.narrator, 'New Narrator');
      assert.strictEqual(updated.sourceType, 'audiobookshelf');

      const count = (db.prepare('SELECT count(*) as cnt FROM audiobook_pairing').get() as unknown).cnt;
      assert.strictEqual(count, 1);
    });

    it('deletes pairing and associated playback progress', () => {
      service.savePairing({
        bookId: 'book_del',
        title: 'To Delete',
        sourceType: 'local',
        audioFiles: [],
        chapterMappings: [],
      });

      service.saveProgress({
        bookId: 'book_del',
        currentFileId: 'f1',
        currentTimeSeconds: 120,
        playbackRate: 1.25,
        isCompleted: false,
        lastPlayedAt: new Date().toISOString(),
      });

      assert.ok(service.getPairing('book_del'));
      assert.ok(service.getProgress('book_del'));

      const deleted = service.deletePairing('book_del');
      assert.strictEqual(deleted, true);

      assert.strictEqual(service.getPairing('book_del'), null);
      assert.strictEqual(service.getProgress('book_del'), null);
    });
  });

  describe('Audiobook Playback Progress Persistence', () => {
    it('saves and retrieves playback progress position, rate, and completion', () => {
      const progress: AudiobookPlaybackProgress = {
        bookId: 'book_prog_1',
        currentFileId: 'track_3',
        currentTimeSeconds: 432.5,
        playbackRate: 1.5,
        isCompleted: false,
        lastPlayedAt: new Date().toISOString(),
      };

      service.saveProgress(progress);

      const retrieved = service.getProgress('book_prog_1');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.bookId, 'book_prog_1');
      assert.strictEqual(retrieved.currentFileId, 'track_3');
      assert.strictEqual(retrieved.currentTimeSeconds, 432.5);
      assert.strictEqual(retrieved.playbackRate, 1.5);
      assert.strictEqual(retrieved.isCompleted, false);

      // Update to completed
      service.saveProgress({
        ...progress,
        isCompleted: true,
      });

      const updated = service.getProgress('book_prog_1');
      assert.strictEqual(updated?.isCompleted, true);
    });
  });

  describe('Local Audio Directory Scanning', () => {
    it('returns empty array for non-existent directory', () => {
      const result = service.scanLocalAudioDirectory('/invalid/path/does/not/exist');
      assert.deepStrictEqual(result, []);
    });

    it('scans and naturally sorts local audio tracks', () => {
      // Create mock audio files with numerical ordering
      fs.writeFileSync(path.join(tempAudioDir, 'Chapter 10.mp3'), 'audio-data');
      fs.writeFileSync(path.join(tempAudioDir, 'Chapter 2.m4b'), 'audio-data');
      fs.writeFileSync(path.join(tempAudioDir, 'Chapter 1.mp3'), 'audio-data');
      fs.writeFileSync(path.join(tempAudioDir, 'Cover.jpg'), 'image-data'); // Should be ignored
      fs.writeFileSync(path.join(tempAudioDir, 'Notes.txt'), 'text-data'); // Should be ignored

      const scanned = service.scanLocalAudioDirectory(tempAudioDir);

      assert.strictEqual(scanned.length, 3);
      // Natural sort: Chapter 1, Chapter 2, Chapter 10
      assert.strictEqual(scanned[0].name, 'Chapter 1');
      assert.strictEqual(scanned[1].name, 'Chapter 2');
      assert.strictEqual(scanned[2].name, 'Chapter 10');
      assert.ok(scanned[0].sizeBytes && scanned[0].sizeBytes > 0);
    });
  });

  describe('EPUB SMIL Media Overlay Parsing', () => {
    it('delegates SMIL parsing and returns wrapped SmilMediaOverlay structure', () => {
      const smilXml = `
        <smil xmlns="http://www.w3.org/ns/SMIL" version="3.0">
          <body>
            <par>
              <text src="sec1.xhtml#t1" />
              <audio src="sec1.mp3" clipBegin="0s" clipEnd="10s" />
            </par>
          </body>
        </smil>
      `;

      const overlay = service.parseSmil(smilXml, 'overlays/sec1.smil');
      assert.strictEqual(overlay.smilHref, 'overlays/sec1.smil');
      assert.strictEqual(overlay.pars.length, 1);
      assert.strictEqual(overlay.pars[0].textId, 't1');
      assert.strictEqual(overlay.pars[0].clipBegin, 0);
      assert.strictEqual(overlay.pars[0].clipEnd, 10);
    });
  });
});
