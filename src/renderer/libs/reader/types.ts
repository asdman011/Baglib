export type BookFormat =
  | 'EPUB'
  | 'PDF'
  | 'MOBI'
  | 'AZW'
  | 'AZW3'
  | 'FB2'
  | 'FBZ'
  | 'CBZ'
  | 'CBR'
  | 'CBT'
  | 'CB7'
  | 'HTML'
  | 'TXT'
  | 'MD'
  | 'DOCX';

export interface TOCItem {
  id: string | number;
  label: string;
  href: string;
  index: number;
  cfi?: string;
  subitems?: TOCItem[];
}

export interface SectionItem {
  id: string;
  cfi?: string;
  size: number;
  linear?: string;
  href?: string;
  pageSpread?: 'left' | 'right' | 'center' | '';
  loadText?: () => Promise<string | null>;
  loadBlob?: () => Promise<Blob | null>;
  createDocument?: () => Promise<Document>;
  unload?: () => void;
  load?: () => Promise<string>;
}

export interface BookMetadata {
  title: string;
  author?: string;
  language?: string | string[];
  editor?: string;
  publisher?: string;
  published?: string;
  description?: string;
  subject?: string | string[];
  identifier?: string;
  isbn?: string;
  coverImageUrl?: string;
  coverImageBlob?: Blob;
  series?: string;
  seriesIndex?: number;
}

export interface BookDoc {
  metadata: BookMetadata;
  rendition: {
    on?: (event: string, callback: () => void) => void;
    off?: (event: string, callback: () => void) => void;
    next?: () => void;
    prev?: () => void;
    annotations?: { highlight(cfi: string, data: unknown, callback: (event: MouseEvent) => void, className?: string, styles?: Record<string, string>): void; add(type: string, cfi: string, data: unknown, callback: (event: Event) => void, className?: string, styles?: Record<string, string>): void; remove(cfi: string, type: string): void };
    layout?: 'pre-paginated' | 'reflowable';
    spread?: 'auto' | 'none';
    viewport?: { width: number; height: number };
  };
  dir: 'rtl' | 'ltr';
  toc?: TOCItem[];
  pageList?: TOCItem[];
  sections: SectionItem[];
  splitTOCHref?: (href: string) => Array<string | number>;
  resolveHref?: (href: string) => { index: number; anchor?: (doc: Document) => unknown } | null;
  resolveCFI?: (cfi: string) => { index: number; anchor?: (doc: Document) => Range | number } | null;
  getCover?: () => Promise<Blob | null>;
  destroy?: () => void | Promise<void>;
  loadText?: (href: string) => Promise<string | null>;
  loadBlob?: (href: string) => Promise<Blob | null>;
}

export interface DocumentLoaderOptions {
  nativeFilePath?: string;
  languageHint?: string;
  theme?: ReaderTheme;
}

export type ReaderViewMode = 'single' | 'two-column' | 'scrolled';
export type ReaderTheme = 'paper' | 'sepia' | 'dusk' | 'midnight' | 'light' | 'dark' | 'night' | 'e-ink';
export type FocusAidMode = 'none' | 'ruler' | 'paragraph' | 'rsvp';

export interface ReaderViewportSettings {
  viewMode: ReaderViewMode;
  theme: ReaderTheme;
  fontFamily: string;
  fontSize: number; // in px, e.g. 18
  lineSpacing: number; // e.g. 1.85
  paragraphSpacing: number; // in em, e.g. 1.2
  margin: number; // in px, e.g. 32
  brightness: number; // 50 to 150 (percentage)
  contrast: number; // 50 to 150 (percentage)
  wideComicSpread: boolean;
}

export interface RulerLineBox {
  start: number;
  end: number;
}

export interface RSVPWordToken {
  text: string;
  orpIndex: number;
  pauseMultiplier: number;
  isRTL: boolean;
}

export interface RSVPState {
  words: RSVPWordToken[];
  currentIndex: number;
  wpm: number;
  isPlaying: boolean;
}

