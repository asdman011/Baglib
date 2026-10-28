/**
 * Baglib — 3rd-Party PKM & Knowledge Graph Sync Services (KEY-138)
 *
 * Implements Readest PKM adapters:
 * - AnkiConnect (local HTTP 8765) flashcard sync
 * - Joplin Web Clipper API (local HTTP 41184)
 * - Notion database page blocks
 * - Readwise highlights API payload
 */

import type { AnnotationDTO } from '../../../shared/types/annotation';
import type {
  BookBibliographicInfo,
  AnkiConnectRequest,
  AnkiConnectResponse,
  NotionPagePayload,
  JoplinNotePayload,
  ReadwiseHighlightPayload,
} from '../../../shared/types/export';
import { buildAnkiConnectNotes, formatAsMarkdown } from './annotation-exporter';

/**
 * AnkiConnect Local HTTP Client
 * Default port: 8765
 */
export class AnkiConnectClient {
  public endpoint: string;

  constructor(endpoint = 'http://127.0.0.1:8765') {
    this.endpoint = endpoint;
  }

  private async request<T = unknown>(action: string, params?: Record<string, unknown>): Promise<T> {
    const payload: AnkiConnectRequest = {
      action,
      version: 6,
      params,
    };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`AnkiConnect HTTP error: ${res.statusText}`);
    }

    const data: AnkiConnectResponse<T> = await res.json();
    if (data.error) {
      throw new Error(`AnkiConnect Error: ${data.error}`);
    }

    return data.result as T;
  }

  /**
   * Checks if Anki with AnkiConnect is running locally
   */
  async checkConnection(): Promise<boolean> {
    try {
      const version = await this.request<number>('version');
      return version >= 6;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves list of available deck names
   */
  async getDeckNames(): Promise<string[]> {
    return this.request<string[]>('deckNames');
  }

  /**
   * Ensures the target deck exists
   */
  async createDeck(deckName: string): Promise<number> {
    return this.request<number>('createDeck', { deck: deckName });
  }

  /**
   * Synchronizes book annotations as flashcards into Anki
   */
  async syncBookAnnotations(
    book: BookBibliographicInfo,
    annotations: AnnotationDTO[],
    deckName = 'Baglib Notes'
  ): Promise<{ created: number; failed: number }> {
    // 1. Ensure deck exists
    try {
      await this.createDeck(deckName);
    } catch (err) {
      console.warn('[AnkiConnect] createDeck notice:', err);
    }

    // 2. Build flashcard payloads
    const cards = buildAnkiConnectNotes(book, annotations, deckName);
    let created = 0;
    let failed = 0;

    for (const card of cards) {
      try {
        await this.request('addNote', {
          note: {
            deckName: card.deckName || deckName,
            modelName: 'Basic',
            fields: {
              Front: card.front,
              Back: card.back,
            },
            tags: card.tags || ['baglib'],
            options: {
              allowDuplicate: false,
              duplicateScope: 'deck',
            },
          },
        });
        created++;
      } catch (err) {
        console.warn('[AnkiConnect] Failed to add note:', err);
        failed++;
      }
    }

    return { created, failed };
  }
}

/**
 * Joplin Web Clipper API Client
 * Default port: 41184
 */
export class JoplinClient {
  public endpoint: string;
  public token: string;

  constructor(token: string, endpoint = 'http://127.0.0.1:41184') {
    this.token = token;
    this.endpoint = endpoint;
  }

  async checkConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/ping`);
      const text = await res.text();
      return text === 'JoplinClipperServer';
    } catch {
      return false;
    }
  }

  async createNote(payload: JoplinNotePayload): Promise<unknown> {
    const url = `${this.endpoint}/notes?token=${encodeURIComponent(this.token)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Joplin API Error: ${res.statusText}`);
    }

    return res.json();
  }

  async exportBookToJoplin(
    book: BookBibliographicInfo,
    annotations: AnnotationDTO[]
  ): Promise<unknown> {
    const md = formatAsMarkdown(book, annotations, { format: 'markdown', includeFrontmatter: false });
    return this.createNote({
      title: `${book.title} - Notes`,
      body: md,
      tags: ['baglib', 'reading-notes'],
    });
  }
}

/**
 * Formats annotations into Notion API Database Page Payload
 */
export function buildNotionPagePayload(
  book: BookBibliographicInfo,
  annotations: AnnotationDTO[],
  parentDatabaseId: string
): NotionPagePayload {
  const children: Array<Record<string, unknown>> = [];

  // Book header Callout
  children.push({
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: [
        {
          type: 'text',
          text: {
            content: `Imported from Baglib Desktop Library. Author: ${book.author || 'Unknown'}. Total Notes: ${annotations.length}`,
          },
        },
      ],
      icon: { type: 'emoji', emoji: '📚' },
    },
  });

  for (const a of annotations) {
    if (a.selectedText) {
      children.push({
        object: 'block',
        type: 'quote',
        quote: {
          rich_text: [
            {
              type: 'text',
              text: { content: a.selectedText },
            },
          ],
        },
      });
    }

    if (a.noteContent) {
      children.push({
        object: 'block',
        type: 'callout',
        callout: {
          rich_text: [
            {
              type: 'text',
              text: { content: a.noteContent },
            },
          ],
          icon: { type: 'emoji', emoji: '💡' },
        },
      });
    }

    children.push({
      object: 'block',
      type: 'divider',
      divider: {},
    });
  }

  return {
    parent: { database_id: parentDatabaseId },
    properties: {
      Title: {
        title: [
          {
            text: { content: book.title },
          },
        ],
      },
      Author: {
        rich_text: [
          {
            text: { content: book.author || '' },
          },
        ],
      },
    },
    children,
  };
}

/**
 * Formats annotations into Readwise API Highlight Payload
 * POST https://readwise.io/api/v2/highlights/
 */
export function buildReadwisePayload(
  book: BookBibliographicInfo,
  annotations: AnnotationDTO[]
): ReadwiseHighlightPayload {
  const highlights = annotations
    .filter((a) => a.selectedText || a.noteContent)
    .map((a) => {
      const pageNum = parseInt(a.locationCfiOrPage, 10);
      return {
        text: a.selectedText || a.noteContent || '',
        title: book.title,
        author: book.author || undefined,
        source_type: 'baglib_reader',
        category: 'books',
        note: a.selectedText && a.noteContent ? a.noteContent : undefined,
        location: isNaN(pageNum) ? undefined : pageNum,
        location_type: 'page',
        highlighted_at: a.createdAt,
        tags: a.tags && a.tags.length > 0 ? a.tags.map((t) => ({ name: t })) : undefined,
      };
    });

  return { highlights };
}
