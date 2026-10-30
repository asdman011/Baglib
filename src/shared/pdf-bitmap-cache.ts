export interface PdfBitmap { width: number; height: number; close(): void }

export class PdfBitmapCache<Bitmap extends PdfBitmap> {
  private entries = new Map<string, Bitmap>();
  private bytes = 0;
  private disposed = false;

  constructor(private maxPages = 25, private maxBytes = 128 * 1024 * 1024) {}

  get(key: string): Bitmap | undefined {
    const bitmap = this.entries.get(key);
    if (bitmap) { this.entries.delete(key); this.entries.set(key, bitmap); }
    return bitmap;
  }

  preview(prefix: string): Bitmap | undefined {
    const key = [...this.entries.keys()].reverse().find(candidate => candidate.startsWith(prefix));
    return key === undefined ? undefined : this.get(key);
  }

  set(key: string, bitmap: Bitmap): void {
    const cost = bitmap.width * bitmap.height * 4;
    if (this.disposed || cost > this.maxBytes || this.maxPages < 1) { bitmap.close(); return; }
    this.remove(key);
    this.entries.set(key, bitmap);
    this.bytes += cost;
    while (this.entries.size > this.maxPages || this.bytes > this.maxBytes) this.remove(this.entries.keys().next().value!);
  }

  private remove(key: string): void {
    const bitmap = this.entries.get(key);
    if (!bitmap) return;
    this.entries.delete(key);
    this.bytes -= bitmap.width * bitmap.height * 4;
    bitmap.close();
  }

  dispose(): void {
    this.disposed = true;
    for (const key of this.entries.keys()) this.remove(key);
  }
}
