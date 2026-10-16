export interface ClippedImage {
  src: string;
  localPath: string;
  mimeType: string;
  data: Uint8Array | Buffer;
}

export interface EpubChapterInput {
  title: string;
  contentHtml: string;
  index: number;
}

export interface ClippedArticle {
  title: string;
  byline?: string;
  excerpt?: string;
  siteName?: string;
  url: string;
  content: string;
  textContent: string;
  length: number;
  language?: string;
  publishedTime?: string;
  coverImage?: string;
  images: string[];
}

export interface ClipOptions {
  url: string;
  html?: string;
  targetFormat?: 'epub' | 'markdown';
  downloadImages?: boolean;
  customTitle?: string;
  customAuthor?: string;
  language?: string;
  importToLibrary?: boolean;
}

export interface SerializedChapterItem {
  title: string;
  url: string;
  content?: string;
  index: number;
}

export interface SerializedNovelOptions {
  url: string;
  title?: string;
  author?: string;
  coverUrl?: string;
  chapterUrls?: string[];
  chapterListSelector?: string;
  chapterContentSelector?: string;
  concurrency?: number;
  downloadImages?: boolean;
  importToLibrary?: boolean;
}

export interface ClipProgressEvent {
  stage: 'fetching' | 'extracting' | 'assets' | 'packaging' | 'importing' | 'completed' | 'error';
  currentChapter?: number;
  totalChapters?: number;
  currentAsset?: number;
  totalAssets?: number;
  message?: string;
}

export interface ClipResult {
  success: boolean;
  workId?: string;
  title?: string;
  author?: string;
  filePath?: string;
  fileName?: string;
  fileSizeBytes?: number;
  chapterCount: number;
  imageCount: number;
  format: 'epub' | 'markdown';
  error?: string;
}
