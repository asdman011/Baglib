/**
 * Baglib — Internet Archive Bibliographic Metadata & Cover Art Provider
 *
 * Implements the MetadataProvider interface for the open Internet Archive Advanced Search
 * and Metadata API (archive.org/advancedsearch.php and archive.org/metadata/{id}).
 *
 * Highlights:
 * - 100% open, unblocked globally (including Egypt and Middle East regions).
 * - Massive catalog of multi-lingual books (Arabic classical and modern texts, English publications).
 * - Reliable high-resolution cover art images directly at archive.org/services/img/{identifier}.
 */

import { MetadataProvider, SearchQuery } from './provider.interface';
import { BibliographicWork, BibliographicEdition, BibliographicSource } from '../../../../shared/types/bibliographic';
import { internetArchiveClient } from '../http-client';
import { isValidIsbn10, isValidIsbn13, isPlaceholderAuthor } from '../../../../shared/validators/metadata-validator';

export class InternetArchiveProvider implements MetadataProvider {
  get name(): string {
    return 'Internet Archive';
  }

  private mapDocToWork(doc: any): BibliographicWork {
    const rawTitle = typeof doc.title === 'string' ? doc.title.trim() : 'Unknown Title';
    // Clean leading catalog codes like "0780 كتاب ..." or "Noor Book.com ..."
    const cleanTitle = rawTitle
      .replace(/^(\d{3,5}\s+)+/, '')
      .replace(/^Noor\s*Book\.com\s*/i, '')
      .trim();

    // Creators / Authors
    const rawCreators: string[] = Array.isArray(doc.creator)
      ? doc.creator
      : typeof doc.creator === 'string'
      ? [doc.creator]
      : [];

    const authors = rawCreators.map((c) => {
      const cleaned = String(c).replace(/,\s*\d{4}-?(?:\d{4})?/g, '').trim();
      if (cleaned.includes(',')) {
        const parts = cleaned.split(',').map((p) => p.trim());
        if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
      }
      return cleaned;
    }).filter(Boolean);

    // Year
    let firstPublishYear: number | undefined;
    if (doc.year) {
      firstPublishYear = parseInt(String(doc.year), 10);
    } else if (doc.date) {
      const match = String(doc.date).match(/(18\d{2}|19\d{2}|20\d{2})/);
      if (match) firstPublishYear = parseInt(match[1], 10);
    }

    // ISBN extraction
    let isbn10: string | undefined;
    let isbn13: string | undefined;
    const rawIsbns: string[] = Array.isArray(doc.isbn)
      ? doc.isbn
      : typeof doc.isbn === 'string'
      ? [doc.isbn]
      : [];

    for (const raw of rawIsbns) {
      const clean = String(raw).replace(/[-\s]/g, '').trim();
      const m13 = clean.match(/97[89]\d{10}/);
      if (m13 && isValidIsbn13(m13[0])) {
        isbn13 = m13[0];
      }
      const m10 = clean.match(/\d{9}[\dX]/i);
      if (m10 && isValidIsbn10(m10[0].toUpperCase())) {
        isbn10 = m10[0].toUpperCase();
      }
    }
    const isbn = isbn13 || isbn10;

    const identifier = doc.identifier || Math.random().toString(36).substring(2);
    const coverUrl = `https://archive.org/services/img/${encodeURIComponent(identifier)}`;

    const publisher = Array.isArray(doc.publisher)
      ? doc.publisher[0]
      : typeof doc.publisher === 'string'
      ? doc.publisher.trim()
      : undefined;

    const sources: BibliographicSource[] = [
      {
        provider: this.name,
        providerId: identifier,
        url: `https://archive.org/details/${encodeURIComponent(identifier)}`,
      },
    ];

    const edition: BibliographicEdition = {
      editionId: `ia-ed-${identifier}`,
      title: cleanTitle,
      publishDate: firstPublishYear ? String(firstPublishYear) : undefined,
      publisher,
      isbn,
      isbn10,
      isbn13,
      coverUrl,
      language: typeof doc.language === 'string' ? doc.language : Array.isArray(doc.language) ? doc.language[0] : undefined,
      sources,
    };

    const description = Array.isArray(doc.description)
      ? doc.description.join('\n\n')
      : typeof doc.description === 'string'
      ? doc.description
      : undefined;

    return {
      workId: `ia-${identifier}`,
      title: cleanTitle,
      authors: authors.length > 0 ? authors : ['Unknown Author'],
      firstPublishYear,
      description,
      subjects: Array.isArray(doc.subject) ? doc.subject : typeof doc.subject === 'string' ? [doc.subject] : [],
      editions: [edition],
    };
  }

  async search(query: string | SearchQuery, maxResults = 10): Promise<BibliographicWork[]> {
    if (!query) return [];

    try {
      const terms: string[] = ['mediatype:(texts)'];
      let hasAuthor = false;
      let hasTitle = false;

      if (typeof query === 'string') {
        const clean = query.trim().replace(/["()]/g, ' ');
        if (!clean) return [];
        terms.push(`(${clean})`);
      } else {
        if (query.title?.trim()) {
          const cleanTitle = query.title.trim().replace(/["()]/g, ' ');
          terms.push(`title:(${cleanTitle})`);
          hasTitle = true;
        }
        if (query.author?.trim() && !isPlaceholderAuthor(query.author)) {
          const cleanAuthor = query.author.trim().replace(/["()]/g, ' ');
          terms.push(`creator:(${cleanAuthor})`);
          hasAuthor = true;
        }
        if (query.general?.trim() && !query.title) {
          const cleanGen = query.general.trim().replace(/["()]/g, ' ');
          terms.push(`(${cleanGen})`);
        }
      }

      if (terms.length <= 1) return [];

      const qParam = encodeURIComponent(terms.join(' AND '));
      const url = `/advancedsearch.php?q=${qParam}&fl[]=identifier,title,creator,publisher,year,date,isbn,language,description&rows=${maxResults}&output=json`;

      const data = await internetArchiveClient.getJson<any>(url);
      let docs = data?.response?.docs;

      // Fallback: If searching by title AND creator yielded 0 results, retry with title only
      if ((!docs || !Array.isArray(docs) || docs.length === 0) && hasAuthor && hasTitle && typeof query !== 'string' && query.title?.trim()) {
        const fallbackTitle = query.title.trim().replace(/["()]/g, ' ');
        const fallbackTerms = ['mediatype:(texts)', `title:(${fallbackTitle})`];
        const fallbackUrl = `/advancedsearch.php?q=${encodeURIComponent(fallbackTerms.join(' AND '))}&fl[]=identifier,title,creator,publisher,year,date,isbn,language,description&rows=${maxResults}&output=json`;
        const fallbackData = await internetArchiveClient.getJson<any>(fallbackUrl);
        if (fallbackData?.response?.docs && Array.isArray(fallbackData.response.docs)) {
          docs = fallbackData.response.docs;
        }
      }

      if (!docs || !Array.isArray(docs)) {
        return [];
      }

      return docs.map((doc: any) => this.mapDocToWork(doc));
    } catch (err: any) {
      console.info('[InternetArchiveProvider] Search note:', err?.message || err);
      return [];
    }
  }

  async searchByIsbn(isbn: string): Promise<BibliographicWork | null> {
    if (!isbn) return null;
    const cleanIsbn = isbn.replace(/[-\s]/g, '').trim();

    try {
      const q = encodeURIComponent(`isbn:(${cleanIsbn}) AND mediatype:(texts)`);
      const url = `/advancedsearch.php?q=${q}&fl[]=identifier,title,creator,publisher,year,date,isbn,language,description&rows=3&output=json`;

      const data = await internetArchiveClient.getJson<any>(url);
      if (!data || !data.response || !Array.isArray(data.response.docs) || data.response.docs.length === 0) {
        return null;
      }

      return this.mapDocToWork(data.response.docs[0]);
    } catch (err: any) {
      console.info('[InternetArchiveProvider] SearchByIsbn note:', err?.message || err);
      return null;
    }
  }

  async getWorkDetails(workId: string): Promise<BibliographicWork | null> {
    if (!workId) return null;
    const identifier = workId.replace(/^ia-/, '');

    try {
      const url = `/metadata/${encodeURIComponent(identifier)}`;
      const data = await internetArchiveClient.getJson<any>(url);

      if (!data || !data.metadata) return null;
      const meta = {
        ...data.metadata,
        identifier,
      };
      return this.mapDocToWork(meta);
    } catch (err: any) {
      console.info('[InternetArchiveProvider] GetWorkDetails note:', err?.message || err);
      return null;
    }
  }
}
