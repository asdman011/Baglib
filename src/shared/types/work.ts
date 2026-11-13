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

export type DigitalFormat =
  | 'PDF'
  | 'EPUB'
  | 'MOBI'
  | 'AZW3'
  | 'AZW'
  | 'FB2'
  | 'FBZ'
  | 'CBZ'
  | 'CBR'
  | 'CBT'
  | 'CB7'
  | 'HTML'
  | 'TXT'
  | 'MD'
  | 'DOCX'
  | 'mp4' | 'm4v' | 'mov' | 'mkv' | 'webm'
  | 'mp3' | 'm4a' | 'ogg' | 'opus' | 'wav';
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

export interface MetadataProvenance {
  primaryProvider?: string;
  providerId?: string;
  sourceUrl?: string;
  discoveredAt?: string;
  method?: 'online_api' | 'offline_embedded' | 'offline_filename' | 'manual' | 'hybrid';
  confidence?: number;
  fieldSources?: Record<string, {
    source: string;
    status: 'verified' | 'extracted' | 'calculated' | 'fallback' | 'user_override';
    value?: unknown;
    confidence?: number;
    rawMatch?: string;
  }>;
  apiQueries?: {
    provider: string;
    endpoint: string;
    query: string;
    timestamp: string;
    status: number | string;
    latencyMs?: number;
  }[];
  auditTrace?: string[];
  rawBibliographic?: unknown;
}

/** Read-only projection of the existing Work → Edition → Source records. */
export interface BookDetailSummary {
  notes: number;
  cards: number;
  editions: {
    id: string;
    label: string | null;
    publisher: string | null;
    publicationYear: number | null;
    language: string | null;
    isbn: string | null;
    sources: {
      id: string;
      editionId: string;
      type: string;
      status: string | null;
      filePath: string | null;
      format: string | null;
      shelf: string | null;
      room: string | null;
    }[];
  }[];
}

export interface BookItem {
  id: string;
  /** Identity of the edition/source projected with filePath, never inferred from the filename. */
  editionId?: string;
  sourceId?: string;
  sourceCount?: number;
  title: string;
  author: string;
  seriesTitle?: string;
  totalVolumes?: number;
  edition?: string;
  editionRawMatch?: string;
  editionSource?: string;
  editionConfidence?: number;
  publisher?: string;
  publicationYear?: number | string;
  isbn?: string;
  coverImage?: string;
  pagesCount?: number;
  readingStatus?: ReadingStatus;
  readingProgress?: number;
  lastReadLocation?: string;
  createdAt?: string;
  deletedAt?: string;

  // General Description & Author Bio
  description?: string;
  authorBio?: string;

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
  recordingDate?: string;

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
  language?: 'العربية' | 'English' | string;
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
  fileHash?: string;
  isDuplicate?: boolean;
  storageState?: 'healthy' | 'available' | 'missing' | 'corrupted' | 'unmounted' | 'duplicate';
  lastVerifiedAt?: string;

  // Online / Auto-fill Info
  onlineSource?: 'Shamela' | 'Noor Library' | 'LibGen' | 'Anna Archive' | 'Inoreader' | 'Manual';
  sourceUrl?: string;

  // Metadata Diagnostics & Geek Provenance
  metadataProvenance?: MetadataProvenance;
}

export interface BookItemInput {
  id?: string;
  title: string;
  author?: string;
  seriesTitle?: string;
  totalVolumes?: number;
  edition?: string;
  editionRawMatch?: string;
  editionSource?: string;
  editionConfidence?: number;
  publisher?: string;
  publicationYear?: number | string;
  isbn?: string;
  coverImage?: string;
  pagesCount?: number;
  readingStatus?: ReadingStatus;
  readingProgress?: number;
  lastReadLocation?: string;
  createdAt?: string;
  deletedAt?: string;

  // General Description & Author Bio
  description?: string;
  authorBio?: string;

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
  recordingDate?: string;
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

  acquisition?: BookItem['acquisition'];
  physicalLocation?: BookItem['physicalLocation'];

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
  fileHash?: string;
  lendingHistory?: LendingRecord[];
  onlineSource?: string;
  sourceUrl?: string;
  metadataProvenance?: MetadataProvenance;
}


