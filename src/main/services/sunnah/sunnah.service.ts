import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzip } from 'fflate';
import { SUNNAH_COLLECTION_IDS, type SunnahCatalog, type SunnahChapter, type SunnahCollectionId } from '../../../shared/types/sunnah';
import { parseLkChapter } from './lk-corpus';

const entryPattern = /^(?:[^/]+\/)?(Bukhari|Muslim|AbuDaud|Tirmizi|Nesai|IbnMaja)\/Chapter(\d+)\.csv$/;

export class SunnahService {
  private initialization: Promise<SunnahCatalog | null> | null = null;
  private importing: Promise<SunnahCatalog> | null = null;
  private chapters = new Map<string, SunnahChapter>();

  constructor(private readonly root: string, private readonly defaultArchives: string[] = []) {}

  catalog(): Promise<SunnahCatalog | null> {
    if (!this.initialization) {
      this.initialization = this.initialize().catch(error => {
        this.initialization = null;
        throw error;
      });
    }
    return this.initialization;
  }

  private async initialize(): Promise<SunnahCatalog | null> {
    try {
      const catalog = JSON.parse(await readFile(path.join(this.root, 'catalog.json'), 'utf8')) as SunnahCatalog;
      if (catalog.version !== 1 || !/^[a-f0-9]{64}$/.test(catalog.sha256) || !Array.isArray(catalog.collections)) {
        throw new Error('Invalid Sunnah catalog');
      }
      return catalog;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    for (const archive of this.defaultArchives) {
      try { await access(archive); } catch { continue; }
      return this.importArchive(archive);
    }
    return null;
  }

  importArchive(archive: string): Promise<SunnahCatalog> {
    if (this.importing) return this.importing;
    this.importing = this.importInternal(archive).then(catalog => {
      this.initialization = Promise.resolve(catalog);
      this.chapters.clear();
      return catalog;
    }).finally(() => { this.importing = null; });
    return this.importing;
  }

  private async importInternal(archive: string): Promise<SunnahCatalog> {
    const info = await stat(archive);
    if (!info.isFile() || info.size > 64 * 1024 * 1024) throw new Error('Invalid corpus archive size');
    const bytes = await readFile(archive);
    let expandedBytes = 0;
    let entries = 0;
    let oversized = false;
    const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(bytes, {
        filter: file => {
          if (!entryPattern.test(file.name)) return false;
          expandedBytes += file.originalSize;
          entries++;
          if (file.originalSize > 16 * 1024 * 1024 || expandedBytes > 192 * 1024 * 1024 || entries > 1000) {
            oversized = true;
            return false;
          }
          return true;
        },
      }, (error, result) => error ? reject(error) : resolve(result));
    });
    if (oversized) throw new Error('Corpus exceeds import limits');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const catalog: SunnahCatalog = {
      version: 1, sha256: digest, importedAt: new Date().toISOString(), hadithCount: 0,
      collections: SUNNAH_COLLECTION_IDS.map(id => ({ id, hadithCount: 0, chapters: [] })),
    };
    await mkdir(this.root, { recursive: true });
    const staging = path.join(this.root, `.import-${randomUUID()}`);
    const temporaryCatalog = path.join(this.root, `.catalog-${randomUUID()}.json`);
    await mkdir(staging);
    try {
      for (const [entry, data] of Object.entries(files)) {
        const match = entryPattern.exec(entry)!;
        const collectionId = match[1] as SunnahCollectionId;
        const chapterNumber = Number(match[2]);
        if (!Number.isSafeInteger(chapterNumber) || chapterNumber > 1000) throw new Error('Invalid chapter number');
        const collection = catalog.collections.find(item => item.id === collectionId)!;
        if (collection.chapters.some(item => item.number === chapterNumber)) throw new Error('Duplicate chapter file');
        const chapter = parseLkChapter(new TextDecoder('utf-8', { fatal: true }).decode(data), collectionId, chapterNumber);
        collection.chapters.push({ number: chapter.number, title: chapter.title, hadithCount: chapter.hadithCount });
        collection.hadithCount += chapter.hadithCount;
        catalog.hadithCount += chapter.hadithCount;
        await writeFile(path.join(staging, `${collectionId}-${chapterNumber}.json`), JSON.stringify(chapter), 'utf8');
      }
      if (catalog.collections.some(item => !item.chapters.length)) throw new Error('All six collections are required');
      catalog.collections.forEach(item => item.chapters.sort((first, second) => first.number - second.number));
      const destination = path.join(this.root, digest);
      let destinationExists = false;
      try {
        await access(destination);
        destinationExists = true;
      } catch {}
      if (destinationExists) {
        for (const collection of catalog.collections) {
          for (const chapter of collection.chapters) {
            const filename = `${collection.id}-${chapter.number}.json`;
            await rename(path.join(staging, filename), path.join(destination, filename));
          }
        }
      } else await rename(staging, destination);
      await writeFile(temporaryCatalog, JSON.stringify(catalog), 'utf8');
      await rename(temporaryCatalog, path.join(this.root, 'catalog.json'));
      return catalog;
    } finally {
      await rm(staging, { recursive: true, force: true });
      await rm(temporaryCatalog, { force: true });
    }
  }

  async chapter(collection: SunnahCollectionId, number: number): Promise<SunnahChapter> {
    if (!SUNNAH_COLLECTION_IDS.includes(collection) || !Number.isSafeInteger(number) || number < 0) {
      throw new Error('Invalid Sunnah chapter');
    }
    const catalog = await this.catalog();
    if (!catalog?.collections.find(item => item.id === collection)?.chapters.some(item => item.number === number)) {
      throw new Error('Sunnah chapter not found');
    }
    const filename = `${collection}-${number}.json`;
    const key = `${catalog.sha256}:${filename}`;
    const cached = this.chapters.get(key);
    if (cached) {
      this.chapters.delete(key);
      this.chapters.set(key, cached);
      return cached;
    }
    const chapter = JSON.parse(await readFile(path.join(this.root, catalog.sha256, filename), 'utf8')) as SunnahChapter;
    this.chapters.set(key, chapter);
    if (this.chapters.size > 3) this.chapters.delete(this.chapters.keys().next().value!);
    return chapter;
  }
}
