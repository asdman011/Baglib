/**
 * Baglib — Audiobook & Audio Synchronization Service (KEY-145)
 */

import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { SqliteAudiobookRepository } from '../../database/repositories/audiobook.repository';
import { parseSmilXml } from '../../../shared/utils/smil-parser';
import type {
  AudiobookPairingData,
  AudiobookPlaybackProgress,
  SaveAudiobookPairingPayload,
  AudiobookFile,
  SmilMediaOverlay,
} from '../../../shared/types/audio';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.m4b', '.aac', '.ogg', '.oga', '.flac', '.wav']);

export class AudiobookService {
  private repository: SqliteAudiobookRepository;

  constructor(db?: Database.Database) {
    this.repository = new SqliteAudiobookRepository(db);
  }

  /**
   * Retrieves active audiobook pairing for an ebook.
   */
  public getPairing(bookId: string): AudiobookPairingData | null {
    return this.repository.getPairing(bookId);
  }

  /**
   * Persists or updates an audiobook pairing in the database.
   */
  public savePairing(payload: SaveAudiobookPairingPayload): AudiobookPairingData {
    return this.repository.savePairing(payload);
  }

  /**
   * Deletes pairing and any associated playback progress.
   */
  public deletePairing(bookId: string): boolean {
    return this.repository.deletePairing(bookId);
  }

  /**
   * Retrieves playback progress.
   */
  public getProgress(bookId: string): AudiobookPlaybackProgress | null {
    return this.repository.getProgress(bookId);
  }

  /**
   * Updates playback progress.
   */
  public saveProgress(progress: AudiobookPlaybackProgress): void {
    this.repository.saveProgress(progress);
  }

  /**
   * Parses SMIL Media Overlay XML from EPUB 3 books.
   */
  public parseSmil(xmlContent: string, smilHref?: string): SmilMediaOverlay {
    return {
      smilHref: smilHref || '',
      pars: parseSmilXml(xmlContent, smilHref),
    };
  }

  /**
   * Scans a local directory for DRM-free audio tracks.
   * Naturally sorts files and extracts basic metadata.
   */
  public scanLocalAudioDirectory(dirPath: string): AudiobookFile[] {
    if (!dirPath || !fs.existsSync(dirPath)) {
      return [];
    }

    const stat = fs.statSync(dirPath);
    const audioFiles: AudiobookFile[] = [];

    if (stat.isFile()) {
      const ext = path.extname(dirPath).toLowerCase();
      if (AUDIO_EXTENSIONS.has(ext)) {
        audioFiles.push({
          id: `audio_${path.basename(dirPath)}`,
          name: path.basename(dirPath, ext),
          path: dirPath,
          duration: 0,
          sizeBytes: stat.size,
        });
      }
      return audioFiles;
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

      const sortedEntries = entries
        .filter((e) => e.isFile() && AUDIO_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
        .sort((a, b) => collator.compare(a.name, b.name));

      for (let i = 0; i < sortedEntries.length; i++) {
        const entry = sortedEntries[i];
        const fullPath = path.join(dirPath, entry.name);
        try {
          const fileStat = fs.statSync(fullPath);
          const ext = path.extname(entry.name);
          const nameWithoutExt = path.basename(entry.name, ext);

          audioFiles.push({
            id: `track_${i + 1}_${nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
            name: nameWithoutExt,
            path: fullPath,
            duration: 0, // duration will be loaded by HTML5 audio element in renderer
            sizeBytes: fileStat.size,
          });
        } catch (e) {
          console.warn(`[AudiobookService] Failed to stat audio file: ${fullPath}`, e);
        }
      }
    } catch (err) {
      console.warn(`[AudiobookService] Failed to scan audio directory: ${dirPath}`, err);
    }

    return audioFiles;
  }

  /**
   * Queries an Audiobookshelf (ABS) server for library items / audiobooks.
   */
  public async queryAudiobookshelfItems(
    serverUrl: string,
    apiKey: string,
    query?: string
  ): Promise<any[]> {
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const searchUrl = `${cleanUrl}/api/libraries`;

    try {
      const response = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`ABS request failed with HTTP ${response.status}`);
      }

      const data = await response.json();
      const libraries = data.libraries || [];
      const bookLibraries = libraries.filter(
        (lib: any) => lib.mediaType === 'book' || !lib.mediaType
      );

      const items: any[] = [];
      for (const lib of bookLibraries) {
        const itemsUrl = `${cleanUrl}/api/libraries/${lib.id}/items?limit=100${
          query ? `&q=${encodeURIComponent(query)}` : ''
        }`;
        const itemsRes = await fetch(itemsUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (itemsRes.ok) {
          const itemsData = await itemsRes.json();
          const results = itemsData.results || [];
          for (const item of results) {
            items.push({
              id: item.id,
              title: item.media?.metadata?.title || item.name || 'Untitled',
              author: item.media?.metadata?.authorName || item.media?.metadata?.author || 'Unknown',
              duration: item.media?.duration || 0,
              tracks: item.media?.tracks || [],
              chapters: item.media?.chapters || [],
              serverUrl: cleanUrl,
            });
          }
        }
      }

      return items;
    } catch (err: any) {
      console.warn('[AudiobookService] ABS Query error:', err.message);
      return [];
    }
  }
}
