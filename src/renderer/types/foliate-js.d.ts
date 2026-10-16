declare module 'foliate-js/epub.js' {
  export const EPUB: any;
}

declare module 'foliate-js/mobi.js' {
  export const MOBI: any;
  export const isMOBI: (file: any) => Promise<boolean>;
}

declare module 'foliate-js/fb2.js' {
  export const makeFB2: (file: any) => Promise<any>;
}

declare module 'foliate-js/comic-book.js' {
  export const makeComicBook: (loader: any, file: any) => Promise<any>;
}

declare module 'foliate-js/epubcfi.js' {
  export const CFI: any;
}

declare module 'foliate-js/view.js' {
  export const makeBook: (file: any) => Promise<any>;
}
