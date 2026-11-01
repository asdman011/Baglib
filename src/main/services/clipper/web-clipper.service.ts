import { errorMessage } from '../../../shared/errors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseHTML } from 'linkedom';
import type {
  ClipFormat,
  ClipOptions,
  ClipProgressEvent,
  ClipResult,
  ClippedArticle,
  SerializedNovelOptions,
  EpubChapterInput,
} from '../../../shared/types/web-clipper';
import { ReadabilityExtractorService } from './readability-extractor.service';
import { AssetBundlerService } from './asset-bundler.service';
import { EpubPackagerService } from './epub-packager.service';
import { PdfPackagerService, inlineClippedImages } from './pdf-packager.service';
import { DigitalImportPipelineService } from '../digital/digital-import-pipeline.service';

const CLIP_EXTENSIONS: Record<ClipFormat, string> = { epub: 'epub', markdown: 'md', pdf: 'pdf' };

function sanitizeFilename(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
  return clean.slice(0, 100) || 'clipped-book';
}

export class WebClipperService {
  private static instance: WebClipperService;
  private extractor: ReadabilityExtractorService;
  private bundler: AssetBundlerService;
  private packager: EpubPackagerService;
  private pdfPackager: PdfPackagerService;

  constructor(
    extractor?: ReadabilityExtractorService,
    bundler?: AssetBundlerService,
    packager?: EpubPackagerService,
    pdfPackager?: PdfPackagerService
  ) {
    this.extractor = extractor || ReadabilityExtractorService.getInstance();
    this.bundler = bundler || AssetBundlerService.getInstance();
    this.packager = packager || EpubPackagerService.getInstance();
    this.pdfPackager = pdfPackager || PdfPackagerService.getInstance();
  }

  public static getInstance(): WebClipperService {
    if (!this.instance) {
      this.instance = new WebClipperService();
    }
    return this.instance;
  }

  /**
   * Clip a single web article and package into EPUB, Markdown or PDF
   */
  public async clipArticle(
    options: ClipOptions,
    onProgress?: (event: ClipProgressEvent) => void
  ): Promise<ClipResult> {
    try {
      onProgress?.({ stage: 'fetching', message: 'Fetching web article...' });

      let article: ClippedArticle;
      if (options.html) {
        article = this.extractor.extractFromHtml(options.html, options.url);
      } else {
        article = await this.extractor.extractFromUrl(options.url);
      }

      if (options.customTitle) article.title = options.customTitle;
      if (options.customAuthor) article.byline = options.customAuthor;
      if (options.language) article.language = options.language;

      onProgress?.({ stage: 'assets', message: 'Bundling media and images...' });

      let bundledHtml = article.content;
      let images: import('../../../shared/types/web-clipper').ClippedImage[] = [];

      if (options.downloadImages !== false && article.images.length > 0) {
        const bundleRes = await this.bundler.bundleAssets(
          article.content,
          article.url,
          (done, total) => {
            onProgress?.({
              stage: 'assets',
              currentAsset: done,
              totalAssets: total,
              message: `Downloaded ${done}/${total} images`,
            });
          }
        );
        bundledHtml = bundleRes.rewrittenHtml;
        images = bundleRes.images;
      }

      onProgress?.({ stage: 'packaging', message: 'Packaging into clean book format...' });

      const format = options.targetFormat || 'epub';
      const clipsDir = path.join(os.tmpdir(), 'baglib-clips');
      if (!fs.existsSync(clipsDir)) {
        fs.mkdirSync(clipsDir, { recursive: true });
      }

      const fileName = `${sanitizeFilename(article.title)}.${CLIP_EXTENSIONS[format]}`;
      const filePath = path.join(clipsDir, fileName);

      let fileBuffer: Buffer;
      if (format === 'markdown') {
        const mdText = this.packager.packageToMarkdown(article);
        fileBuffer = Buffer.from(mdText, 'utf-8');
      } else if (format === 'pdf') {
        fileBuffer = await this.pdfPackager.packageArticle(article, bundledHtml, images, options.contentsLabel);
      } else {
        fileBuffer = this.packager.packageArticleToEpub(article, bundledHtml, images);
      }

      fs.writeFileSync(filePath, fileBuffer);

      let workId: string | undefined;
      if (options.importToLibrary !== false) {
        onProgress?.({ stage: 'importing', message: 'Adding to Baglib library...' });
        const importPipeline = DigitalImportPipelineService.getInstance();
        const importRes = await importPipeline.importFile({ filePath });
        if (importRes.success) {
          workId = importRes.workId;
        }
      }

      onProgress?.({ stage: 'completed', message: 'Article successfully clipped!' });

      return {
        success: true,
        workId,
        title: article.title,
        author: article.byline,
        filePath,
        fileName,
        fileSizeBytes: fileBuffer.byteLength,
        chapterCount: 1,
        imageCount: images.length,
        format,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? errorMessage(err) : String(err);
      onProgress?.({ stage: 'error', message: msg });
      return {
        success: false,
        chapterCount: 0,
        imageCount: 0,
        format: options.targetFormat || 'epub',
        error: msg,
      };
    }
  }

  /**
   * Scrapes serialized chapters (e.g. online novel, multi-part essay, documentation)
   * and compiles them into a unified multi-chapter EPUB, Markdown or PDF book.
   */
  public async scrapeSerializedNovel(
    options: SerializedNovelOptions,
    onProgress?: (event: ClipProgressEvent) => void
  ): Promise<ClipResult> {
    const format = options.targetFormat || 'epub';
    try {
      onProgress?.({ stage: 'fetching', message: 'Discovering chapters...' });

      let chapterUrls: string[] = options.chapterUrls || [];

      // If chapter URLs not directly provided, parse from the TOC URL
      if (chapterUrls.length === 0) {
        const res = await fetch(options.url);
        const html = await res.text();
        const { document } = parseHTML(html);

        const selector = options.chapterListSelector || 'a[href*="chapter"], .chapter-list a, .toc a';
        const linkEls = Array.from(document.querySelectorAll(selector));

        const seen = new Set<string>();
        for (const el of linkEls) {
          const href = el.getAttribute('href');
          if (href) {
            try {
              const fullUrl = new URL(href, options.url).toString();
              if (!seen.has(fullUrl)) {
                seen.add(fullUrl);
                chapterUrls.push(fullUrl);
              }
            } catch {}
          }
        }
      }

      if (chapterUrls.length === 0) {
        throw new Error('No chapters found to scrape at provided URL');
      }

      // Limit to 200 chapters safety cap
      chapterUrls = chapterUrls.slice(0, 200);

      onProgress?.({
        stage: 'fetching',
        currentChapter: 0,
        totalChapters: chapterUrls.length,
        message: `Found ${chapterUrls.length} chapters. Fetching content...`,
      });

      const chapters: EpubChapterInput[] = [];
      const totalImages: import('../../../shared/types/web-clipper').ClippedImage[] = [];
      let novelTitle = options.title || 'Serialized Book';
      let novelAuthor = options.author || 'Web Author';

      // Concurrently fetch chapters in batches
      const concurrency = options.concurrency || 3;
      for (let i = 0; i < chapterUrls.length; i += concurrency) {
        const batch = chapterUrls.slice(i, i + concurrency);
        await Promise.all(
          batch.map(async (chapUrl, batchIdx) => {
            const index = i + batchIdx + 1;
            try {
              const chapArticle = await this.extractor.extractFromUrl(chapUrl);

              if (i === 0 && batchIdx === 0 && !options.title) {
                novelTitle = chapArticle.siteName || chapArticle.title;
              }
              if (i === 0 && batchIdx === 0 && !options.author && chapArticle.byline) {
                novelAuthor = chapArticle.byline;
              }

              let chapContent = chapArticle.content;
              if (options.downloadImages && format !== 'markdown') {
                // Numbering restarts in each chapter, so the prefix keeps every EPUB image path unique.
                const bundleRes = await this.bundler.bundleAssets(chapArticle.content, chapUrl, undefined, `ch${index}_img`);
                chapContent = format === 'pdf' ? inlineClippedImages(bundleRes.rewrittenHtml, bundleRes.images) : bundleRes.rewrittenHtml;
                totalImages.push(...bundleRes.images);
              }

              chapters.push({
                title: chapArticle.title || `Chapter ${index}`,
                contentHtml: chapContent,
                index,
              });
            } catch (err) {
              chapters.push({
                title: `Chapter ${index}`,
                contentHtml: `<p>Failed to load chapter content from: ${chapUrl}</p>`,
                index,
              });
            }

            onProgress?.({
              stage: 'extracting',
              currentChapter: chapters.length,
              totalChapters: chapterUrls.length,
              message: `Fetched ${chapters.length}/${chapterUrls.length} chapters`,
            });
          })
        );
      }

      // Sort chapters by index
      chapters.sort((a, b) => a.index - b.index);

      onProgress?.({ stage: 'packaging', message: 'Packaging multi-chapter book...' });

      const clipsDir = path.join(os.tmpdir(), 'baglib-clips');
      if (!fs.existsSync(clipsDir)) {
        fs.mkdirSync(clipsDir, { recursive: true });
      }

      const fileName = `${sanitizeFilename(novelTitle)}.${CLIP_EXTENSIONS[format]}`;
      const filePath = path.join(clipsDir, fileName);

      const metadata = { title: novelTitle, author: novelAuthor, sourceUrl: options.url };
      let fileBuffer: Buffer;
      if (format === 'markdown') {
        fileBuffer = Buffer.from(this.packager.packageSerializedNovelToMarkdown(chapters, metadata), 'utf-8');
      } else if (format === 'pdf') {
        fileBuffer = await this.pdfPackager.packageChapters(chapters, { ...metadata, contentsLabel: options.contentsLabel });
      } else {
        fileBuffer = this.packager.packageSerializedNovelToEpub(chapters, metadata, totalImages);
      }

      fs.writeFileSync(filePath, fileBuffer);

      let workId: string | undefined;
      if (options.importToLibrary !== false) {
        onProgress?.({ stage: 'importing', message: 'Adding serialized book to Baglib...' });
        const importPipeline = DigitalImportPipelineService.getInstance();
        const importRes = await importPipeline.importFile({ filePath });
        if (importRes.success) {
          workId = importRes.workId;
        }
      }

      onProgress?.({ stage: 'completed', message: 'Serialized book successfully imported!' });

      return {
        success: true,
        workId,
        title: novelTitle,
        author: novelAuthor,
        filePath,
        fileName,
        fileSizeBytes: fileBuffer.byteLength,
        chapterCount: chapters.length,
        imageCount: totalImages.length,
        format,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? errorMessage(err) : String(err);
      onProgress?.({ stage: 'error', message: msg });
      return {
        success: false,
        chapterCount: 0,
        imageCount: 0,
        format,
        error: msg,
      };
    }
  }
}
