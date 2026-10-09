/**
 * Baglib — Work Domain Types & Contracts
 */

export type DigitalFormat = 'PDF' | 'EPUB' | 'MOBI' | 'AZW3' | 'HTML' | 'TXT';
export type BookCondition = 'جديدة' | 'ممتازة' | 'جيدة' | 'مستعملة' | 'أثرية/قديمة';
export type BookType = 'digital' | 'physical' | 'hybrid';

export interface LendingRecord {
  id: string;
  borrowerName: string;
  borrowDate: string;
  expectedReturnDate: string;
  actualReturnDate?: string;
  isReturned: boolean;
  notes?: string;
}

export interface Work {
  id: string;
  workTypeId: string;
  title: string;
  originalLanguage?: string;
  description?: string;
  externalRef?: string;
  createdAt: string;
  primaryCategoryId: string | null;
}

export interface WorkDTO extends Work {
  primaryCategory?: {
    id: string;
    nameAr: string;
    nameEn: string;
  } | null;
}

export interface BookItem {
  id: string;
  title: string;
  author: string;
  edition?: string;
  publisher?: string;
  publicationYear?: number | string;
  isbn?: string;
  coverImage?: string;
  pagesCount?: number;

  // Physical Location
  shelf?: string;
  room?: string;

  // Categorization
  language: 'العربية' | 'English' | string;
  categories: string[];
  primaryCategory?: {
    id: string;
    nameAr: string;
    nameEn: string;
  } | null;
  tags: string[];

  // Physical Metadata
  purchaseDate?: string;
  price?: string;
  condition?: BookCondition;
  lendingHistory: LendingRecord[];

  // Digital Metadata
  bookType: BookType;
  digitalFormat?: DigitalFormat;
  filePath?: string;
  fileSize?: string;
  isDuplicate?: boolean;

  // Online / Auto-fill Info
  onlineSource?: 'Shamela' | 'Noor Library' | 'LibGen' | 'Anna Archive' | 'Inoreader' | 'Manual';
  sourceUrl?: string;
}

export interface BookItemInput {
  id?: string;
  title: string;
  author: string;
  edition?: string;
  publisher?: string;
  publicationYear?: number | string;
  isbn?: string;
  coverImage?: string;
  pagesCount?: number;
  shelf?: string;
  room?: string;
  language?: string;
  categories?: string[];
  primaryCategory?: {
    id: string;
    nameAr?: string;
    nameEn?: string;
  } | null;
  primaryCategoryId?: string | null;
  tags?: string[];
  purchaseDate?: string;
  price?: string;
  condition?: string;
  bookType?: 'digital' | 'physical' | 'hybrid';
  digitalFormat?: string;
  filePath?: string;
  fileSize?: string;
  onlineSource?: string;
  sourceUrl?: string;
}
