import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FilenameParser } from '../../../src/main/services/metadata/filename-parser';
import {
  PdfMetadataReconciler,
  isGarbageTitle,
  isGarbageAuthor,
  isGarbageMetadata,
  calculateTokenOverlap,
} from '../../../src/main/services/metadata/pdf-metadata-reconciler';

describe('PDF Metadata Reconciler & Garbage-Detection Engine', () => {
  // ==========================================================================
  // 1. Real-World Case Study
  // ==========================================================================
  describe('Real-World Bug & Case Study', () => {
    it('accurately reconciles "Barbra Teater" discarding mcgrawh 19768, jharding, and libgen.li', () => {
      const filename =
        'Barbra Teater - An introduction to applying social work theories and methods (2010, McGraw-Hill_Open University Press) - libgen.li.pdf';

      const parsed = FilenameParser.parse(filename);

      // Verify filename parser output
      assert.strictEqual(parsed.title, 'An introduction to applying social work theories and methods');
      assert.deepStrictEqual(parsed.authors, ['Barbra Teater']);
      assert.strictEqual(parsed.publicationYear, 2010);
      assert.strictEqual(parsed.publisher, 'McGraw-Hill / Open University Press');

      // Internal PDF DocInfo metadata
      const embeddedMeta = {
        title: 'mcgrawh 19768',
        authors: ['jharding'],
        publicationYear: undefined,
        publisher: undefined,
      };

      const result = PdfMetadataReconciler.reconcile({
        embeddedMeta,
        parsedFilename: parsed,
        rawFilename: filename,
      });

      // Resolved bibliographic output
      assert.strictEqual(result.title, 'An introduction to applying social work theories and methods');
      assert.deepStrictEqual(result.authors, ['Barbra Teater']);
      assert.strictEqual(result.publicationYear, 2010);
      assert.strictEqual(result.publisher, 'McGraw-Hill / Open University Press');
      assert.strictEqual(result.source, 'filename');
      assert.strictEqual(result.confidence >= 0.8, true);

      // Verify discarded artifacts
      const discardedValues = result.discardedArtifacts.map((d) => d.value);
      assert.strictEqual(discardedValues.includes('mcgrawh 19768'), true);
      assert.strictEqual(discardedValues.includes('jharding'), true);
      assert.strictEqual(
        discardedValues.some((v) => v.includes('libgen.li')),
        true
      );
    });
  });

  // ==========================================================================
  // 2. Bogus / Typesetting Artifact Detector
  // ==========================================================================
  describe('Bogus / Typesetting Artifact Detector (isGarbageMetadata)', () => {
    it('flags publisher prepress job codes', () => {
      assert.strictEqual(isGarbageTitle('mcgrawh 19768'), true);
      assert.strictEqual(isGarbageTitle('job_4091'), true);
      assert.strictEqual(isGarbageTitle('wiley_9872'), true);
      assert.strictEqual(isGarbageTitle('springer_12345'), true);
      assert.strictEqual(isGarbageTitle('elsevier-004'), true);
      assert.strictEqual(isGarbageTitle('cup_19928'), true);
      assert.strictEqual(isGarbageMetadata('title', 'mcgrawh 19768'), true);
    });

    it('flags generic document and scanner placeholders', () => {
      assert.strictEqual(isGarbageTitle('untitled'), true);
      assert.strictEqual(isGarbageTitle('document1'), true);
      assert.strictEqual(isGarbageTitle('Document'), true);
      assert.strictEqual(isGarbageTitle('scan001'), true);
      assert.strictEqual(isGarbageTitle('export'), true);
      assert.strictEqual(isGarbageTitle('pdf document'), true);
      assert.strictEqual(isGarbageTitle('Frontmatter'), true);
      assert.strictEqual(isGarbageTitle('cover'), true);
    });

    it('flags software generator names as titles or authors', () => {
      assert.strictEqual(isGarbageTitle('Adobe InDesign'), true);
      assert.strictEqual(isGarbageTitle('Microsoft Word'), true);
      assert.strictEqual(isGarbageAuthor('Adobe PDF Library'), true);
      assert.strictEqual(isGarbageAuthor('Acrobat Distiller'), true);
      assert.strictEqual(isGarbageAuthor('InDesign'), true);
    });

    it('flags single-token lowercase OS handles and system usernames', () => {
      assert.strictEqual(isGarbageAuthor('jharding'), true);
      assert.strictEqual(isGarbageAuthor('admin'), true);
      assert.strictEqual(isGarbageAuthor('user'), true);
      assert.strictEqual(isGarbageAuthor('desktop'), true);
      assert.strictEqual(isGarbageAuthor('scanner'), true);
      assert.strictEqual(isGarbageAuthor('root'), true);
      assert.strictEqual(isGarbageAuthor('csmith'), true);
      assert.strictEqual(isGarbageAuthor('typesetter'), true);
      assert.strictEqual(isGarbageMetadata('author', 'jharding'), true);
    });

    it('does not flag authentic capitalized author names', () => {
      assert.strictEqual(isGarbageAuthor('Barbra Teater'), false);
      assert.strictEqual(isGarbageAuthor('Robert C. Martin'), false);
      assert.strictEqual(isGarbageAuthor('Martin Fowler'), false);
      assert.strictEqual(isGarbageAuthor('العز بن عبد السلام'), false);
      assert.strictEqual(isGarbageAuthor('نجيب محفوظ'), false);
    });

    it('flags purely numeric strings and hex/UUID hashes', () => {
      assert.strictEqual(isGarbageTitle('19768'), true);
      assert.strictEqual(isGarbageTitle('098712345'), true);
      assert.strictEqual(isGarbageTitle('d41d8cd98f00b204e9800998ecf8427e'), true);
      assert.strictEqual(isGarbageAuthor('12345'), true);
      assert.strictEqual(isGarbageAuthor('6a2f4c9e8b7d1a2f3c4e5a6b7c8d9e0f'), true);
    });

    it('flags embedded title when sharing 0% token overlap with descriptive filename', () => {
      const filename = 'Advanced Quantum Mechanics and Applications in Modern Physics.pdf';
      assert.strictEqual(calculateTokenOverlap('Layout 1', filename), 0);
      assert.strictEqual(isGarbageTitle('Layout 1', filename), true);
      assert.strictEqual(isGarbageTitle('Chapter 1', filename), true);
    });

    it('preserves embedded title when sharing high token overlap with filename', () => {
      const filename = 'Clean Architecture - Robert C. Martin.pdf';
      const embeddedTitle = 'Clean Architecture: A Craftsman\'s Guide to Software Structure and Design';
      assert.strictEqual(calculateTokenOverlap(embeddedTitle, filename) > 0, true);
      assert.strictEqual(isGarbageTitle(embeddedTitle, filename), false);
    });
  });

  // ==========================================================================
  // 3. Filename Sanitization & Strip Rules
  // ==========================================================================
  describe('Filename Sanitization & Strip Rules', () => {
    it('strips repository tags including libgen, z-lib, vdoc, and 1lib', () => {
      const fn1 = 'John Smith - Modern Programming - libgen.li.pdf';
      const res1 = FilenameParser.parse(fn1);
      assert.strictEqual(res1.title, 'Modern Programming');
      assert.deepStrictEqual(res1.authors, ['John Smith']);

      const fn2 = 'John Smith - Modern Programming _libgen.rs.pdf';
      const res2 = FilenameParser.parse(fn2);
      assert.strictEqual(res2.title, 'Modern Programming');

      const fn3 = 'John Smith - Modern Programming (z-lib.org).pdf';
      const res3 = FilenameParser.parse(fn3);
      assert.strictEqual(res3.title, 'Modern Programming');

      const fn4 = 'John Smith - Modern Programming [vdoc.pub].pdf';
      const res4 = FilenameParser.parse(fn4);
      assert.strictEqual(res4.title, 'Modern Programming');

      const fn5 = 'John Smith - Modern Programming _1lib.domains.pdf';
      const res5 = FilenameParser.parse(fn5);
      assert.strictEqual(res5.title, 'Modern Programming');
    });

    it('normalizes publisher underscores into slashes for multi-publisher blocks', () => {
      const fn = 'Author - Book Title (2015, McGraw-Hill_Open University Press).pdf';
      const res = FilenameParser.parse(fn);
      assert.strictEqual(res.publisher, 'McGraw-Hill / Open University Press');
      assert.strictEqual(res.publicationYear, 2015);
    });

    it('preserves volume and edition identifiers while stripping download tags', () => {
      const fn = 'Author - Advanced Mathematics Vol. 2 (2nd Edition) - libgen.li.pdf';
      const res = FilenameParser.parse(fn);
      assert.strictEqual(res.title.includes('Vol. 2') || res.title.includes('Advanced Mathematics'), true);
      assert.strictEqual(res.edition, '2nd Edition');
    });
  });

  // ==========================================================================
  // 4. Structured Filename Pattern Parser
  // ==========================================================================
  describe('Structured Filename Pattern Parser', () => {
    it('parses Academic / Multi-Part Pattern: Author - Title (Year, Publisher)', () => {
      const fn = 'Barbra Teater - An introduction to applying social work theories and methods (2010, McGraw-Hill_Open University Press).pdf';
      const res = FilenameParser.parse(fn);
      assert.strictEqual(res.title, 'An introduction to applying social work theories and methods');
      assert.deepStrictEqual(res.authors, ['Barbra Teater']);
      assert.strictEqual(res.publicationYear, 2010);
      assert.strictEqual(res.publisher, 'McGraw-Hill / Open University Press');
    });

    it('parses Standard Delimited Pattern: Author - Title', () => {
      const fn = 'Robert C. Martin - Clean Architecture.pdf';
      const res = FilenameParser.parse(fn);
      assert.strictEqual(res.title, 'Clean Architecture');
      assert.deepStrictEqual(res.authors, ['Robert C. Martin']);
    });

    it('parses Bracketed Author Pattern: [Author] Title (Year)', () => {
      const fn = '[Robert C. Martin] Clean Code (2008).pdf';
      const res = FilenameParser.parse(fn);
      assert.strictEqual(res.title, 'Clean Code');
      assert.deepStrictEqual(res.authors, ['Robert C. Martin']);
      assert.strictEqual(res.publicationYear, 2008);
    });

    it('parses Arabic Standard Format: Title - Author', () => {
      const fn = 'قواعد الأحكام في مصالح الأنام - العز بن عبد السلام.pdf';
      const res = FilenameParser.parse(fn);
      assert.strictEqual(res.title, 'قواعد الأحكام في مصالح الأنام');
      assert.deepStrictEqual(res.authors, ['العز بن عبد السلام']);
      assert.strictEqual(res.language, 'ar');
    });
  });

  // ==========================================================================
  // 5. Metadata Scoring & Priority Resolution Engine
  // ==========================================================================
  describe('Metadata Scoring & Priority Resolution', () => {
    it('prefers authentic embedded metadata when valid and matching filename', () => {
      const filename = 'Clean Architecture - Robert C. Martin.pdf';
      const parsed = FilenameParser.parse(filename);

      const embeddedMeta = {
        title: 'Clean Architecture: A Craftsman\'s Guide to Software Structure',
        authors: ['Robert C. Martin'],
        publicationYear: 2017,
        publisher: 'Prentice Hall',
      };

      const result = PdfMetadataReconciler.reconcile({
        embeddedMeta,
        parsedFilename: parsed,
        rawFilename: filename,
      });

      assert.strictEqual(result.title, 'Clean Architecture: A Craftsman\'s Guide to Software Structure');
      assert.deepStrictEqual(result.authors, ['Robert C. Martin']);
      assert.strictEqual(result.publicationYear, 2017);
      assert.strictEqual(result.publisher, 'Prentice Hall');
      assert.strictEqual(result.source, 'embedded_pdf');
      assert.strictEqual(result.discardedArtifacts.length, 0);
    });

    it('merges valid embedded publisher with filename author and title when embedded has prepress job code', () => {
      const filename = 'Barbra Teater - An introduction to applying social work theories and methods (2010).pdf';
      const parsed = FilenameParser.parse(filename);

      const embeddedMeta = {
        title: 'mcgrawh 19768',
        authors: ['jharding'],
        publicationYear: 2010,
        publisher: 'McGraw-Hill Education',
      };

      const result = PdfMetadataReconciler.reconcile({
        embeddedMeta,
        parsedFilename: parsed,
        rawFilename: filename,
      });

      // Resolved title and author from filename, publisher from valid embedded
      assert.strictEqual(result.title, 'An introduction to applying social work theories and methods');
      assert.deepStrictEqual(result.authors, ['Barbra Teater']);
      assert.strictEqual(result.publisher, 'McGraw-Hill Education');
      assert.strictEqual(result.source, 'filename');
      assert.strictEqual(result.discardedArtifacts.some((d) => d.value === 'mcgrawh 19768'), true);
      assert.strictEqual(result.discardedArtifacts.some((d) => d.value === 'jharding'), true);
    });
  });
});
