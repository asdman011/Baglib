/*
 * Baglib — Library Repository Interfaces
 * Sprint 1 / Library Foundation
 *
 * Purpose:
 * - Define the stable boundary between Ammar's data layer and Monzer's UI.
 * - Keep the renderer/UI independent from SQLite tables and joins.
 * - Expose domain-oriented DTOs rather than persistence models.
 * - Allow the database implementation to change without changing the UI contract.
 *
 * Source of truth:
 * - ADR-001: Work -> Edition -> Source domain model
 * - ADR-002: Knowledge, Tags, Collections, Comments
 * - Baglib Library Domain Data Dictionary
 */

// -----------------------------------------------------------------------------
// Primitive / Shared Types
// -----------------------------------------------------------------------------

export type UUID = string;
export type ISODateTime = string;
export type ISODate = string;

export type WorkStatus =
  | "unread"
  | "reading"
  | "completed"
  | "paused"
  | "abandoned";

export type SourceType =
  | "linked_file"
  | "managed_file"
  | "physical"
  | "wishlist";

export type SourceStatus = "active" | "missing" | "wishlist";

export type KnowledgeType =
  | "note"
  | "highlight"
  | "quote"
  | "bookmark"
  | "question";

export type CollectionType = "manual" | "smart";

export type ContributorRole =
  | "author"
  | "translator"
  | "editor"
  | "narrator"
  | string;

// -----------------------------------------------------------------------------
// Library List DTOs
// These are intentionally UI-friendly and flattened.
// Monzer should use these instead of raw database rows.
// -----------------------------------------------------------------------------

export interface LibraryWorkListItem {
  id: UUID;
  title: string;
  workType: {
    id: UUID;
    name: string;
    icon?: string;
  };
  originalLanguage?: string;
  description?: string;

  cover?: {
    uri: string;
    alt?: string;
  };

  authors: Array<{
    id: UUID;
    name: string;
    role?: ContributorRole;
  }>;

  categories: Array<{
    id: UUID;
    name: string;
  }>;

  tags: Array<{
    id: UUID;
    name: string;
    origin?: "automatic" | "manual";
    category?: string;
  }>;

  editionsCount: number;
  sourcesCount: number;

  reading?: {
    status: WorkStatus;
    progress?: number;
    lastOpenedAt?: ISODateTime;
  };

  createdAt?: ISODateTime;
}

export interface WorkDetailsDTO extends LibraryWorkListItem {
  externalRef?: string;

  editions: EditionSummaryDTO[];

  knowledgeSummary: {
    notes: number;
    highlights: number;
    quotes: number;
    bookmarks: number;
    questions: number;
  };

  collections: Array<{
    id: UUID;
    name: string;
    collectionType: CollectionType;
  }>;
}

export interface EditionSummaryDTO {
  id: UUID;
  workId: UUID;
  label?: string;
  publicationYear?: number;
  language?: string;
  isbn?: string;

  publishers: Array<{
    id: UUID;
    name: string;
  }>;

  cover?: {
    uri: string;
    alt?: string;
  };

  sources: SourceSummaryDTO[];
}

export interface SourceSummaryDTO {
  id: UUID;
  editionId: UUID;
  type: SourceType;
  status: SourceStatus;
  addedAt?: ISODateTime;

  file?: {
    format?: string;
    uri?: string;
    isManaged: boolean;
    exists: boolean;
  };

  physical?: {
    shelf?: string;
    room?: string;
    condition?: string;
    lendingStatus?: string;
  };

  wishlist?: {
    priority?: number;
    targetFormat?: string;
    notes?: string;
  };
}

// -----------------------------------------------------------------------------
// Search DTOs
// -----------------------------------------------------------------------------

export interface LibrarySearchQuery {
  text?: string;
  workTypeIds?: UUID[];
  categoryIds?: UUID[];
  tagIds?: UUID[];
  authorIds?: UUID[];
  languages?: string[];
  publicationYearFrom?: number;
  publicationYearTo?: number;
  sourceTypes?: SourceType[];
  readingStatuses?: WorkStatus[];

  page?: number;
  pageSize?: number;

  sortBy?:
    | "title"
    | "author"
    | "recently_added"
    | "publication_year"
    | "last_opened";
  sortDirection?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
}

export interface LibrarySearchResult extends LibraryWorkListItem {
  matchedFields: Array<
    | "title"
    | "author"
    | "description"
    | "tag"
    | "category"
    | "isbn"
    | "external_ref"
    | "edition"
    | "file_content"
  >;
}

// -----------------------------------------------------------------------------
// Command/Input DTOs
// These are the shapes the UI sends into the application layer.
// -----------------------------------------------------------------------------

export interface CreateWorkInput {
  workTypeId: UUID;
  title: string;
  originalLanguage?: string;
  description?: string;
  externalRef?: string;
  authorIds?: UUID[];
  categoriesIds?: UUID[];
  tagIds?: UUID[];
}

export interface UpdateWorkInput {
  title?: string;
  originalLanguage?: string;
  description?: string;
  externalRef?: string;
}

export interface CreateEditionInput {
  workId: UUID;
  label?: string;
  publicationYear?: number;
  language?: string;
  isbn?: string;
  publisherIds?: UUID[];
}

export interface CreateSourceInput {
  editionId: UUID;
  type: SourceType;

  file?: {
    path: string;
    format?: string;
    isManaged: boolean;
  };

  physical?: {
    shelf?: string;
    room?: string;
    condition?: string;
    lendingStatus?: string;
    purchaseDate?: ISODate;
    price?: number;
  };

  wishlist?: {
    priority?: number;
    targetFormat?: string;
    notes?: string;
  };
}

// -----------------------------------------------------------------------------
// Primary Handoff Interface
// -----------------------------------------------------------------------------

/**
 * This is the primary interface Monzer's Library UI should consume.
 *
 * Renderer code should depend on an implementation adapter/service of this
 * interface, not on SQLite, SQL queries, table names, or ORM models.
 */
export interface LibraryRepository {
  // Queries ---------------------------------------------------------------

  getLibrary(options?: {
    page?: number;
    pageSize?: number;
    sortBy?: LibrarySearchQuery["sortBy"];
    sortDirection?: LibrarySearchQuery["sortDirection"];
  }): Promise<PaginatedResult<LibraryWorkListItem>>;

  getWork(workId: UUID): Promise<WorkDetailsDTO | null>;

  search(query: LibrarySearchQuery): Promise<PaginatedResult<LibrarySearchResult>>;

  getEditions(workId: UUID): Promise<EditionSummaryDTO[]>;

  getEdition(editionId: UUID): Promise<EditionSummaryDTO | null>;

  // Commands -------------------------------------------------------------

  createWork(input: CreateWorkInput): Promise<{ id: UUID }>;

  updateWork(workId: UUID, input: UpdateWorkInput): Promise<void>;

  deleteWork(workId: UUID): Promise<void>;

  restoreWork(workId: UUID): Promise<void>;

  createEdition(input: CreateEditionInput): Promise<{ id: UUID }>;

  deleteEdition(editionId: UUID): Promise<void>;

  attachSource(input: CreateSourceInput): Promise<{ id: UUID }>;

  detachSource(sourceId: UUID): Promise<void>;
}

// -----------------------------------------------------------------------------
// Specialized Repository Interfaces
// These are internal data/domain boundaries.
// Monzer should normally NOT call these directly.
// -----------------------------------------------------------------------------

export interface WorkRepository {
  findById(workId: UUID): Promise<WorkDetailsDTO | null>;
  findPage(options: {
    page: number;
    pageSize: number;
    sortBy?: LibrarySearchQuery["sortBy"];
    sortDirection?: LibrarySearchQuery["sortDirection"];
  }): Promise<PaginatedResult<LibraryWorkListItem>>;
  search(query: LibrarySearchQuery): Promise<PaginatedResult<LibrarySearchResult>>;

  create(input: CreateWorkInput): Promise<UUID>;
  update(workId: UUID, input: UpdateWorkInput): Promise<void>;
  softDelete(workId: UUID): Promise<void>;
  restore(workId: UUID): Promise<void>;
}

export interface EditionRepository {
  findById(editionId: UUID): Promise<EditionSummaryDTO | null>;
  findByWorkId(workId: UUID): Promise<EditionSummaryDTO[]>;
  create(input: CreateEditionInput): Promise<UUID>;
  delete(editionId: UUID): Promise<void>;
}

export interface SourceRepository {
  findById(sourceId: UUID): Promise<SourceSummaryDTO | null>;
  findByEditionId(editionId: UUID): Promise<SourceSummaryDTO[]>;
  attach(input: CreateSourceInput): Promise<UUID>;
  detach(sourceId: UUID): Promise<void>;
  markMissing(sourceId: UUID): Promise<void>;
  relinkFile(sourceId: UUID, newPath: string): Promise<void>;
}

export interface AuthorRepository {
  findById(authorId: UUID): Promise<{ id: UUID; name: string; birthYear?: string; deathYear?: string; bio?: string } | null>;
  search(name: string): Promise<Array<{ id: UUID; name: string }>>;
}

export interface PublisherRepository {
  findById(publisherId: UUID): Promise<{ id: UUID; name: string } | null>;
  search(name: string): Promise<Array<{ id: UUID; name: string }>>;
}

export interface TagRepository {
  findById(tagId: UUID): Promise<{ id: UUID; name: string; origin: "automatic" | "manual"; category?: string } | null>;
  search(name: string): Promise<Array<{ id: UUID; name: string; origin: "automatic" | "manual"; category?: string }>>;
}

export interface CollectionRepository {
  findById(collectionId: UUID): Promise<{
    id: UUID;
    name: string;
    description?: string;
    collectionType: CollectionType;
  } | null>;

  addWork(collectionId: UUID, workId: UUID): Promise<void>;
  removeWork(collectionId: UUID, workId: UUID): Promise<void>;

  addKnowledge(collectionId: UUID, knowledgeId: UUID): Promise<void>;
  removeKnowledge(collectionId: UUID, knowledgeId: UUID): Promise<void>;
}

export interface KnowledgeRepository {
  findById(knowledgeId: UUID): Promise<unknown | null>;
  findByWorkId(workId: UUID, options?: { type?: KnowledgeType }): Promise<unknown[]>;
}

export interface ReadingSessionRepository {
  listByWork(workId: UUID): Promise<unknown[]>;
  start(input: {
    workId: UUID;
    editionId: UUID;
  }): Promise<{ id: UUID }>;
  finish(sessionId: UUID, input: {
    endedAt: ISODateTime;
    pagesRead?: number;
    mood?: string;
  }): Promise<void>;
}

// -----------------------------------------------------------------------------
// Application Service / IPC Facade
// This is the recommended object exposed across Electron's IPC boundary.
// -----------------------------------------------------------------------------

export interface LibraryService {
  getLibrary(options?: Parameters<LibraryRepository["getLibrary"]>[0]): ReturnType<LibraryRepository["getLibrary"]>;
  getWork(workId: UUID): ReturnType<LibraryRepository["getWork"]>;
  search(query: LibrarySearchQuery): ReturnType<LibraryRepository["search"]>;

  createWork(input: CreateWorkInput): ReturnType<LibraryRepository["createWork"]>;
  updateWork(workId: UUID, input: UpdateWorkInput): ReturnType<LibraryRepository["updateWork"]>;
  deleteWork(workId: UUID): ReturnType<LibraryRepository["deleteWork"]>;

  createEdition(input: CreateEditionInput): ReturnType<LibraryRepository["createEdition"]>;
  attachSource(input: CreateSourceInput): ReturnType<LibraryRepository["attachSource"]>;
}

// -----------------------------------------------------------------------------
// Implementation rule
// -----------------------------------------------------------------------------
//
// Renderer/UI:
//   React -> LibraryService / IPC -> LibraryRepository -> SQLite
//
// Never:
//   React -> SQLite
//   React -> SQL
//   React -> table names
//
// The DTOs above are the stable contract between the two developers.
