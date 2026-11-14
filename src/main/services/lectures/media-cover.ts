import type { Database } from 'better-sqlite3';
import { EpubCoverExtractor } from '../metadata/epub-cover-extractor.service';
import { readLectureMetadata } from './media-metadata';
import { SqliteWorkRepository } from '../../database/repositories/work.repository';
import { isLectureFormat } from '../../../shared/lectures';

/** Patch only the existing cover metadata, preserving concurrent edits and user-selected art. */
export class MediaCoverService {
  constructor(private db: Database, private persist = EpubCoverExtractor.persistCoverBuffer) {}
  private find(id: string) {
    const book = new SqliteWorkRepository(this.db).getById(id);
    if (!book || book.deletedAt || !book.filePath || !isLectureFormat(book.digitalFormat)) throw new Error('invalid-request');
    return book;
  }
  private store(id: string, cover: string): string | null {
    return this.db.transaction(() => {
      const row = this.db.prepare('SELECT metadata_json AS metadata FROM work WHERE id=? AND deleted_at IS NULL').get(id) as { metadata: string | null } | undefined;
      if (!row) return null;
      const metadata = JSON.parse(row.metadata || '{}');
      if (metadata.coverImage) return metadata.coverImage as string;
      metadata.coverImage = cover;
      this.db.prepare('UPDATE work SET metadata_json=? WHERE id=?').run(JSON.stringify(metadata), id);
      return cover;
    })();
  }
  async embedded(id: string): Promise<string | null> {
    const book = this.find(id);
    if (book.coverImage) return book.coverImage;
    const metadata = await readLectureMetadata(book.filePath!);
    return metadata.coverPath ? this.store(id, metadata.coverPath) : null;
  }
  saveFrame(id: string, png: unknown): string | null {
    const book = this.find(id);
    if (book.coverImage) return book.coverImage;
    if (typeof png !== 'string' || png.length > 16 * 1024 * 1024) throw new Error('invalid-request');
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/u.exec(png);
    const bytes = match && Buffer.from(match[1], 'base64');
    if (!bytes || bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a) throw new Error('invalid-request');
    const cover = this.persist(bytes, 'image/png');
    return cover ? this.store(id, cover) : null;
  }
}
