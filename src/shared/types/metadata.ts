/**
 * Baglib — Comprehensive Metadata Model & Field Types
 *
 * Establishes a polymorphic Work domain model supporting:
 * Books, Research Papers, Articles, Lectures, Periodicals/Magazines,
 * Theses/Dissertations, Historical Manuscripts, Podcasts, and Videos.
 */

// ============================================================================
// 1. WORK TYPE DEFINITIONS & LOOKUP
// ============================================================================

export type WorkTypeKey =
  | 'book'
  | 'research_paper'
  | 'article'
  | 'lecture'
  | 'periodical'
  | 'thesis'
  | 'manuscript'
  | 'podcast'
  | 'video';

export interface WorkTypeInfo {
  id: string; // e.g. 'wt-book'
  key: WorkTypeKey;
  nameAr: string;
  nameEn: string;
  icon: string; // Lucide icon name
  descriptionAr: string;
  descriptionEn: string;
}

export const WORK_TYPES: Record<WorkTypeKey, WorkTypeInfo> = {
  book: {
    id: 'wt-book',
    key: 'book',
    nameAr: 'كتاب',
    nameEn: 'Book',
    icon: 'book-open',
    descriptionAr: 'كتب ومصنفات مطبوعة أو إلكترونية',
    descriptionEn: 'Printed or digital books and volumes',
  },
  research_paper: {
    id: 'wt-research-paper',
    key: 'research_paper',
    nameAr: 'بحث أكاديمي',
    nameEn: 'Research Paper',
    icon: 'file-text',
    descriptionAr: 'أوراق بحثية ومقالات علمية محكمة',
    descriptionEn: 'Academic and peer-reviewed research papers',
  },
  article: {
    id: 'wt-article',
    key: 'article',
    nameAr: 'مقالة',
    nameEn: 'Article',
    icon: 'newspaper',
    descriptionAr: 'مقالات صحفية وفكرية ودراسات قصيرة',
    descriptionEn: 'Journalistic articles, essays, and short studies',
  },
  lecture: {
    id: 'wt-lecture',
    key: 'lecture',
    nameAr: 'محاضرة',
    nameEn: 'Lecture',
    icon: 'presentation',
    descriptionAr: 'محاضرات مسجلة ودروس وندوات صوتية ومرئية',
    descriptionEn: 'Recorded lectures, talks, and instructional lessons',
  },
  periodical: {
    id: 'wt-periodical',
    key: 'periodical',
    nameAr: 'مجلة / دورية',
    nameEn: 'Periodical / Magazine',
    icon: 'layers',
    descriptionAr: 'مجلات وإصدارات دورية ونشرات علمية',
    descriptionEn: 'Magazines, journals, and periodic issues',
  },
  thesis: {
    id: 'wt-thesis',
    key: 'thesis',
    nameAr: 'رسالة علمية',
    nameEn: 'Thesis / Dissertation',
    icon: 'graduation-cap',
    descriptionAr: 'رسائل ماجستير وأطروحات دكتوراه وبحوث تخرج',
    descriptionEn: 'Master’s theses and doctoral dissertations',
  },
  manuscript: {
    id: 'wt-manuscript',
    key: 'manuscript',
    nameAr: 'مخطوطة',
    nameEn: 'Manuscript',
    icon: 'scroll',
    descriptionAr: 'مخطوطات أثرية ووثائق تاريخية نادرة',
    descriptionEn: 'Historical manuscripts and archival codices',
  },
  podcast: {
    id: 'wt-podcast',
    key: 'podcast',
    nameAr: 'بودكاست',
    nameEn: 'Podcast',
    icon: 'headphones',
    descriptionAr: 'حلقات وسلاسل بودكاست صوتية',
    descriptionEn: 'Audio podcast series and episodes',
  },
  video: {
    id: 'wt-video',
    key: 'video',
    nameAr: 'فيديو',
    nameEn: 'Video',
    icon: 'video',
    descriptionAr: 'تسجيلات ومرئيات وندوات مصورة',
    descriptionEn: 'Video recordings, documentaries, and visual talks',
  },
};

export const WORK_TYPE_ID_MAP: Record<string, WorkTypeKey> = {
  'wt-book': 'book',
  'wt-research-paper': 'research_paper',
  'wt-article': 'article',
  'wt-lecture': 'lecture',
  'wt-periodical': 'periodical',
  'wt-thesis': 'thesis',
  'wt-manuscript': 'manuscript',
  'wt-podcast': 'podcast',
  'wt-video': 'video',
};

// ============================================================================
// 2. CONTRIBUTORS & ROLES
// ============================================================================

export type ContributorRole =
  | 'author'        // مؤلف
  | 'co_author'     // مؤلف مشارك
  | 'translator'    // مترجم
  | 'editor'        // محقق / محرر
  | 'speaker'       // محاضر / متحدث
  | 'narrator'      // راوٍ / قارئ
  | 'commentator'   // شارح / معلق
  | 'advisor'       // مشرف علمي
  | 'scribe';       // ناسخ

export interface Contributor {
  id?: string;
  name: string;
  role: ContributorRole;
  birthYear?: string;
  deathYear?: string;
  bio?: string;
}

// ============================================================================
// 3. TYPE-SPECIFIC METADATA SCHEMAS
// ============================================================================

/** Metadata specific to Books */
export interface BookSpecificMetadata {
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  publisher?: string;
  edition?: string;
  volumeNumber?: string;
  totalVolumes?: number;
  pagesCount?: number;
  seriesTitle?: string;
}

/** Metadata specific to Academic & Research Papers */
export interface ResearchPaperSpecificMetadata {
  doi?: string;
  journalName?: string;
  conferenceName?: string;
  volume?: string;
  issue?: string;
  pagesRange?: string; // e.g. "120-145"
  abstract?: string;
  peerReviewed?: boolean;
  arxivId?: string;
  pmid?: string;
}

/** Metadata specific to Articles & Essays */
export interface ArticleSpecificMetadata {
  publicationName?: string;
  issueDate?: string;
  url?: string;
  section?: string;
}

/** Metadata specific to Lectures, Talks & Courses */
export interface LectureSpecificMetadata {
  speaker?: string;
  hostInstitution?: string;
  courseOrEventTitle?: string;
  durationMinutes?: number;
  recordingDate?: string;
  recordingUrl?: string;
  audioOrVideoUrl?: string;
}

/** Metadata specific to Magazines & Periodicals */
export interface PeriodicalSpecificMetadata {
  periodicalTitle?: string;
  issueNumber?: string | number;
  volumeNumber?: string | number;
  publicationSeasonOrMonth?: string;
  issn?: string;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
}

/** Metadata specific to Theses & Dissertations */
export interface ThesisSpecificMetadata {
  degreeLevel?: 'bachelor' | 'master' | 'phd' | string;
  institution?: string;
  facultyOrDepartment?: string;
  advisor?: string;
  defenseDate?: string;
}

/** Metadata specific to Historical Manuscripts */
export interface ManuscriptSpecificMetadata {
  holdingInstitution?: string;
  codexOrShelfmark?: string;
  scribe?: string;
  scriptType?: string; // e.g. 'نسخ' | 'كوفي' | 'ثلث' | 'رقعة' | 'مغربي'
  folioCount?: number | string;
  centuryOrEra?: string;
}

// ============================================================================
// 4. PHYSICAL HOLDINGS & LOCATION
// ============================================================================

export interface PhysicalLocation {
  room?: string;            // e.g. "المكتبة الرئيسية" / "Main Study"
  bookcase?: string;        // e.g. "خزانة رقم 3" / "Bookcase 3"
  shelf?: string;           // e.g. "رف أ1 - العلوم الشرعية" / "Shelf A1"
  shelfSection?: string;    // e.g. "الجزء العلوي" / "Top Section"
}

export type PhysicalCondition =
  | 'new'
  | 'like_new'
  | 'good'
  | 'fair'
  | 'poor'
  | 'antique';

export type PhysicalConditionAr =
  | 'جديدة'
  | 'ممتازة'
  | 'جيدة'
  | 'مستعملة'
  | 'أثرية/قديمة';

// ============================================================================
// 5. ACQUISITION & FINANCIAL TRACKING
// ============================================================================

export interface AcquisitionInfo {
  purchaseDate?: string;    // YYYY-MM-DD
  price?: string | number;
  currency?: string;        // e.g. 'IQD', 'USD', 'SAR'
  sourceOrStore?: string;   // e.g. "معرض بغداد للكتاب" / "Baghdad Book Fair"
  notes?: string;
}

// ============================================================================
// 6. LENDING & BORROWING TRACKING
// ============================================================================

export type LoanStatus = 'active' | 'returned' | 'overdue';

export interface LendingRecord {
  id: string;
  borrowerName: string;
  borrowerContact?: string;
  borrowDate: string;
  expectedReturnDate: string;
  actualReturnDate?: string;
  isReturned: boolean;
  conditionOnReturn?: string;
  notes?: string;
}

// ============================================================================
// 7. COMPOSITE CATALOG ITEM METADATA
// ============================================================================

export interface CatalogItemMetadata {
  workType: WorkTypeKey;
  workTypeId: string;
  title: string;
  subtitle?: string;
  originalTitle?: string;
  originalLanguage?: string;
  language: string;
  description?: string;
  contributors: Contributor[];
  publicationYear?: number | string;

  // Type-specific field slices
  book?: BookSpecificMetadata;
  paper?: ResearchPaperSpecificMetadata;
  article?: ArticleSpecificMetadata;
  lecture?: LectureSpecificMetadata;
  periodical?: PeriodicalSpecificMetadata;
  thesis?: ThesisSpecificMetadata;
  manuscript?: ManuscriptSpecificMetadata;

  // Operational slices
  physicalLocation?: PhysicalLocation;
  condition?: PhysicalCondition | PhysicalConditionAr;
  acquisition?: AcquisitionInfo;
  lendingHistory?: LendingRecord[];

  // Organization
  categories: string[];
  tags: string[];
}

// ============================================================================
// 8. HELPER UTILITIES & TYPE GUARDS
// ============================================================================

/** Resolves WorkTypeInfo by key or db ID ('book' or 'wt-book') */
export function getWorkTypeInfo(keyOrId?: string): WorkTypeInfo {
  if (!keyOrId) return WORK_TYPES.book;
  if (keyOrId in WORK_TYPES) {
    return WORK_TYPES[keyOrId as WorkTypeKey];
  }
  const mappedKey = WORK_TYPE_ID_MAP[keyOrId];
  if (mappedKey && mappedKey in WORK_TYPES) {
    return WORK_TYPES[mappedKey];
  }
  return WORK_TYPES.book;
}

/** Check if work is a book */
export function isBook(item: { workType?: string; workTypeId?: string }): boolean {
  const info = getWorkTypeInfo(item.workType || item.workTypeId);
  return info.key === 'book';
}

/** Check if work is an academic / research paper */
export function isResearchPaper(item: { workType?: string; workTypeId?: string }): boolean {
  const info = getWorkTypeInfo(item.workType || item.workTypeId);
  return info.key === 'research_paper';
}

/** Check if work is an article */
export function isArticle(item: { workType?: string; workTypeId?: string }): boolean {
  const info = getWorkTypeInfo(item.workType || item.workTypeId);
  return info.key === 'article';
}

/** Check if work is a lecture or speech */
export function isLecture(item: { workType?: string; workTypeId?: string }): boolean {
  const info = getWorkTypeInfo(item.workType || item.workTypeId);
  return info.key === 'lecture';
}

/** Check if work is a magazine or periodical */
export function isPeriodical(item: { workType?: string; workTypeId?: string }): boolean {
  const info = getWorkTypeInfo(item.workType || item.workTypeId);
  return info.key === 'periodical';
}

/** Check if work is a thesis or dissertation */
export function isThesis(item: { workType?: string; workTypeId?: string }): boolean {
  const info = getWorkTypeInfo(item.workType || item.workTypeId);
  return info.key === 'thesis';
}

/** Check if work is a historical manuscript */
export function isManuscript(item: { workType?: string; workTypeId?: string }): boolean {
  const info = getWorkTypeInfo(item.workType || item.workTypeId);
  return info.key === 'manuscript';
}
