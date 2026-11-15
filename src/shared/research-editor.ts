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
  setMode?(mode: ManuscriptMode): Promise<void>;
  arrangeSources?(options?: { lang?: 'ar' | 'en' }): Promise<{ arranged: boolean; counts: Record<string, number>; frameIds?: string[] }>;
  undoArrange?(): Promise<boolean>;
  insertKanban?(title?: string, options?: { lang?: 'ar' | 'en' }): Promise<string>;
  insertSource?(kind: string, props: Record<string, unknown>): Promise<string>;
  /** KEY-373: the text selected in the editor, and appending plain paragraphs (research AI answers). */
  selectedText?(): string;
  insertParagraphs?(text: string): Promise<number>;
  fitToScreen?(): void;
  exportSources?(): Promise<{ markdown: string; html: string }>;
  scrollToBlock?(blockId: string): void;
  dispose(): void;
}
/** Parent-owned bridge. The iframe has no preload or IPC endpoint. */
export interface ResearchNoteSummary { id: string; title: string; content: string }
export interface ResearchEditorBridge {
  settings?: {
    load(manuscriptId: string): Promise<import('./research-editor-apparatus').ResearchSettings>;
    save(manuscriptId: string, settings: import('./research-editor-apparatus').ResearchSettings): Promise<void>;
  };
  sources?: ResearchSourceSearch;
  /** KEY-372: quick notes for live embeds; the note text is read, never copied into the manuscript. */
  notes?: {
    list(): Promise<ResearchNoteSummary[]>;
    get(id: string): Promise<ResearchNoteSummary | null>;
    open(id: string): Promise<void>;
    subscribe(listener: () => void): () => void;
  };
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
