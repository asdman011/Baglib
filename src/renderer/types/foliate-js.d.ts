declare module 'foliate-js/epub.js' {
  export interface FoliateTOC { id?: string | number; label?: string; title?: string; href?: string; index?: number; subitems?: FoliateTOC[]; children?: FoliateTOC[]; }
  export type FoliateBook = Omit<import('../libs/reader/types').BookDoc, 'metadata' | 'toc'> & {
    metadata: Omit<import('../libs/reader/types').BookMetadata, 'author'> & { author?: string | { name?: string } };
    toc?: FoliateTOC[];
  };
  export class EPUB {
    constructor(loader: { loadText(name: string): Promise<string | null>; loadBlob(name: string): Promise<Blob | null>; getSize(name: string): number; sha1?: unknown });
    init(): Promise<FoliateBook>;
  }
}
declare module 'foliate-js/mobi.js' {
  export class MOBI {
    constructor(options: { unzlib: typeof import('fflate').unzlibSync });
    open(bytes: Uint8Array): Promise<import('../libs/reader/types').BookDoc>;
  }
  export const isMOBI: (file: Blob) => Promise<boolean>;
}
declare module 'foliate-js/fb2.js' {
  export const makeFB2: (file: Blob) => Promise<import('../libs/reader/types').BookDoc>;
}
declare module 'foliate-js/comic-book.js' {
  export const makeComicBook: (loader: unknown, file: Blob) => Promise<import('../libs/reader/types').BookDoc>;
}
declare module 'foliate-js/epubcfi.js' {
  export const CFI: { fromRange(range: Range): string; toRange(doc: Document, cfi: string): Range };
}
declare module 'foliate-js/view.js' {
  export const makeBook: (file: Blob) => Promise<import('../libs/reader/types').BookDoc>;
}
