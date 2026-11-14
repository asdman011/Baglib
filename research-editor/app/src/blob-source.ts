import type { BlobSource } from '@blocksuite/affine/sync';
import type { ResearchEditorAssets } from '../../../src/shared/research-editor';

/** BlockSuite's only blob peer. No IndexedDB or shadow sources are installed. */
export class BaglibBlobSource implements BlobSource {
  name = 'baglib-manuscript-assets';
  readonly = false;
  private pending = new Set<Promise<unknown>>();
  constructor(private readonly assets: ResearchEditorAssets) {}
  async get(key: string): Promise<Blob | null> {
    const value = await this.assets.get(key);
    return value ? new Blob([new Uint8Array(value.bytes)], { type: value.type }) : null;
  }
  set(key: string, value: Blob): Promise<string> {
    const operation = value.arrayBuffer().then(bytes => this.assets.set(key, { bytes: new Uint8Array(bytes), type: value.type }));
    this.pending.add(operation);
    void operation.finally(() => this.pending.delete(operation)).catch(() => undefined);
    return operation;
  }
  delete(key: string): Promise<void> { return this.assets.delete(key); }
  list(): Promise<string[]> { return this.assets.list(); }
  async flush(): Promise<void> { await Promise.all([...this.pending]); }
}
