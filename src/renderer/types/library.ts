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
  shelf?: string;       // e.g. "رف أ1 - العلوم الشرعية"
  room?: string;        // e.g. "المكتبة الرئيسية"
  
  // Categorization
  language: 'العربية' | 'English' | string;
  categories: string[];
  tags: string[];
  
  // Physical Metadata
  purchaseDate?: string;
  price?: string;
  condition?: BookCondition;
  lendingHistory: LendingRecord[];
  
  // Digital Metadata
  bookType: BookType;
  digitalFormat?: DigitalFormat;
  filePath?: string;     // Direct local file path (no Calibre copy)
  fileSize?: string;
  isDuplicate?: boolean;
  
  // Online / Auto-fill Info
  onlineSource?: 'Shamela' | 'Noor Library' | 'LibGen' | 'Anna Archive' | 'Inoreader' | 'Manual';
  sourceUrl?: string;
}

export interface RssFeedItem {
  id: string;
  title: string;
  source: string; // e.g. "Inoreader - مجلة الدراسات الإسلامية"
  snippet: string;
  date: string;
  url: string;
  category: string;
}
