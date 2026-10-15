/**
 * Baglib — Internet Archive Search Provider
 *
 * Implements ISearchProvider for querying Internet Archive's vast public texts collection.
 * Detects downloadable EPUB and PDF formats, generates direct download links, and resolves cover art.
 */

import {
  ISearchProvider,
  SearchProviderId,
  UnifiedSearchQuery,
  UnifiedSearchResult,
  SearchFormat,
} from '../../../../shared/types/search';
import { internetArchiveClient } from '../../metadata/http-client';

export class InternetArchiveSearchProvider implements ISearchProvider {
  public readonly id: SearchProviderId = 'internetarchive';
  public readonly name = 'Internet Archive';
  public readonly nameAr = 'أرشيف الإنترنت (Internet Archive)';
  public readonly description = 'Millions of freely readable and downloadable books and manuscripts';
  public readonly descriptionAr = 'ملايين الكتب المتاحة للقراءة والتحميل المجاني والمخطوطات التاريخية';
  public readonly icon = 'archive';
  public readonly supportsDownload = true;
  public readonly supportsFullText = true;

  private enabled = true;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public async search(query: UnifiedSearchQuery, signal?: AbortSignal): Promise<UnifiedSearchResult[]> {
    if (signal?.aborted) return [];

    const rawTerm = (query.query || '').trim();
    const title = (query.title || '').trim();
    const author = (query.author || '').trim();
    const isbn = (query.isbn || '').trim();

    if (!rawTerm && !title && !author && !isbn) {
      return [];
    }

    try {
      const parts: string[] = ['mediatype:texts'];
      if (isbn) {
        parts.push(`isbn:${isbn.replace(/[-\s]/g, '')}`);
      } else {
        if (title) parts.push(`title:(${title})`);
        if (author) parts.push(`creator:(${author})`);
        if (rawTerm && !title) parts.push(`(${rawTerm})`);
      }

      const qString = parts.join(' AND ');
      const limit = Math.min(query.limit || 20, 50);
      const page = query.page || 1;

      const params = new URLSearchParams({
        q: qString,
        'fl[]': 'identifier,title,creator,year,publicdate,description,isbn,format,language',
        sort: 'downloads desc',
        rows: String(limit),
        page: String(page),
        output: 'json',
      });

      const data = await internetArchiveClient.getJson<any>(`/advancedsearch.php?${params.toString()}`);

      if (signal?.aborted || !data?.response?.docs || !Array.isArray(data.response.docs)) {
        return [];
      }

      const results: UnifiedSearchResult[] = [];

      for (const doc of data.response.docs) {
        const identifier = doc.identifier;
        if (!identifier) continue;

        const id = `internetarchive:${identifier}`;
        const rawTitle = typeof doc.title === 'string' ? doc.title.trim() : 'Untitled';
        const cleanTitle = rawTitle.replace(/^(\d{3,5}\s+)+/, '').trim();

        const authors: string[] = Array.isArray(doc.creator)
          ? doc.creator
          : typeof doc.creator === 'string'
          ? [doc.creator]
          : [];

        let publishYear: number | undefined;
        if (doc.year) {
          publishYear = parseInt(String(doc.year), 10);
        } else if (doc.publicdate) {
          const match = String(doc.publicdate).match(/^(\d{4})/);
          if (match) publishYear = parseInt(match[1], 10);
        }

        const isbns: string[] = Array.isArray(doc.isbn)
          ? doc.isbn
          : typeof doc.isbn === 'string'
          ? [doc.isbn]
          : [];

        const rawFormats: string[] = Array.isArray(doc.format)
          ? doc.format
          : typeof doc.format === 'string'
          ? [doc.format]
          : [];

        const availableFormats: SearchFormat[] = [];
        let downloadUrl: string | undefined;

        const hasPdf = rawFormats.some((f) => /pdf/i.test(f));
        const hasEpub = rawFormats.some((f) => /epub/i.test(f));
        const hasTxt = rawFormats.some((f) => /text|txt/i.test(f));

        if (hasEpub) availableFormats.push('EPUB');
        if (hasPdf) availableFormats.push('PDF');
        if (hasTxt) availableFormats.push('TXT');

        // Prefer EPUB, then PDF for primary direct download link
        if (hasEpub) {
          downloadUrl = `https://archive.org/download/${identifier}/${identifier}.epub`;
        } else if (hasPdf) {
          downloadUrl = `https://archive.org/download/${identifier}/${identifier}.pdf`;
        }

        const coverUrl = `https://archive.org/services/img/${identifier}`;
        const sourceUrl = `https://archive.org/details/${identifier}`;

        results.push({
          id,
          providerId: 'internetarchive',
          providerName: this.name,
          title: cleanTitle,
          author: authors.length > 0 ? authors.join(', ') : 'Unknown Author',
          authors: authors.length > 0 ? authors : undefined,
          publishYear: !isNaN(publishYear as number) ? publishYear : undefined,
          language: Array.isArray(doc.language) ? doc.language[0] : doc.language,
          isbn: isbns[0],
          coverUrl,
          thumbnailUrl: coverUrl,
          description: typeof doc.description === 'string' ? doc.description.trim() : undefined,
          sourceUrl,
          downloadUrl,
          availableFormats: availableFormats.length > 0 ? availableFormats : undefined,
          score: 0.8,
        });
      }

      return results;
    } catch (err: any) {
      if (signal?.aborted) return [];
      console.warn('[baglib:internetarchive-search] Provider search error:', err?.message || err);
      return [];
    }
  }
}
