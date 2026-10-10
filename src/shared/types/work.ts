import type {
  WorkTypeKey,
  WorkTypeInfo,
  Contributor,
  ContributorRole,
  BookSpecificMetadata,
  ResearchPaperSpecificMetadata,
  ArticleSpecificMetadata,
  LectureSpecificMetadata,
  PeriodicalSpecificMetadata,
  ThesisSpecificMetadata,
  ManuscriptSpecificMetadata,
  PhysicalLocation,
  PhysicalCondition,
  AcquisitionInfo,
  LendingRecord
} from './metadata';


export * from './metadata';

export type DigitalFormat = 'PDF' | 'EPUB' | 'MOBI' | 'AZW3' | 'HTML' | 'TXT';
export type BookCondition = 'جديدة' | 'ممتازة' | 'جيدة' | 'مستعملة' | 'أثرية/قديمة';
export type BookType = 'digital' | 'physical' | 'hybrid';
export type ReadingStatus = 'unread' | 'reading' | 'completed' | 'paused' | 'abandoned';


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
  readingStatus?: ReadingStatus;
  readingProgress?: number;

  // Work Type Classification
  workTypeId?: string;                  // e.g. 'wt-book', 'wt-research-paper'
  workType?: WorkTypeKey | string;      // e.g. 'book', 'research_paper', 'lecture'

  // Type-Specific Attributes
  // 1. Research Papers & Articles
  doi?: string;
  journalName?: string;
  conferenceName?: string;
  abstract?: string;
  peerReviewed?: boolean;
  arxivId?: string;
  pagesRange?: string;

  // 2. Articles
  publicationName?: string;
  issueDate?: string;

  // 3. Lectures & Talks
  speaker?: string;
  hostInstitution?: string;
  courseOrEventTitle?: string;
  durationMinutes?: number;
  recordingUrl?: string;

  // 4. Periodicals & Magazines
  periodicalTitle?: string;
  issueNumber?: string | number;
  volumeNumber?: string | number;
  publicationSeasonOrMonth?: string;
  issn?: string;

  // 5. Theses & Academic Degrees
  degreeLevel?: string;
  facultyOrDepartment?: string;
  advisor?: string;
  defenseDate?: string;

  // 6. Manuscripts
  holdingInstitution?: string;
  codexOrShelfmark?: string;
  scribe?: string;
  scriptType?: string;
  folioCount?: number | string;

  // Contributors breakdown
  contributors?: Contributor[];

  // Physical Location
  shelf?: string;
  room?: string;
  bookcase?: string;
  shelfSection?: string;
  physicalLocation?: PhysicalLocation;

  // Categorization
  language: 'العربية' | 'English' | string;
  categories: string[];
  primaryCategory?: {
    id: string;
    nameAr: string;
    nameEn: string;
  } | null;
  tags: string[];

  // Physical & Financial Metadata
  purchaseDate?: string;
  price?: string;
  condition?: BookCondition | PhysicalCondition;
  acquisition?: AcquisitionInfo;
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
  readingStatus?: ReadingStatus;
  readingProgress?: number;

  // Work Type Classification
  workTypeId?: string;
  workType?: string;

  // Type-Specific Attributes
  doi?: string;
  journalName?: string;
  conferenceName?: string;
  abstract?: string;
  peerReviewed?: boolean;
  arxivId?: string;
  pagesRange?: string;
  publicationName?: string;
  issueDate?: string;
  speaker?: string;
  hostInstitution?: string;
  courseOrEventTitle?: string;
  durationMinutes?: number;
  recordingUrl?: string;
  periodicalTitle?: string;
  issueNumber?: string | number;
  volumeNumber?: string | number;
  publicationSeasonOrMonth?: string;
  issn?: string;
  degreeLevel?: string;
  facultyOrDepartment?: string;
  advisor?: string;
  defenseDate?: string;
  holdingInstitution?: string;
  codexOrShelfmark?: string;
  scribe?: string;
  scriptType?: string;
  folioCount?: number | string;
  contributors?: Contributor[];

  // Location & Categorization
  shelf?: string;
  room?: string;
  bookcase?: string;
  shelfSection?: string;
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
  lendingHistory?: LendingRecord[];
  onlineSource?: string;
  sourceUrl?: string;
}


