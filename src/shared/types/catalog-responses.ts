/** Wire shapes consumed by the catalog adapters; not canonical stored metadata. */
export interface GoogleVolume {
  id: string;
  volumeInfo?: {
    title?: string; authors?: string[]; description?: string; publishedDate?: string;
    publisher?: string; pageCount?: number; language?: string; infoLink?: string; previewLink?: string;
    categories?: string[]; industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: Partial<Record<'extraLarge' | 'large' | 'medium' | 'thumbnail' | 'small' | 'smallThumbnail', string>>;
  };
}
export interface GoogleVolumes { items?: GoogleVolume[]; totalItems?: number; }
export interface OpenLibrarySearchDoc {
  key: string; title: string; edition_key?: string[]; first_publish_year?: number;
  publisher?: string[]; isbn?: string[]; cover_i?: number; language?: string[];
  author_name?: string[]; subject?: string[]; author_key?: string[]; cover_edition_key?: string; publish_year?: number[];
  number_of_pages_median?: number;
}
export interface OpenLibraryEdition {
  key: string; title: string; edition_name?: string; publish_date?: string; publishers?: string[];
  isbn_13?: string[]; isbn_10?: string[]; number_of_pages?: number; covers?: number[];
  languages?: { key: string }[]; description?: string | { value: string };
}
export interface OpenLibraryWork {
  title: string; authors?: { author?: { key: string } }[];
  description?: string | { value: string }; subjects?: string[];
}
export interface OpenLibraryBook {
  key?: string; title: string; publish_date?: string; url?: string;
  authors?: { name: string }[]; publishers?: { name: string }[];
  identifiers?: { openlibrary?: string[] }; number_of_pages?: number;
  cover?: { large?: string };
}
export interface ArchiveDoc {
  identifier?: string; title?: string; creator?: string | string[];
  year?: string | number; date?: string; isbn?: string | string[];
  publisher?: string | string[]; language?: string | string[];
  description?: string | string[]; subject?: string | string[];
  [field: string]: unknown;
}
export interface ArchiveSearch { response?: { docs?: ArchiveDoc[]; numFound?: number }; }
export interface ArchiveMetadata { metadata?: ArchiveDoc; files?: { name: string; format?: string; size?: string }[]; }
