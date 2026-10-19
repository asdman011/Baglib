import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { QuotaTracker, QuotaWarningPayload } from '../../../src/main/services/metadata/quotaTracker';
import { GoogleBooksProvider } from '../../../src/main/services/metadata/providers/google-books.provider';
import { BibliographicMetadataService } from '../../../src/main/services/metadata/bibliographic-metadata.service';
import { MetadataProvider } from '../../../src/main/services/metadata/providers/provider.interface';
import { BibliographicWork } from '../../../src/shared/types/bibliographic';
import { DigitalImportPipelineService } from '../../../src/main/services/digital/digital-import-pipeline.service';

describe('Google Books Local Daily Quota Tracker & Quota-Saver Mode', () => {
  let inMemoryDb: Database.Database;
  let tracker: QuotaTracker;

  beforeEach(() => {
    inMemoryDb = new Database(':memory:');
    tracker = new QuotaTracker(inMemoryDb);
  });

  describe('1. SQLite Daily Usage Tracker & Persistence', () => {
    it('initializes today count to 0 and persists incremented counts', () => {
      assert.strictEqual(tracker.getCurrentCount(), 0);
      assert.strictEqual(tracker.isConservationMode(), false);
      assert.strictEqual(tracker.isDepleted(), false);

      const count1 = tracker.recordRequest();
      assert.strictEqual(count1, 1);
      assert.strictEqual(tracker.getCurrentCount(), 1);

      const count2 = tracker.recordRequest();
      assert.strictEqual(count2, 2);
      assert.strictEqual(tracker.getCurrentCount(), 2);

      // Verify row exists in SQLite table
      const today = tracker.getTodayDate();
      const row = inMemoryDb.prepare('SELECT request_count FROM api_quota_logs WHERE date = ?').get(today) as { request_count: number };
      assert.strictEqual(row.request_count, 2);
    });

    it('crosses 75% threshold (750 requests) into Conservation Mode and dispatches warning event', () => {
      tracker.setCountForTesting(749);
      assert.strictEqual(tracker.getCurrentCount(), 749);
      assert.strictEqual(tracker.isConservationMode(), false);

      let dispatchedPayload: QuotaWarningPayload | null = null;
      tracker.onWarning((payload) => {
        dispatchedPayload = payload;
      });

      // Trigger 750th request
      const newCount = tracker.recordRequest();
      assert.strictEqual(newCount, 750);
      assert.strictEqual(tracker.isConservationMode(), true);
      assert.strictEqual(tracker.isDepleted(), false);

      // Check warning event payload
      assert.ok(dispatchedPayload, 'Warning event must be dispatched');
      assert.strictEqual((dispatchedPayload as QuotaWarningPayload).level, 'warning');
      assert.strictEqual((dispatchedPayload as QuotaWarningPayload).remainingPercentage, 25);
      assert.ok((dispatchedPayload as QuotaWarningPayload).resetsAt);

      // Verify non-technical user copy in English and Arabic
      assert.strictEqual(
        (dispatchedPayload as QuotaWarningPayload).messageEn,
        'Daily search limit is running low. Lookups may take a brief moment longer as Baglib spaces out requests and checks secondary catalogs. Full speed will refresh tomorrow.'
      );
      assert.strictEqual(
        (dispatchedPayload as QuotaWarningPayload).messageAr,
        'قارب الحد اليومي للبحث السريع عن الكتب على الانتهاء. قد يستغرق البحث لحظات إضافية لتنظيم الاستخدام والاعتماد على فهارس بديلة، وسيتجدد الحد بالكامل غدًا.'
      );
    });

    it('crosses 100% threshold (1,000 requests) into Depleted Mode and dispatches depleted event', () => {
      tracker.setCountForTesting(999);
      assert.strictEqual(tracker.getCurrentCount(), 999);

      let dispatchedPayload: QuotaWarningPayload | null = null;
      tracker.onWarning((payload) => {
        dispatchedPayload = payload;
      });

      // Trigger 1000th request
      const newCount = tracker.recordRequest();
      assert.strictEqual(newCount, 1000);
      assert.strictEqual(tracker.isConservationMode(), true);
      assert.strictEqual(tracker.isDepleted(), true);
      assert.strictEqual(tracker.canRequest(), false);

      assert.ok(dispatchedPayload);
      assert.strictEqual((dispatchedPayload as QuotaWarningPayload).level, 'depleted');
      assert.strictEqual((dispatchedPayload as QuotaWarningPayload).remainingPercentage, 0);

      // Verify depleted copy in English and Arabic
      assert.strictEqual(
        (dispatchedPayload as QuotaWarningPayload).messageEn,
        "Daily search limit reached. We'll use alternative book sources until tomorrow."
      );
      assert.strictEqual(
        (dispatchedPayload as QuotaWarningPayload).messageAr,
        'اكتمل الحد اليومي للبحث لهذا اليوم. سنعتمد على مصادر الكتب البديلة حتى يوم غد.'
      );
    });

    it('does not send duplicate warnings on subsequent requests in the same day', () => {
      tracker.setCountForTesting(749);
      let warningCount = 0;
      tracker.onWarning(() => {
        warningCount++;
      });

      tracker.recordRequest(); // 750 -> fires warning
      tracker.recordRequest(); // 751 -> should not fire duplicate
      tracker.recordRequest(); // 752 -> should not fire duplicate

      assert.strictEqual(warningCount, 1, 'Warning must only be emitted once per day on initial threshold crossing');
    });
  });

  describe('2. Date Rollover Simulation & Automatic Reset', () => {
    it('automatically resets counter to 0 on next day and returns to Normal Mode', () => {
      // Set yesterday's date to 850 (Conservation Mode)
      const yesterday = '2026-10-11';
      tracker.setCountForTesting(850, yesterday);

      // Verify yesterday's row in DB
      const row = inMemoryDb.prepare('SELECT request_count FROM api_quota_logs WHERE date = ?').get(yesterday) as { request_count: number };
      assert.strictEqual(row.request_count, 850);

      // Current today date in tracker should start at 0
      assert.strictEqual(tracker.getCurrentCount(), 0);
      assert.strictEqual(tracker.isConservationMode(), false);
      assert.strictEqual(tracker.isDepleted(), false);
      assert.strictEqual(tracker.getPacingDelayMs(), 0);
    });
  });

  describe('3. Pacing Delays & Retry Backoff Behaviors', () => {
    it('applies 0ms delay in Normal Mode (< 750)', () => {
      tracker.setCountForTesting(200);
      assert.strictEqual(tracker.getPacingDelayMs(), 0);
      assert.strictEqual(tracker.getRetryBackoffMs(), 0);
    });

    it('configures 2,500ms pacing delay and 3,000ms retry backoff in Conservation Mode (>= 750)', () => {
      tracker.setCountForTesting(750);
      assert.strictEqual(tracker.getPacingDelayMs(), 2500);
      assert.strictEqual(tracker.getRetryBackoffMs(), 3000);
    });

    it('GoogleBooksProvider enforces hard stop at 1,000 requests without making network calls', async () => {
      tracker.setCountForTesting(1000);
      const provider = new GoogleBooksProvider(tracker);

      const searchResults = await provider.search('Any Book Title');
      assert.deepStrictEqual(searchResults, []);

      const isbnResult = await provider.searchByIsbn('9780132350884');
      assert.strictEqual(isbnResult, null);

      const detailsResult = await provider.getWorkDetails('gb-test');
      assert.strictEqual(detailsResult, null);

      // Request count must NOT increment because calls were blocked
      assert.strictEqual(tracker.getCurrentCount(), 1000);
    });
  });

  describe('4. Invert Provider Priority (Open Library First)', () => {
    const sampleWorkOL: BibliographicWork = {
      workId: 'ol-101',
      title: 'Clean Code (Open Library Candidate)',
      authors: ['Robert C. Martin'],
      editions: [
        {
          editionId: 'ol-ed-101',
          title: 'Clean Code',
          sources: [{ provider: 'Open Library', providerId: 'ol-101' }],
        },
      ],
    };

    const sampleWorkGB: BibliographicWork = {
      workId: 'gb-202',
      title: 'Clean Code (Google Books Candidate)',
      authors: ['Robert C. Martin'],
      editions: [
        {
          editionId: 'gb-ed-202',
          title: 'Clean Code',
          sources: [{ provider: 'Google Books', providerId: 'gb-202' }],
        },
      ],
    };

    class MockOLProvider implements MetadataProvider {
      public callCount = 0;
      constructor(private hasResults: boolean = true) {}
      get name() {
        return 'Open Library';
      }
      async search(): Promise<BibliographicWork[]> {
        this.callCount++;
        return this.hasResults ? [sampleWorkOL] : [];
      }
      async searchByIsbn(): Promise<BibliographicWork | null> {
        this.callCount++;
        return this.hasResults ? sampleWorkOL : null;
      }
      async getWorkDetails(): Promise<BibliographicWork | null> {
        return this.hasResults ? sampleWorkOL : null;
      }
    }

    class MockGBProvider implements MetadataProvider {
      public callCount = 0;
      get name() {
        return 'Google Books';
      }
      async search(): Promise<BibliographicWork[]> {
        this.callCount++;
        return [sampleWorkGB];
      }
      async searchByIsbn(): Promise<BibliographicWork | null> {
        this.callCount++;
        return sampleWorkGB;
      }
      async getWorkDetails(): Promise<BibliographicWork | null> {
        return sampleWorkGB;
      }
    }

    it('in Normal Mode (< 750), queries Open Library and ignores disabled Google Books', async () => {
      tracker.setCountForTesting(100);
      const mockOL = new MockOLProvider(true);
      const mockGB = new MockGBProvider();
      const service = new BibliographicMetadataService([mockOL, mockGB], tracker);

      const result = await service.discoverBook({ title: 'Clean Code' });
      assert.strictEqual(mockOL.callCount >= 1, true, 'OL should be called');
      assert.strictEqual(mockGB.callCount, 0, 'GB should never be called as it is disabled');
      assert.strictEqual(result.candidates.length, 1, 'Only OL candidate returned');
    });

    it('in Quota-Saver Mode (>= 750), ignores Google Books as it is disabled', async () => {
      tracker.setCountForTesting(750);
      assert.strictEqual(tracker.isConservationMode(), true);

      const mockOL = new MockOLProvider(true);
      const mockGB = new MockGBProvider();
      const service = new BibliographicMetadataService([mockOL, mockGB], tracker);

      const result = await service.discoverBook({ title: 'Clean Code' });
      assert.strictEqual(mockOL.callCount >= 1, true, 'Open Library should be queried');
      assert.strictEqual(mockGB.callCount, 0, 'Google Books is completely disabled');
      assert.strictEqual(result.candidates.length, 1, 'Only OL candidate returned');
    });

    it('in Depleted Mode (>= 1,000), skips Google Books completely even if Open Library returns 0 matches', async () => {
      tracker.setCountForTesting(1000);
      assert.strictEqual(tracker.isDepleted(), true);

      const mockOL = new MockOLProvider(false);
      const mockGB = new MockGBProvider();
      const service = new BibliographicMetadataService([mockOL, mockGB], tracker);

      const result = await service.discoverBook({ title: 'Clean Code' });
      assert.strictEqual(mockOL.callCount >= 1, true);
      assert.strictEqual(mockGB.callCount, 0, 'Google Books must never be called in Depleted Mode');
      assert.strictEqual(result.candidates.length, 0);
    });
  });

  describe('5. Bulk Import Behavior in Quota-Saver Mode', () => {
    it('marks batch import as bulkAutoFillSuppressed: true when Quota-Saver Mode is active', async () => {
      tracker.setCountForTesting(750);
      assert.strictEqual(tracker.isConservationMode(), true);

      // Create a test instance with mock repo and validator
      const mockRepo: any = {
        addBook: (input: any) => ({ id: `book-${Date.now()}`, ...input }),
      };
      const mockValidator: any = {
        validateFile: async (filePath: string) => ({
          isValid: true,
          fileName: 'book.epub',
          extension: '.epub',
          fileSizeBytes: 1024,
          format: 'EPUB',
        }),
      };
      const mockExtractor: any = {
        extract: async () => ({
          title: 'Extracted Local Title',
          authors: ['Local Author'],
          tags: ['#epub'],
          identifiers: {},
          format: 'EPUB',
        }),
      };

      const pipeline = new DigitalImportPipelineService(mockRepo, mockValidator, mockExtractor, tracker);

      // Batch of 2 files
      const summary = await pipeline.importFiles([
        { filePath: 'D:/test/book1.epub' },
        { filePath: 'D:/test/book2.epub' },
      ]);

      assert.strictEqual(summary.totalFiles, 2);
      assert.strictEqual(summary.bulkAutoFillSuppressed, true, 'Bulk Google Books queries must be suppressed in Quota-Saver mode');
    });

    it('allows single-file import without bulkAutoFillSuppressed flag', async () => {
      tracker.setCountForTesting(750);

      const mockRepo: any = {
        addBook: (input: any) => ({ id: `book-${Date.now()}`, ...input }),
      };
      const mockValidator: any = {
        validateFile: async (filePath: string) => ({
          isValid: true,
          fileName: 'book.epub',
          extension: '.epub',
          fileSizeBytes: 1024,
          format: 'EPUB',
        }),
      };
      const mockExtractor: any = {
        extract: async () => ({
          title: 'Extracted Local Title',
          authors: ['Local Author'],
          tags: ['#epub'],
          identifiers: {},
          format: 'EPUB',
        }),
      };

      const pipeline = new DigitalImportPipelineService(mockRepo, mockValidator, mockExtractor, tracker);

      // Single file import
      const summary = await pipeline.importFiles([
        { filePath: 'D:/test/book1.epub' },
      ]);

      assert.strictEqual(summary.totalFiles, 1);
      assert.strictEqual(summary.bulkAutoFillSuppressed, false);
    });
  });
});
