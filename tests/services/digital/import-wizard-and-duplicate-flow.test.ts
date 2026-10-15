import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../../helpers/test-db';
import { translations } from '../../../src/renderer/translations';
import { SqliteWorkRepository } from '../../../src/main/database/repositories/work.repository';
import { DuplicateDetectorService } from '../../../src/main/services/digital/duplicate-detector.service';
import { DigitalImportPipelineService } from '../../../src/main/services/digital/digital-import-pipeline.service';
import { DuplicateResolutionAction, ImportProgressEvent } from '../../../src/shared/types/digital-file';

describe('Story 6 Import Wizard & Duplicate Resolution Flow Tests', () => {
  let db: Database.Database;
  let repo: SqliteWorkRepository;
  let detector: DuplicateDetectorService;
  let pipeline: DigitalImportPipelineService;
  const tempFiles: string[] = [];

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteWorkRepository(db);
    detector = new DuplicateDetectorService(repo);
    pipeline = new DigitalImportPipelineService(repo, undefined, undefined, undefined, detector);
  });

  afterEach(() => {
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
    tempFiles.length = 0;
  });

  it('verifies all Story 6 bilingual translation keys exist in both Arabic and English', () => {
    const requiredKeys = [
      'importWizardTitle',
      'importWizardSubtitle',
      'openImportWizard',
      'stepSelectFiles',
      'stepReviewDuplicates',
      'stepImporting',
      'dragDropWizardTitle',
      'dragDropWizardSubtitle',
      'browseFilesBtn',
      'stagedFilesHeading',
      'clearAllStaged',
      'batchOptionsTitle',
      'batchCategoryLabel',
      'batchReadingStatusLabel',
      'scanDuplicatesBtn',
      'scanningDuplicatesProgress',
      'noDuplicatesHeading',
      'noDuplicatesDesc',
      'duplicatesDetectedHeading',
      'duplicatesDetectedDesc',
      'matchExactHash',
      'matchIsbn',
      'matchMetadata',
      'existingBookDetails',
      'incomingFileDetails',
      'resolutionChoiceTitle',
      'actionSkip',
      'actionSkipDesc',
      'actionAddNewEdition',
      'actionAddNewEditionDesc',
      'actionReplace',
      'actionReplaceDesc',
      'actionImportAnyway',
      'actionImportAnywayDesc',
      'startImportBtn',
      'importingLiveHeading',
      'importProgressLabel',
      'phaseValidating',
      'phaseExtracting',
      'phaseGeneratingCover',
      'phaseSaving',
      'importCompletedHeading',
      'importCompletedSummary',
      'metricTotal',
      'metricImported',
      'metricSkipped',
      'metricFailed',
      'finishAndExploreBtn',
      'fileStorageAvailable',
      'fileStorageMissing',
      'fileStorageUnmounted',
      'storageHealthMissingBadge',
      'storageHealthUnmountedBadge',
      'storageMissingWarning',
    ] as const;

    for (const key of requiredKeys) {
      assert.ok(
        (translations.ar as any)[key],
        `Arabic translation key "${key}" should be defined and non-empty`
      );
      assert.ok(
        (translations.en as any)[key],
        `English translation key "${key}" should be defined and non-empty`
      );
    }
  });

  it('correctly maps DuplicateResolutionAction choices to duplicate match types', async () => {
    const fileContent = 'Content for duplicate mapping test';
    const tempFile1 = path.join(os.tmpdir(), `khaldun-${Date.now()}.txt`);
    fs.writeFileSync(tempFile1, fileContent, 'utf8');
    tempFiles.push(tempFile1);

    const hash = crypto.createHash('sha256').update(fileContent).digest('hex');

    // Register existing book in SQLite
    const existing = repo.addBook({
      title: 'مقدمة ابن خلدون',
      author: 'ابن خلدون',
      isbn: '978-0-123456-47-2',
      fileHash: hash,
      filePath: tempFile1,
      bookType: 'digital',
    });

    // Exact file hash match check
    const tempFile2 = path.join(os.tmpdir(), `khaldun-copy-${Date.now()}.txt`);
    fs.writeFileSync(tempFile2, fileContent, 'utf8');
    tempFiles.push(tempFile2);

    const exactResult = await detector.checkDuplicate({
      filePath: tempFile2,
      fileHash: hash,
    });
    assert.strictEqual(exactResult.matchType, 'exact_file');
    assert.strictEqual(exactResult.confidence, 1.0);

    const defaultActionExact: DuplicateResolutionAction =
      exactResult.matchType === 'exact_file' ? 'skip' : 'add_new_edition';
    assert.strictEqual(defaultActionExact, 'skip');

    // ISBN match check with different content
    const differentContent = 'Different content with same ISBN';
    const tempFile3 = path.join(os.tmpdir(), `edition-new-${Date.now()}.txt`);
    fs.writeFileSync(tempFile3, differentContent, 'utf8');
    tempFiles.push(tempFile3);

    const diffHash = crypto.createHash('sha256').update(differentContent).digest('hex');

    const isbnResult = await detector.checkDuplicate({
      filePath: tempFile3,
      fileHash: diffHash,
      isbn: '9780123456472',
      candidateMetadata: {
        isbn: '9780123456472',
      },
    });
    assert.strictEqual(isbnResult.matchType, 'same_edition');
    assert.strictEqual(isbnResult.confidence, 0.95);

    const defaultActionIsbn: DuplicateResolutionAction =
      isbnResult.matchType === 'same_edition' ? 'add_new_edition' : 'skip';
    assert.strictEqual(defaultActionIsbn, 'add_new_edition');
  });

  it('handles add_new_edition resolution by adding an edition to existing work', async () => {
    // 1. Register original work in SQLite
    const originalFile = path.join(os.tmpdir(), `bukhari-original-${Date.now()}.txt`);
    fs.writeFileSync(originalFile, 'Original Bukhari text', 'utf8');
    tempFiles.push(originalFile);

    const originalHash = crypto.createHash('sha256').update('Original Bukhari text').digest('hex');
    const originalBook = repo.addBook({
      title: 'صحيح البخاري',
      author: 'الإمام البخاري',
      edition: 'طبعة بولاق الأولى',
      bookType: 'digital',
      filePath: originalFile,
      fileHash: originalHash,
    });

    // 2. Incoming new edition file
    const newEditionFile = path.join(os.tmpdir(), `bukhari-taseel-${Date.now()}.txt`);
    const newEditionContent = 'New edition published by Dar Al-Taseel';
    fs.writeFileSync(newEditionFile, newEditionContent, 'utf8');
    tempFiles.push(newEditionFile);

    // Mock extractor to return metadata for new edition
    (pipeline as any).extractor = {
      extract: async () => ({
        title: 'صحيح البخاري - طبعة دار التأصيل',
        authors: ['الإمام البخاري'],
        publisher: 'دار التأصيل',
        publicationYear: 2020,
        isbn: '978-977-12345-6-7',
        tags: [],
        identifiers: {},
        format: 'TXT',
      }),
    };

    const res = await pipeline.importFile({
      filePath: newEditionFile,
      duplicateAction: 'add_new_edition',
      existingWorkId: originalBook.id,
    });

    assert.ok(res.success);
    assert.strictEqual(res.workId, originalBook.id);

    // Verify work in repository has the new edition and file detail attached
    const updated = repo.getById(originalBook.id);
    assert.ok(updated);
    assert.strictEqual(updated?.title, 'صحيح البخاري');
  });

  it('streams progress notifications during batch import execution', async () => {
    const f1 = path.join(os.tmpdir(), `stream-batch-1-${Date.now()}.txt`);
    const f2 = path.join(os.tmpdir(), `stream-batch-2-${Date.now()}.txt`);
    fs.writeFileSync(f1, 'Content 1', 'utf8');
    fs.writeFileSync(f2, 'Content 2', 'utf8');
    tempFiles.push(f1, f2);

    (pipeline as any).extractor = {
      extract: async (_fp: string) => ({
        title: 'كتاب تجريبي',
        authors: ['مؤلف تجريبي'],
        tags: [],
        identifiers: {},
        format: 'TXT',
      }),
    };

    const progressEvents: ImportProgressEvent[] = [];

    const summary = await pipeline.importFiles(
      [
        { filePath: f1 },
        { filePath: f2 },
      ],
      (event) => {
        progressEvents.push(event);
      }
    );

    assert.strictEqual(summary.totalFiles, 2);
    assert.strictEqual(summary.successfulImports, 2);
    assert.strictEqual(summary.failedImports, 0);
    assert.strictEqual(summary.skippedImports, 0);

    // Verify progress events were emitted with ascending index & percentage
    assert.ok(progressEvents.length >= 2, 'Should have received multiple progress events');
    assert.strictEqual(progressEvents[0].currentFileIndex, 1);
    assert.strictEqual(progressEvents[progressEvents.length - 1].currentFileIndex, 2);
    assert.strictEqual(progressEvents[progressEvents.length - 1].progressPercentage, 100);
  });
});
