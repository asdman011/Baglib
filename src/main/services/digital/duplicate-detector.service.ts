/**
 * Baglib — Digital Library Duplicate Detection Service (Story 6.4 / KEY-81)
 *
 * Detects duplicate materials before import by evaluating:
 * 1. Exact SHA-256 content hash (Identical digital file payload)
 * 2. Exact ISBN match (Same published edition across formats)
 * 3. High title & author similarity (Potential duplicate works)
 */

import fs from 'fs';
import path from 'path';
import { hashImportFile } from './import-files';
import { getDatabase } from '../../database/connection';
import { WorkRepository, SqliteWorkRepository } from '../../database/repositories/work.repository';
import { EbookMetadataExtractorService } from './ebook-metadata-extractor.service';
import { calculateStringSimilarity, calculateTokenOverlap, normalizeSearchString } from '../../../shared/utils/text-normalizer';
import type {
  DuplicateDetectionResult,
  DigitalFormat,
} from '../../../shared/types/digital-file';
import type { BookItem } from '../../../shared/types/work';

export interface DuplicateCheckCandidate {
  filePath: string;
  fileName?: string;
  fileHash?: string;
  fileSizeBytes?: number;
  title?: string;
  author?: string;
  isbn?: string;
  candidateMetadata?: {
    title?: string;
    author?: string;
    isbn?: string;
    format?: DigitalFormat;
    publicationYear?: number;
  };
}

type LibraryCandidate = Pick<BookItem, 'id' | 'title' | 'author'>;

/** A conservative shortlist. Original order preserves the first matching Work. */
export class DuplicateCandidateIndex {
  private readonly postings = new Map<string, Set<number>>();
  readonly entries: { work: LibraryCandidate; title: string; strippedTitle: string }[];

  constructor(works: LibraryCandidate[]) {
    this.entries = works.map(work => {
      const title = normalizeSearchString(work.title);
      return { work, title, strippedTitle: title.replace(/(?:^|\s+)ال([^\s]{3,})/gu, '$1').trim() };
    });
    this.entries.forEach((entry, index) => {
      for (const key of this.keys(entry.title, entry.strippedTitle)) {
        let posting = this.postings.get(key);
        if (!posting) {
          posting = new Set();
          this.postings.set(key, posting);
        }
        posting.add(index);
      }
    });
  }

  private keys(title: string, stripped: string): Set<string> {
    const keys = new Set(title.split(' ').filter(Boolean).map(token => 't:' + token));
    for (const value of [title, stripped]) {
      for (let index = 0; index + 1 < value.length; index++) keys.add('b:' + value.slice(index, index + 2));
    }
    return keys;
  }

  select(title: string, stripped: string) {
    // Accepted edit similarity >= .85 shares a bigram for length >=3.
    // Token overlap and short exact matches share a token. Substrings >=4 share bigrams.
    const selected = new Set<number>();
    for (const key of this.keys(title, stripped)) {
      for (const index of this.postings.get(key) || []) selected.add(index);
    }
    return [...selected].sort((a, b) => a - b).map(index => this.entries[index]);
  }
}

export class DuplicateDetectorService {
  private static instance: DuplicateDetectorService;
  private workRepository: WorkRepository;
  private extractor: EbookMetadataExtractorService;

  constructor(
    workRepository?: WorkRepository,
    extractor?: EbookMetadataExtractorService
  ) {
    this.workRepository = workRepository || new SqliteWorkRepository(getDatabase());
    this.extractor = extractor || EbookMetadataExtractorService.getInstance();
  }

  public static getInstance(workRepository?: WorkRepository): DuplicateDetectorService {
    if (!this.instance || workRepository) {
      this.instance = new DuplicateDetectorService(workRepository);
    }
    return this.instance;
  }

  /**
   * Inspects a candidate file on disk or metadata payload for duplicates in the library.
   */
  public async checkDuplicate(input: string | DuplicateCheckCandidate, candidates?: LibraryCandidate[] | DuplicateCandidateIndex, exactOnly = false): Promise<DuplicateDetectionResult> {
    const candidate: DuplicateCheckCandidate = typeof input === 'string' ? { filePath: input } : input;
    const filePath = candidate.filePath;
    const fileName = candidate.fileName || (filePath ? path.basename(filePath) : 'Unknown');

    // 1. Verify file on disk if path provided
    let fileHash = candidate.fileHash;
    let fileSizeBytes = candidate.fileSizeBytes;

    if (filePath && fs.existsSync(filePath)) {
      try {
        const stat = fs.statSync(filePath);
        fileSizeBytes = fileSizeBytes ?? stat.size;

        if (!fileHash) {
          fileHash = await hashImportFile(filePath);
        }
      } catch (err) {
        console.warn(`[DuplicateDetector] Failed reading ${filePath}:`, err);
        return { filePath, fileName, fileSizeBytes, matchType: 'none', confidence: 0, reason: '', error: 'READ_ERROR' };
      }
    }

    // Tier 1: Exact File Hash Match (SHA-256)
    if (fileHash) {
      const matchByHash = this.workRepository.findWorkByFileHash(fileHash);
      if (matchByHash) {
        return {
          filePath: filePath || '',
          fileName,
          fileHash,
          fileSizeBytes,
          matchType: 'exact_file',
          confidence: 1.0,
          reason: 'exact_file',
          existingWork: matchByHash,
          candidateMetadata: {
            title: candidate.title || matchByHash.title,
            author: candidate.author || matchByHash.author,
            isbn: candidate.isbn || matchByHash.isbn,
            format: matchByHash.digitalFormat,
          },
        };
      }
    }

    if (exactOnly) return { filePath, fileName, fileHash, fileSizeBytes, matchType: 'none', confidence: 0, reason: '' };

    // Extract embedded metadata if title or ISBN are missing and file exists
    let title = candidate.title || (candidate).candidateMetadata?.title;
    let author = candidate.author || (candidate).candidateMetadata?.author;
    let isbn = candidate.isbn || (candidate).candidateMetadata?.isbn;

    if (filePath && fs.existsSync(filePath) && (!title || !isbn)) {
      try {
        const extracted = await this.extractor.extract(filePath);
        title = title || extracted.title;
        author = author || (extracted.authors && extracted.authors[0]);
        isbn = isbn || extracted.isbn;
      } catch {
        return { filePath, fileName, fileHash, fileSizeBytes, matchType: 'none', confidence: 0, reason: '', error: 'METADATA_ERROR' };
      }
    }

    // Tier 2: Exact ISBN Match
    if (isbn) {
      const cleanIsbn = isbn.replace(/[^0-9xX]/g, '').toUpperCase();
      if (cleanIsbn.length >= 10) {
        const matchByIsbn = this.workRepository.findWorkByIsbn(cleanIsbn);
        if (matchByIsbn) {
          return {
            filePath: filePath || '',
            fileName,
            fileHash,
            fileSizeBytes,
            matchType: 'same_edition',
            confidence: 0.95,
            reason: 'same_edition',
            existingWork: matchByIsbn,
            candidateMetadata: {
              title: title || matchByIsbn.title,
              author: author || matchByIsbn.author,
              isbn,
            },
          };
        }
      }
    }

    // Tier 3: Title & Author Linguistic Similarity
    if (title && title.trim().length >= 3) {
      const source = candidates || (this.workRepository.getDuplicateCandidates?.() ?? this.workRepository.getAllWorks());
      const normCandidateTitle = normalizeSearchString(title);
      const stripCandidateTitle = normCandidateTitle.replace(/(?:^|\s+)ال([^\s]{3,})/gu, '$1').trim();

      const allWorks = source instanceof DuplicateCandidateIndex ? source.select(normCandidateTitle, stripCandidateTitle) : source.map(work => ({
        work, title: normalizeSearchString(work.title), strippedTitle: normalizeSearchString(work.title).replace(/(?:^|\s+)ال([^\s]{3,})/gu, '$1').trim(),
      }));
      for (let index = 0; index < allWorks.length; index++) {
        if (index % 100 === 0) await new Promise<void>(resolve => setImmediate(resolve));
        const { work, title: normWorkTitle, strippedTitle: stripWorkTitle } = allWorks[index];
        if (!normWorkTitle) continue;

        const titleSim = calculateStringSimilarity(normCandidateTitle, normWorkTitle);
        const stripSim = calculateStringSimilarity(stripCandidateTitle, stripWorkTitle);
        const tokenOverlap = calculateTokenOverlap(normCandidateTitle, normWorkTitle);
        const stripTokenOverlap = calculateTokenOverlap(stripCandidateTitle, stripWorkTitle);

        const maxSim = Math.max(titleSim, stripSim);
        const maxTokens = Math.max(tokenOverlap, stripTokenOverlap);

        // Check if one title is substring of another
        const isSubstr =
          (stripWorkTitle.includes(stripCandidateTitle) || stripCandidateTitle.includes(stripWorkTitle)) &&
          Math.min(stripCandidateTitle.length, stripWorkTitle.length) >= 4;

        // Check author similarity
        let authorMatches = false;
        let authorSim = 0.5; // Neutral if author not provided
        if (author && work.author) {
          const normCandAuthor = normalizeSearchString(author);
          const normWorkAuthor = normalizeSearchString(work.author);
          authorSim = calculateStringSimilarity(normCandAuthor, normWorkAuthor);
          const authorTokens = calculateTokenOverlap(normCandAuthor, normWorkAuthor);
          const authorContained =
            normWorkAuthor.includes(normCandAuthor) ||
            normCandAuthor.includes(normWorkAuthor) ||
            normWorkTitle.includes(normCandAuthor);

          if (authorSim >= 0.65 || authorTokens >= 0.5 || authorContained) {
            authorMatches = true;
          }
        } else {
          authorMatches = true;
        }

        if (
          (maxSim >= 0.85 || maxTokens >= 0.75 || (isSubstr && authorMatches)) &&
          (authorMatches || authorSim >= 0.65)
        ) {
          const confidence = Math.min(0.92, Math.max(0.75, maxSim * 0.6 + authorSim * 0.4));
          return {
            filePath: filePath || '',
            fileName,
            fileHash,
            fileSizeBytes,
            matchType: 'potential_duplicate',
            confidence: parseFloat(confidence.toFixed(2)),
            reason: 'potential_duplicate',
            existingWork: this.workRepository.getById(work.id) || work as BookItem,
            candidateMetadata: {
              title,
              author,
              isbn,
            },
          };
        }
      }
    }

    // No Duplicate Detected
    return {
      filePath: filePath || '',
      fileName,
      fileHash,
      fileSizeBytes,
      matchType: 'none',
      confidence: 0.0,
      reason: 'none',
      candidateMetadata: {
        title,
        author,
        isbn,
      },
    };
  }

  /**
   * Batch inspects multiple file paths or candidates.
   */
  public async batchCheckDuplicates(
    inputs: Array<string | DuplicateCheckCandidate>
  ): Promise<DuplicateDetectionResult[]> {
    const results: DuplicateDetectionResult[] = [];
    const candidates = new DuplicateCandidateIndex(this.workRepository.getDuplicateCandidates?.() ?? this.workRepository.getAllWorks());
    const hashes = new Map<string, DuplicateDetectionResult>();
    for (const input of inputs) {
      await new Promise<void>(resolve => setImmediate(resolve));
      const res = await this.checkDuplicate(input, candidates);
      if (res.fileHash && !res.error) {
        const twin = hashes.get(res.fileHash);
        if (twin && res.matchType !== 'exact_file') {
          res.matchType = 'exact_file';
          res.confidence = 1;
          res.reason = 'batch_duplicate';
          res.existingWork = undefined;
          res.batchDuplicateOf = { filePath: twin.filePath, fileName: twin.fileName };
        }
        if (!twin) hashes.set(res.fileHash, res);
      }
      const existing = res.existingWork;
      results.push({ ...res, existingWork: existing ? {
        id: existing.id, title: existing.title, author: existing.author,
        isbn: existing.isbn, filePath: existing.filePath, digitalFormat: existing.digitalFormat,
        publisher: existing.publisher, publicationYear: existing.publicationYear,
        bookType: existing.bookType, categories: existing.categories, tags: existing.tags, lendingHistory: [],
      } : undefined });
    }
    return results;
  }
}
