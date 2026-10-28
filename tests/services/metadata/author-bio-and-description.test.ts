import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuthorBioService, authorBioService } from '../../../src/main/services/metadata/author-bio.service';
import { BibliographicMetadataService } from '../../../src/main/services/metadata/bibliographic-metadata.service';
import { MetadataProvider } from '../../../src/main/services/metadata/providers/provider.interface';
import { SqliteWorkRepository } from '../../../src/main/database/repositories/work.repository';
import { createTestDatabase } from '../../helpers/test-db';

describe('Author Bio & Book Description Enrichment', () => {
  describe('AuthorBioService Unit Tests', () => {
    it('returns undefined when author name is empty or undefined', async () => {
      const bioService = new AuthorBioService();
      const bio1 = await bioService.resolveAuthorBio('');
      const bio2 = await bioService.resolveAuthorBio(undefined as unknown);
      assert.strictEqual(bio1, undefined);
      assert.strictEqual(bio2, undefined);
    });

    it('caches author bio in memory for subsequent calls', async () => {
      const bioService = new AuthorBioService();
      // Prime cache directly
      (bioService as unknown).cache.set('نجيب محفوظ_auto', 'نجيب محفوظ أديب مصري حائز على جائزة نوبل في الأدب.');
      
      const res = await bioService.resolveAuthorBio('نجيب محفوظ');
      assert.strictEqual(res, 'نجيب محفوظ أديب مصري حائز على جائزة نوبل في الأدب.');
    });
  });

  describe('BibliographicMetadataService Description and Author Bio Enrichment', () => {
    it('enriches discovered work and candidates with description and authorBio', async () => {
      const mockProvider: MetadataProvider = {
        name: 'MockProvider',
        search: async () => [
          {
            workId: 'work-123',
            title: 'اللص والكلاب',
            authors: ['نجيب محفوظ'],
            description: 'رواية مستوحاة من قصة حقيقية لسفاح الإسكندرية محمود أمين سليمان.',
            editions: [
              {
                editionId: 'ed-1',
                title: 'اللص والكلاب',
                isbn13: '9789770900000',
                description: 'رواية مستوحاة من قصة حقيقية لسفاح الإسكندرية محمود أمين سليمان.',
                sources: [
                  {
                    provider: 'MockProvider',
                    providerId: 'mock-1',
                    url: 'https://example.com/book',
                  },
                ],
              },
            ],
          },
        ],
        getWorkDetails: async () => null,
        searchByIsbn: async () => null,
      };

      (authorBioService as unknown).cache.set('نجيب محفوظ_auto', 'نجيب محفوظ روائي وكاتب مصري عالمي.');
      (authorBioService as unknown).cache.set('نجيب محفوظ_العربية', 'نجيب محفوظ روائي وكاتب مصري عالمي.');

      const bibService = new BibliographicMetadataService([mockProvider]);
      const res = await bibService.discoverBook({ title: 'اللص والكلاب', author: 'نجيب محفوظ' });

      assert.ok(res.matchedWork, 'Expected matchedWork to be resolved');
      assert.strictEqual(res.matchedWork?.title, 'اللص والكلاب');
      assert.strictEqual(
        res.matchedWork?.description,
        'رواية مستوحاة من قصة حقيقية لسفاح الإسكندرية محمود أمين سليمان.'
      );
      assert.strictEqual(res.matchedWork?.authorBio, 'نجيب محفوظ روائي وكاتب مصري عالمي.');
      assert.strictEqual(res.authorBio, 'نجيب محفوظ روائي وكاتب مصري عالمي.');
    });
  });

  describe('SqliteWorkRepository Description & Author Bio Persistence', () => {
    it('persists and retrieves description and authorBio for a book', () => {
      const db = createTestDatabase();
      const repo = new SqliteWorkRepository(db);

      const book = repo.addBook({
        title: 'عبقرية عمر',
        author: 'عباس محمود العقاد',
        authorBio: 'عباس محمود العقاد كاتب ومفكر وشاعر مصري.',
        description: 'دراسة تحليلية نفسية وتاريخية لشخصية الخليفة عمر بن الخطاب.',
        language: 'العربية',
        bookType: 'physical',
      });

      assert.ok(book.id, 'Expected generated ID');
      const retrieved = repo.getById(book.id);
      assert.ok(retrieved, 'Expected retrieved book');
      assert.strictEqual(retrieved?.title, 'عبقرية عمر');
      assert.strictEqual(retrieved?.author, 'عباس محمود العقاد');
      assert.strictEqual(retrieved?.description, 'دراسة تحليلية نفسية وتاريخية لشخصية الخليفة عمر بن الخطاب.');
      assert.strictEqual(retrieved?.authorBio, 'عباس محمود العقاد كاتب ومفكر وشاعر مصري.');

      // Test updating author bio and description
      const updated = repo.updateBook({
        id: book.id,
        description: 'وصف محدث لكتاب عبقرية عمر.',
        authorBio: 'عباس محمود العقاد أديب ومؤرخ وعضو مجمع اللغة العربية.',
      });

      assert.strictEqual(updated.description, 'وصف محدث لكتاب عبقرية عمر.');
      assert.strictEqual(updated.authorBio, 'عباس محمود العقاد أديب ومؤرخ وعضو مجمع اللغة العربية.');

      const retrievedAfterUpdate = repo.getById(book.id);
      assert.strictEqual(retrievedAfterUpdate?.description, 'وصف محدث لكتاب عبقرية عمر.');
      assert.strictEqual(retrievedAfterUpdate?.authorBio, 'عباس محمود العقاد أديب ومؤرخ وعضو مجمع اللغة العربية.');
    });
  });
});
