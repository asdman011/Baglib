import type { ResearchSourceSearch } from './research-editor-sources';
import type { ManuscriptDocument, ManuscriptMode } from './manuscripts';

export interface ResearchEditorAppearance {
  theme: 'dark' | 'light';
  lang: 'ar' | 'en';
  dir: 'rtl' | 'ltr';
  fontScale: number;
}
export interface ResearchEditorBlob { bytes: Uint8Array; type: string }
export interface ResearchEditorAssets {
  get(id: string): Promise<ResearchEditorBlob | null>;
  set(id: string, value: ResearchEditorBlob): Promise<string>;
  delete(id: string): Promise<void>;
  list(): Promise<string[]>;
}
export interface ResearchEditorAPI {
  available(): Promise<boolean>;
  blobs: ResearchEditorAssets;
}
export interface ResearchEditorSession {
  load(document: ManuscriptDocument): Promise<void>;
  flush(): Promise<void>;
  setReadonly?(value: boolean): void;
  dispose(): void;
}
/** Parent-owned bridge. The iframe has no preload or IPC endpoint. */
export interface ResearchEditorBridge {
  sources?: ResearchSourceSearch;
  appearance(): ResearchEditorAppearance;
  subscribeAppearance(listener: (appearance: ResearchEditorAppearance) => void): () => void;
  connect(session: ResearchEditorSession): Promise<void>;
  change(id: string, snapshot: string, mode: ManuscriptMode): void;
  explicitSave(): Promise<void>;
  error(error: unknown): void;
  blobs: ResearchEditorAssets;
}
export function validateResearchBlobId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}={0,2}$/.test(value)) throw new Error('invalid-blob-id');
}
/** Runs synchronously before the editor is appended, and for each host appearance update. */
export function applyResearchEditorAppearance(root: HTMLElement, value: ResearchEditorAppearance): void {
  root.lang = value.lang;
  root.dir = value.dir;
  root.dataset.theme = value.theme;
  root.setAttribute('data-theme', value.theme);
  root.classList.toggle('dark', value.theme === 'dark');
  root.style.colorScheme = value.theme;
  root.style.setProperty('--baglib-font-scale', String(value.fontScale));
  root.style.setProperty('--affine-font-base', `${16 * value.fontScale}px`);
  root.style.fontSize = `${16 * value.fontScale}px`;
}
