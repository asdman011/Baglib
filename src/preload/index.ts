import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { SunnahAPI } from '../shared/types/sunnah';
import type { QuranAPI } from '../shared/types/quran';
import type { AthanAPI, AthanAlertPayload, PrayerStatusSnapshot } from '../shared/types/athan';
import type { StudyNoteInput } from '../shared/study-notes';
import type { PdfEditorAPI } from '../shared/types/pdf-editor';
import type { PdfCloudAPI } from '../shared/types/pdf-cloud';
import type { PdfCollaborationAPI } from '../shared/types/pdf-collaboration';

const athan: AthanAPI = {
  getState: () => ipcRenderer.invoke('athan:get-state'),
  updateSettings: (partial) => ipcRenderer.invoke('athan:update-settings', partial),
  detectAutoLocation: () => ipcRenderer.invoke('athan:detect-auto-location'),
  syncMawaqit: (mosqueIdOrSlug) => ipcRenderer.invoke('athan:sync-mawaqit', mosqueIdOrSlug),
  triggerTestAlert: (prayer, type) => ipcRenderer.invoke('athan:trigger-test-alert', prayer, type),
  toggleMiniWidget: () => ipcRenderer.invoke('athan:toggle-mini-widget'),
  chooseRecording: () => ipcRenderer.invoke('athan:choose-recording'),
  onAlert: (callback) => {
    const sub = (_: unknown, payload: AthanAlertPayload) => callback(payload);
    ipcRenderer.on('athan:alert', sub);
    return () => { ipcRenderer.removeListener('athan:alert', sub); };
  },
  onStateChanged: (callback) => {
    const sub = (_: unknown, state: PrayerStatusSnapshot) => callback(state);
    ipcRenderer.on('athan:state-changed', sub);
    return () => { ipcRenderer.removeListener('athan:state-changed', sub); };
  },
};

const quran: QuranAPI = {
  khatmahList: () => ipcRenderer.invoke('quran:khatmah-list'),
  khatmahMutate: query => ipcRenderer.invoke('quran:khatmah-mutate', query),
  signIn: () => ipcRenderer.invoke('quran:sign-in'),
  inspectAyah: query => ipcRenderer.invoke('quran:inspect-ayah', query),
  downloadBatch: ids => ipcRenderer.invoke('quran:download-batch', ids),
  downloadRecitation: query => ipcRenderer.invoke('quran:download-recitation', query),
  copyText: text => ipcRenderer.invoke('quran:copy', text),
  readerCatalog: () => ipcRenderer.invoke('quran:reader-catalog'),
  read: query => ipcRenderer.invoke('quran:read', query),
  searchAyahs: query => ipcRenderer.invoke('quran:search-ayahs', query),
  frequency: query => ipcRenderer.invoke('quran:frequency', query),
  frequencyPlaces: query => ipcRenderer.invoke('quran:frequency-places', query),
  commentary: query => ipcRenderer.invoke('quran:commentary', query),
  mushafPage: query => ipcRenderer.invoke('quran:mushaf-page', query),
  mushafPageForAyah: query => ipcRenderer.invoke('quran:mushaf-page-for-ayah', query),
  recitationAudio: query => ipcRenderer.invoke('quran:recitation-audio', query),
  recitationSurah: query => ipcRenderer.invoke('quran:recitation-surah', query),
  cacheAudio: query => ipcRenderer.invoke('quran:cache-audio', query),
  surahAudioStatus: query => ipcRenderer.invoke('quran:surah-audio-status', query),
  downloadSurahAudio: query => ipcRenderer.invoke('quran:download-surah-audio', query),
  surahIntro: query => ipcRenderer.invoke('quran:surah-intro', query),
  ayahThemes: query => ipcRenderer.invoke('quran:ayah-themes', query),
  morphology: query => ipcRenderer.invoke('quran:morphology', query),
  mutashabihat: query => ipcRenderer.invoke('quran:mutashabihat', query),
  ayahTopics: query => ipcRenderer.invoke('quran:ayah-topics', query),
  searchTopics: query => ipcRenderer.invoke('quran:search-topics', query),
  topics: query => ipcRenderer.invoke('quran:topics', query),
  structure: () => ipcRenderer.invoke('quran:structure'),
  similarAyahs: query => ipcRenderer.invoke('quran:similar-ayahs', query),
  setup: ids => ipcRenderer.invoke('quran:setup', ids),
  library: query => ipcRenderer.invoke('quran:library', query),
  refresh: category => ipcRenderer.invoke('quran:refresh', category),
  download: id => ipcRenderer.invoke('quran:download', id),
  importFile: id => ipcRenderer.invoke('quran:import', id),
  cancel: id => ipcRenderer.invoke('quran:cancel', id),
  remove: id => ipcRenderer.invoke('quran:remove', id),
  chooseDirectory: () => ipcRenderer.invoke('quran:directory'),
  onChanged: listener => { const handler = () => listener(); ipcRenderer.on('quran:changed', handler); return () => { ipcRenderer.removeListener('quran:changed', handler); }; },
};

const sunnah: SunnahAPI = {
  share: text => ipcRenderer.invoke('sunnah:share', text),
  catalog: () => ipcRenderer.invoke('sunnah:catalog'),
  research: id => ipcRenderer.invoke('sunnah:research', id),
  openSource: (id, kind) => ipcRenderer.invoke('sunnah:source', id, kind),
  narrator: id => ipcRenderer.invoke('sunnah:narrator', id),
  search: query => ipcRenderer.invoke('sunnah:search', query),
  statistics: () => ipcRenderer.invoke('sunnah:statistics'),
  importCorpus: language => ipcRenderer.invoke('sunnah:import', language),
  chapter: (collection, number) => ipcRenderer.invoke('sunnah:chapter', collection, number),
};

export const API = {
  athan,
  quran,
  sunnah,
  poetry: {
    saveKnowledge: (input: import('../shared/types/poetry').PoetrySaveInput): ReturnType<import('../shared/types/poetry').PoetryAPI['saveKnowledge']> => ipcRenderer.invoke('poetry:save-knowledge', input),
    saved: (offset?: number): ReturnType<import('../shared/types/poetry').PoetryAPI['saved']> => ipcRenderer.invoke('poetry:saved', offset),
    provision: (): ReturnType<import('../shared/types/poetry').PoetryAPI['provision']> => ipcRenderer.invoke('poetry:provision'),
    status: (): ReturnType<import('../shared/types/poetry').PoetryAPI['status']> => ipcRenderer.invoke('poetry:status'),
    poets: (query: import('../shared/types/poetry').PoetQuery): ReturnType<import('../shared/types/poetry').PoetryAPI['poets']> => ipcRenderer.invoke('poetry:poets', query),
    facets: (): ReturnType<import('../shared/types/poetry').PoetryAPI['facets']> => ipcRenderer.invoke('poetry:facets'),
    variants: (): ReturnType<import('../shared/types/poetry').PoetryAPI['variants']> => ipcRenderer.invoke('poetry:variants'),
    search: (query: import('../shared/types/poetry').PoetryQuery): ReturnType<import('../shared/types/poetry').PoetryAPI['search']> => ipcRenderer.invoke('poetry:search', query),
    detail: (id: number): ReturnType<import('../shared/types/poetry').PoetryAPI['detail']> => ipcRenderer.invoke('poetry:detail', id),
    narrations: (poemId: number): ReturnType<import('../shared/types/poetry').PoetryAPI['narrations']> => ipcRenderer.invoke('poetry:narrations', poemId),
    importNarrationFile: (input: Parameters<import('../shared/types/poetry').PoetryAPI['importNarrationFile']>[0]): ReturnType<import('../shared/types/poetry').PoetryAPI['importNarrationFile']> => ipcRenderer.invoke('poetry:narration-import-file', input),
    saveNarrationRecording: (input: Parameters<import('../shared/types/poetry').PoetryAPI['saveNarrationRecording']>[0]): ReturnType<import('../shared/types/poetry').PoetryAPI['saveNarrationRecording']> => ipcRenderer.invoke('poetry:narration-save-recording', input),
    addNarrationLink: (input: Parameters<import('../shared/types/poetry').PoetryAPI['addNarrationLink']>[0]): ReturnType<import('../shared/types/poetry').PoetryAPI['addNarrationLink']> => ipcRenderer.invoke('poetry:narration-add-link', input),
    deleteNarration: (id: string): ReturnType<import('../shared/types/poetry').PoetryAPI['deleteNarration']> => ipcRenderer.invoke('poetry:narration-delete', id),
  },
  getSystemInfo: () => ipcRenderer.invoke('system:get-info') as Promise<{ platform: string; arch: string; version: string; dataLocation: string; logsLocation: string }>,
  openLogsFolder: () => ipcRenderer.invoke('system:open-logs') as Promise<string>,
  openFileDialog: () => ipcRenderer.invoke('system:open-file-dialog'),
  openFilesDialog: () => ipcRenderer.invoke('system:open-files-dialog'),
  openDirectoryDialog: () => ipcRenderer.invoke('system:open-directory-dialog'),
  getPathForFile: (file: File & { path?: string }): string => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        const p = webUtils.getPathForFile(file);
        if (p && typeof p === 'string' && p.trim().length > 0) {
          return p;
        }
      }
    } catch (e) {
      console.warn('[preload] webUtils.getPathForFile error:', e);
    }
    return file?.path || '';
  },
  saveDroppedFileBuffer: (name: string, buffer: Uint8Array) =>
    ipcRenderer.invoke('system:save-file-buffer', { name, buffer }),
  readPdfBase64: (filePath: string) => ipcRenderer.invoke('system:read-pdf-base64', filePath),
  extractPdfText: (filePath: string) => ipcRenderer.invoke('system:extract-pdf-text', filePath),

  // Database
  getDatabaseStatus: () => ipcRenderer.invoke('database:get-status'),
  getAllBooks: () => ipcRenderer.invoke('library:get-all-books'),
  getBookSource: (workId: string, sourceId: string): Promise<import('../shared/types/work').BookItem | null> => ipcRenderer.invoke('library:get-book-source', workId, sourceId),
  addBook: (bookData: unknown) => ipcRenderer.invoke('library:add-book', bookData),
  updateBook: (bookData: unknown) => ipcRenderer.invoke('library:update-book', bookData),
  deleteBook: (bookId: string, permanent?: boolean) => ipcRenderer.invoke('library:delete-book', bookId, permanent),
  restoreBook: (bookId: string) => ipcRenderer.invoke('library:restore-book', bookId),
  permanentlyDeleteBook: (bookId: string) => ipcRenderer.invoke('library:permanently-delete', bookId),
  getTrashWorks: () => ipcRenderer.invoke('library:get-trash-works'),
  getTrashCount: () => ipcRenderer.invoke('library:get-trash-count'),
  emptyTrash: () => ipcRenderer.invoke('library:empty-trash'),
  updateReadingStatus: (bookId: string, status: string, progress?: number) =>
    ipcRenderer.invoke('library:update-reading-status', bookId, status, progress),

  // Annotations, Highlights, Margin Notes & Freehand Ink (Story 2.1 / KEY-137)
  getAnnotations: (bookId: string) => ipcRenderer.invoke('library:get-annotations', bookId),
  getAllAnnotations: () => ipcRenderer.invoke('library:get-all-annotations'),
  saveAnnotation: (payload: unknown) => ipcRenderer.invoke('library:save-annotation', payload),
  deleteAnnotation: (annotationId: string) => ipcRenderer.invoke('library:delete-annotation', annotationId),
  getFilteredAnnotations: (filter: unknown) => ipcRenderer.invoke('library:get-filtered-annotations', filter),

  // Full-Text Search Engine (KEY-140)
  indexBookContent: (bookId: string, pages: unknown[]) => ipcRenderer.invoke('search:index-book-content', bookId, pages),
  reindexPageContent: (bookId: string, page: unknown) => ipcRenderer.invoke('search:reindex-page-content', bookId, page),
  getPageContent: (bookId: string, pageNumber: number) => ipcRenderer.invoke('search:get-page-content', bookId, pageNumber),
  deleteBookContentIndex: (bookId: string) => ipcRenderer.invoke('search:delete-book-content', bookId),
  isBookIndexed: (bookId: string) => ipcRenderer.invoke('search:is-book-indexed', bookId),
  searchLibraryFullText: (query: string, options?: unknown) => ipcRenderer.invoke('search:library-full-text', query, options),
  getFtsStats: () => ipcRenderer.invoke('search:get-fts-stats'),

  // Local OCR Engine for Scanned Documents & Manuscripts (Story 3.2 / KEY-141)
  ocrIsSupported: () => ipcRenderer.invoke('ocr:is-supported'),
  ocrGetEngineInfo: () => ipcRenderer.invoke('ocr:get-engine-info'),
  ocrGetEngines: () => ipcRenderer.invoke('ocr:get-engines'),
  ocrGetPreferredEngine: () => ipcRenderer.invoke('ocr:get-preferred-engine'),
  ocrGetLayout: (): Promise<'lines' | 'columns'> => ipcRenderer.invoke('ocr:get-layout'),
  ocrSetLayout: (layout: 'lines' | 'columns'): Promise<'lines' | 'columns'> => ipcRenderer.invoke('ocr:set-layout', layout),
  ocrSetPreferredEngine: (engine: import('../shared/types/ocr').OcrEngineId) => ipcRenderer.invoke('ocr:set-preferred-engine', engine),
  ocrDownloadModel: () => ipcRenderer.invoke('ocr:download-model'),
  onOcrDownloadProgress: (callback: (payload: import('../shared/types/ocr').OcrModelDownloadProgress) => void) => {
    const subscription = (_: unknown, value: Parameters<typeof callback>[0]) => callback(value);
    ipcRenderer.on('ocr:download-progress', subscription);
    return () => { ipcRenderer.removeListener('ocr:download-progress', subscription); };
  },
  ocrGetAvailableLanguages: () => ipcRenderer.invoke('ocr:get-available-languages'),
  ocrRecognizePage: (params: import('../shared/types/ocr').OcrRecognizePageParams) =>
    ipcRenderer.invoke('ocr:recognize-page', params),
  ocrRecognizeDocument: (params: import('../shared/types/ocr').OcrRecognizeDocumentParams) =>
    ipcRenderer.invoke('ocr:recognize-document', params),
  onOcrProgress: (callback: (payload: import('../shared/types/ocr').OcrProgressPayload) => void) => {
    const subscription = (_: unknown, value: Parameters<typeof callback>[0]) => callback(value);
    ipcRenderer.on('ocr:progress', subscription);
    return () => { ipcRenderer.removeListener('ocr:progress', subscription); };
  },

  // Pluggable Offline Dictionary & Encyclopedia Lookup (Story 3.3 / KEY-142)
  dictionaryLookup: (word: string, options?: { lang?: string; includeWikipedia?: boolean; science?: string; workId?: string }) =>
    ipcRenderer.invoke('dictionary:lookup', word, options),
  dictionaryChooseImport: (science?: string) => ipcRenderer.invoke('dictionary:choose-import', science),
  dictionarySetScience: (id: string, science: string | null) => ipcRenderer.invoke('dictionary:set-science', id, science),
  dictionaryWikipedia: (word: string, lang?: string) =>
    ipcRenderer.invoke('dictionary:wikipedia', word, lang),
  dictionaryList: () => ipcRenderer.invoke('dictionary:list'),
  dictionaryImport: (options: import('../shared/types/dictionary').ImportDictionaryOptions) =>
    ipcRenderer.invoke('dictionary:import', options),
  dictionaryDelete: (id: string) => ipcRenderer.invoke('dictionary:delete', id),
  dictionaryToggle: (id: string, isEnabled: boolean) =>
    ipcRenderer.invoke('dictionary:toggle', id, isEnabled),

  // Story 9 Pagination & Bulk Operations
  getPaginatedWorks: (options: unknown) =>
    ipcRenderer.invoke('library:get-paginated-works', options),
  bulkUpdateCategory: (input: { workIds: string[]; categoryId: string }) =>
    ipcRenderer.invoke('library:bulk-update-category', input),
  bulkUpdateReadingStatus: (input: { workIds: string[]; readingStatus: string; readingProgress?: number }) =>
    ipcRenderer.invoke('library:bulk-update-reading-status', input),
  bulkAddTags: (input: { workIds: string[]; tags: string[] }) =>
    ipcRenderer.invoke('library:bulk-add-tags', input),
  bulkDelete: (input: { workIds: string[]; permanent?: boolean }) =>
    ipcRenderer.invoke('library:bulk-delete', input),
  bulkRestore: (input: { workIds: string[] }) =>
    ipcRenderer.invoke('library:bulk-restore', input),

  // Lending Management
  recordLoan: (workId: string, loanData: unknown) => ipcRenderer.invoke('library:record-loan', workId, loanData),
  returnLoan: (loanId: string, returnDate?: string, condition?: string) =>
    ipcRenderer.invoke('library:return-loan', loanId, returnDate, condition),
  getLendingHistory: (workId: string) => ipcRenderer.invoke('library:get-lending-history', workId),
  getActiveLoans: () => ipcRenderer.invoke('library:get-active-loans'),

  // Online Metadata & External Repositories (Story 5)
  searchLibgen: (query: string, maxResults?: number) =>
    ipcRenderer.invoke('library:search-libgen', query, maxResults),
  lookupLibgenHash: (hash: string, hashType?: 'md5' | 'sha1' | 'sha256') =>
    ipcRenderer.invoke('library:lookup-libgen-hash', hash, hashType),
  lookupLibgenIdentifier: (identifier: string, type?: 'isbn' | 'doi') =>
    ipcRenderer.invoke('library:lookup-libgen-identifier', identifier, type),
  downloadLibgen: (options: {
    md5: string;
    ipfsCid?: string;
    filename: string;
    expectedFormat?: string;
    expectedFilesize?: number;
  }) => ipcRenderer.invoke('library:download-libgen', options),
  onLibgenDownloadProgress: (callback: (progress: { md5: string; bytesTransferred: number; totalBytes: number; percent: number }) => void) => {
    const sub = (_: unknown, data: Parameters<typeof callback>[0]) => callback(data);
    ipcRenderer.on('libgen:download-progress', sub);
    return () => { ipcRenderer.removeListener('libgen:download-progress', sub); };
  },
  searchAnnasArchive: (query: string, maxResults?: number) =>
    ipcRenderer.invoke('library:search-annas', query, maxResults),
  searchBibliographic: (query: unknown, maxResults?: number) =>
    ipcRenderer.invoke('library:search-bibliographic', query, maxResults),
  getBibliographicDetails: (workId: string) =>
    ipcRenderer.invoke('library:get-bibliographic-details', workId),
  searchBibliographicByIsbn: (isbn: string) =>
    ipcRenderer.invoke('library:search-bibliographic-isbn', isbn),
  lookupMetadata: (params: { isbn?: string; title?: string; author?: string; query?: string; filePath?: string; filename?: string }) =>
    ipcRenderer.invoke('library:lookup-metadata', params),
  parseFilename: (filename: string) =>
    ipcRenderer.invoke('library:parse-filename', filename),
  resolveCover: (options: unknown) =>
    ipcRenderer.invoke('library:resolve-cover', options),
  extractOfflineMetadata: (params: { filePath?: string; filename?: string; offlineOnly?: boolean }) =>
    ipcRenderer.invoke('library:extract-offline-metadata', params),
  discoverMetadata: (params: { filePath?: string; filename?: string; title?: string; author?: string; isbn?: string; page?: number; deeper?: boolean; offlineOnly?: boolean }) =>
    ipcRenderer.invoke('library:discover-metadata', params),
  extractPdfCoverPages: (filePath: string) => ipcRenderer.invoke('library:extract-pdf-cover-pages', filePath),
  extractPdfCover: (filePath: string, pageIndex?: number) =>
    ipcRenderer.invoke('library:extract-pdf-cover', filePath, pageIndex),
  extractEpubCover: (filePath: string) =>
    ipcRenderer.invoke('library:extract-epub-cover', filePath),
  safeDownload: (url: string, filename: string) =>
    ipcRenderer.invoke('library:safe-download', url, filename),
  showItemInFolder: (filePath: string) =>
    ipcRenderer.invoke('library:show-item-in-folder', filePath),
  openFile: (filePath: string) =>
    ipcRenderer.invoke('library:open-file', filePath),
  openExternal: (url: string) =>
    ipcRenderer.invoke('system:open-external', url),
  getContentShieldStatus: () =>
    ipcRenderer.invoke('system:get-shield-status'),

  // Digital E-Book File Validation & Ingestion (Story 6)
  validateDigitalFile: (filePath: string) =>
    ipcRenderer.invoke('digital:validate-file', filePath),
  discoverDigitalFiles: (paths: string[]) => ipcRenderer.invoke('digital:discover-files', paths),
  validateDigitalFiles: (filePaths: string[]) =>
    ipcRenderer.invoke('digital:validate-files', filePaths),
  getSupportedDigitalFormats: () =>
    ipcRenderer.invoke('digital:get-supported-formats'),
  importDigitalFile: (options: unknown) =>
    ipcRenderer.invoke('digital:import-file', options),
  importDigitalFiles: (optionsList: unknown[]) =>
    ipcRenderer.invoke('digital:import-files', optionsList),
  extractDigitalMetadata: (filePath: string, formatHint?: string) =>
    ipcRenderer.invoke('digital:extract-metadata', filePath, formatHint),
  checkDigitalDuplicates: (inputs: unknown[]) =>
    ipcRenderer.invoke('digital:check-duplicates', inputs),
  verifyFileStorage: (workId: string) =>
    ipcRenderer.invoke('digital:verify-file', workId),
  verifyAllFilesStorage: () =>
    ipcRenderer.invoke('digital:verify-files'),
  onDigitalImportProgress: (callback: (progress: import('../shared/types/digital-file').ImportProgressEvent) => void) => {
    const listener = (_e: unknown, progress: Parameters<typeof callback>[0]) => callback(progress);
    ipcRenderer.on('digital:import-progress', listener);
    return () => {
      ipcRenderer.removeListener('digital:import-progress', listener);
    };
  },

  // Storage Management (Story 7 / KEY-7)
  storage: {
    getHealthSummary: () => ipcRenderer.invoke('storage:get-health-summary'),
    verifyAll: () => ipcRenderer.invoke('storage:verify-all'),
    verifyFile: (workId: string) => ipcRenderer.invoke('storage:verify-file', workId),
    relinkFile: (workId: string, newFilePath: string) =>
      ipcRenderer.invoke('storage:relink-file', workId, newFilePath),
    batchAutoRebind: (searchDirectory: string) =>
      ipcRenderer.invoke('storage:batch-auto-rebind', searchDirectory),
    getAnalytics: () => ipcRenderer.invoke('storage:get-analytics'),
    pruneDuplicate: (options: unknown) =>
      ipcRenderer.invoke('storage:prune-duplicate', options),
  },

  // Physical Library & Shelving (Story 8 / KEY-5)
  physical: {
    getLocations: () => ipcRenderer.invoke('physical:get-locations'),
    getLocationTree: () => ipcRenderer.invoke('physical:get-location-tree'),
    getInventoryStats: () => ipcRenderer.invoke('physical:get-inventory-stats'),
    updateLocation: (input: unknown) => ipcRenderer.invoke('physical:update-location', input),
  },

  // Lending Lifecycle & Borrowers (Story 8 / KEY-5)
  lending: {
    borrowBook: (input: unknown) => ipcRenderer.invoke('lending:borrow-book', input),
    returnBook: (input: unknown) => ipcRenderer.invoke('lending:return-book', input),
    checkOverdue: () => ipcRenderer.invoke('lending:check-overdue'),
    getHistory: (workId: string) => ipcRenderer.invoke('lending:get-history', workId),
    getAllLoans: (filter?: unknown) => ipcRenderer.invoke('lending:get-all-loans', filter),
    getBorrowers: () => ipcRenderer.invoke('lending:get-borrowers'),
  },


  // Categories & Tags (Story 10 / KEY-10)
  categories: {
    getTree: (options?: { includeCounts?: boolean }) =>
      ipcRenderer.invoke('categories:get-tree', options),
    getAll: () =>
      ipcRenderer.invoke('categories:get-all'),
    getBreadcrumbs: (categoryId: string) =>
      ipcRenderer.invoke('categories:get-breadcrumbs', categoryId),
    create: (input: import('../shared/types/category').CategoryCreateInput) =>
      ipcRenderer.invoke('categories:create', input),
    update: (id: string, input: import('../shared/types/category').CategoryUpdateInput) =>
      ipcRenderer.invoke('categories:update', id, input),
    delete: (id: string, strategy?: import('../shared/types/category').CategoryDeleteStrategy, reassignToId?: string) =>
      ipcRenderer.invoke('categories:delete', id, strategy, reassignToId),
    reorder: (orderedIds: string[]) =>
      ipcRenderer.invoke('categories:reorder', orderedIds),
  },
  tags: {
    getAll: () =>
      ipcRenderer.invoke('tags:get-all'),
    getPopular: (limit?: number) =>
      ipcRenderer.invoke('tags:get-popular', limit),
    create: (name: string, category?: string) =>
      ipcRenderer.invoke('tags:create', name, category),
    update: (id: string, name: string) =>
      ipcRenderer.invoke('tags:update', id, name),
    delete: (id: string) =>
      ipcRenderer.invoke('tags:delete', id),
    merge: (sourceTagId: string, targetTagId: string) =>
      ipcRenderer.invoke('tags:merge', sourceTagId, targetTagId),
  },

  // Legacy Category Helpers
  getCategoryTree: (options?: { includeCounts?: boolean }) => ipcRenderer.invoke('categories:get-tree', options),
  getCategoryBreadcrumbs: (categoryId: string) => ipcRenderer.invoke('categories:get-breadcrumbs', categoryId),
  getSubtreeWorkIds: (categoryId: string) => ipcRenderer.invoke('library:get-subtree-work-ids', categoryId),


  // Knowledge Layer
  getAllNotes: () => ipcRenderer.invoke('library:get-all-notes'),
  addNote: (noteData: unknown) => ipcRenderer.invoke('library:add-note', noteData),
  deleteNote: (noteId: string) => ipcRenderer.invoke('library:delete-note', noteId),

  // Application Settings & View Preferences (Story 9)
  settings: {
    get: (key: string, defaultValue?: unknown) => ipcRenderer.invoke('settings:get', key, defaultValue),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    delete: (key: string) => ipcRenderer.invoke('settings:delete', key),
    getViewPreferences: () => ipcRenderer.invoke('settings:get-view-preferences'),
    saveViewPreferences: (prefs: unknown) => ipcRenderer.invoke('settings:save-view-preferences', prefs),
  },

  // Quota & Rate-Limiter Tracking
  getQuotaStatus: () => ipcRenderer.invoke('metadata:get-quota-status'),
  setQuotaCountTest: (count: number, date?: string) =>
    ipcRenderer.invoke('metadata:set-quota-count-test', count, date),
  onQuotaWarning: (callback: (payload: import('../main/services/metadata/quotaTracker').QuotaWarningPayload) => void) => {
    const subscription = (_: unknown, value: Parameters<typeof callback>[0]) => callback(value);
    ipcRenderer.on('metadata:quota-warning', subscription);
    return () => { ipcRenderer.removeListener('metadata:quota-warning', subscription); };
  },

  // Provider Priority & Configuration
  getProviderConfig: () =>
    ipcRenderer.invoke('metadata:get-provider-config'),
  updateProviderConfig: (configs: unknown) =>
    ipcRenderer.invoke('metadata:update-provider-config', configs),

  // Unified Multi-Provider Search & Discovery (Story 11)
  search: {
    query: (query: unknown, options?: { timeoutMs?: number; searchId?: string }) =>
      ipcRenderer.invoke('search:query', query, options),
    cancel: (searchId?: string) =>
      ipcRenderer.invoke('search:cancel', searchId),
    getProviders: () =>
      ipcRenderer.invoke('search:get-providers'),
    setProviderEnabled: (providerId: string, enabled: boolean) =>
      ipcRenderer.invoke('search:set-provider-enabled', providerId, enabled),
    importResult: (input: unknown) =>
      ipcRenderer.invoke('search:import-result', input),
    onProgress: (callback: (update: import('../shared/types/search').SearchProgressUpdate) => void) => {
      const subscription = (_: unknown, value: Parameters<typeof callback>[0]) => callback(value);
      ipcRenderer.on('search:progress', subscription);
      return () => { ipcRenderer.removeListener('search:progress', subscription); };
    },
  },

  // Online Metadata Enrichment & Safe Merge (Story 12 / KEY-3)
  enrichment: {
    findOnlineEditions: (input: { workId?: string; book?: unknown }) =>
      ipcRenderer.invoke('enrichment:find-online-editions', input),
    computeDiffs: (input: { workId?: string; book?: unknown; candidate: unknown }) =>
      ipcRenderer.invoke('enrichment:compute-diffs', input),
    applyMerge: (request: unknown) =>
      ipcRenderer.invoke('enrichment:apply-merge', request),
    fetchAndCacheCover: (request: unknown) =>
      ipcRenderer.invoke('enrichment:fetch-and-cache-cover', request),
    attachDigitalCopy: (input: { workId: string; downloadUrl: string; format: string; title?: string }) =>
      ipcRenderer.invoke('enrichment:attach-digital-copy', input),
    bulkEnrichWorks: (input: { workIds: string[] }) =>
      ipcRenderer.invoke('enrichment:bulk-enrich-works', input),
    refreshWork: (input: { workId: string; autoApply?: boolean }) =>
      ipcRenderer.invoke('enrichment:refresh-work', input),
    onBulkProgress: (callback: (progress: { current: number; total: number; bookTitle?: string; status: string }) => void) => {
      const listener = (_e: unknown, progress: Parameters<typeof callback>[0]) => callback(progress);
      ipcRenderer.on('enrichment:bulk-progress', listener);
      return () => {
        ipcRenderer.removeListener('enrichment:bulk-progress', listener);
      };
    },
  },

  onNotification: (callback: (message: string) => void) => {
    const subscription = (_: unknown, value: string) => callback(value);
    ipcRenderer.on('system:notification', subscription);
    return () => { ipcRenderer.removeListener('system:notification', subscription); };
  },

  onStudyNavigate: (callback: (target: string) => void) => {
    const subscription = (_: unknown, target: string) => callback(target);
    ipcRenderer.on('study:navigate', subscription);
    ipcRenderer.send('study:navigation-ready');
    return () => { ipcRenderer.removeListener('study:navigate', subscription); };
  },

  onReaderOpenFile: (callback: (filePath: string) => void) => {
    const subscription = (_: unknown, filePath: string) => callback(filePath);
    ipcRenderer.on('reader:open-file', subscription);
    return () => { ipcRenderer.removeListener('reader:open-file', subscription); };
  },

  // BYOK AI Research Assistant & Translation (KEY-143)
  ai: {
    getSettings: () =>
      ipcRenderer.invoke('ai:get-settings'),
    saveSettings: (settings: unknown) =>
      ipcRenderer.invoke('ai:save-settings', settings),
    testConnection: (customSettings?: unknown) =>
      ipcRenderer.invoke('ai:test-connection', customSettings),
    executeTool: (payload: unknown) =>
      ipcRenderer.invoke('ai:execute-tool', payload),
    translate: (options: unknown) =>
      ipcRenderer.invoke('ai:translate', options),
  },

  // Text-to-Speech (TTS), Audiobook Playback & SMIL Overlays (KEY-145)
  audio: {
    getPairing: (bookId: string) => ipcRenderer.invoke('audio:get-pairing', bookId),
    savePairing: (payload: unknown) => ipcRenderer.invoke('audio:save-pairing', payload),
    deletePairing: (bookId: string) => ipcRenderer.invoke('audio:delete-pairing', bookId),
    getProgress: (bookId: string) => ipcRenderer.invoke('audio:get-progress', bookId),
    saveProgress: (progress: unknown) => ipcRenderer.invoke('audio:save-progress', progress),
    parseSmil: (smilXml: string, smilHref?: string) => ipcRenderer.invoke('audio:parse-smil', smilXml, smilHref),
    scanLocalAudioFiles: (folderPath: string) => ipcRenderer.invoke('audio:scan-local-files', folderPath),
    queryAudiobookshelf: (serverUrl: string, apiKey: string, query?: string) =>
      ipcRenderer.invoke('audio:query-abs', serverUrl, apiKey, query),
    tts: {
      getStatus: () => ipcRenderer.invoke('tts:get-status'),
      getVoices: () => ipcRenderer.invoke('tts:get-voices'),
      init: (options?: import('../shared/types/tts-provider').TTSProviderInitOptions) =>
        ipcRenderer.invoke('tts:init', options),
      loadVoice: (options: import('../shared/types/tts-provider').TTSProviderVoiceOptions) =>
        ipcRenderer.invoke('tts:load-voice', options),
      synthesize: (request: Omit<import('../shared/types/tts-provider').TTSProviderSynthesisRequest, 'jobId'> & { jobId?: string }) =>
        ipcRenderer.invoke('tts:synthesize', request),
      stop: (jobId?: string) => ipcRenderer.invoke('tts:stop', jobId),
      release: () => ipcRenderer.invoke('tts:release'),
      onChunk: (callback: (chunk: import('../shared/types/tts-provider').TTSProviderAudioChunk) => void) => {
        const subscription = (_: unknown, chunk: import('../shared/types/tts-provider').TTSProviderAudioChunk) => callback(chunk);
        ipcRenderer.on('tts:chunk', subscription);
        return () => { ipcRenderer.removeListener('tts:chunk', subscription); };
      },
      onComplete: (callback: (event: { jobId: string }) => void) => {
        const subscription = (_: unknown, event: { jobId: string }) => callback(event);
        ipcRenderer.on('tts:complete', subscription);
        return () => { ipcRenderer.removeListener('tts:complete', subscription); };
      },
      onError: (callback: (event: { jobId: string; message: string }) => void) => {
        const subscription = (_: unknown, event: { jobId: string; message: string }) => callback(event);
        ipcRenderer.on('tts:error', subscription);
        return () => { ipcRenderer.removeListener('tts:error', subscription); };
      },
    },
  },

  // Cloud Backup, KOReader Progress Sync & Version Snapshots (KEY-147)
  cloudSync: {
    getKoSyncConfig: () => ipcRenderer.invoke('sync:koreader-get-config'),
    saveKoSyncConfig: (config: unknown) => ipcRenderer.invoke('sync:koreader-save-config', config),
    testKoSync: (customConfig?: unknown) => ipcRenderer.invoke('sync:koreader-test', customConfig),
    pullKoSyncProgress: (bookId: string, customDigest?: string) =>
      ipcRenderer.invoke('sync:koreader-pull', bookId, customDigest),
    pushKoSyncProgress: (bookId: string, progress: string, percentage: number, customDigest?: string) =>
      ipcRenderer.invoke('sync:koreader-push', bookId, progress, percentage, customDigest),

    getCloudConfig: () => ipcRenderer.invoke('sync:cloud-get-config'),
    saveCloudConfig: (config: unknown) => ipcRenderer.invoke('sync:cloud-save-config', config),
    testCloudConnection: (customConfig?: unknown) => ipcRenderer.invoke('sync:cloud-test', customConfig),
    listCloudFiles: (remotePath?: string) => ipcRenderer.invoke('sync:cloud-list-files', remotePath),
    backupToCloud: (targetFileName?: string) => ipcRenderer.invoke('sync:cloud-backup', targetFileName),
    restoreFromCloud: (remoteFileName: string) => ipcRenderer.invoke('sync:cloud-restore', remoteFileName),
    importBookFromCloud: (remotePath: string) => ipcRenderer.invoke('sync:cloud-import-book', remotePath),

    createSnapshot: (description?: string) => ipcRenderer.invoke('sync:snapshot-create', description),
    listSnapshots: () => ipcRenderer.invoke('sync:snapshot-list'),
    restoreSnapshot: (snapshotFileName: string) => ipcRenderer.invoke('sync:snapshot-restore', snapshotFileName),
    deleteSnapshot: (snapshotFileName: string) => ipcRenderer.invoke('sync:snapshot-delete', snapshotFileName),
    exportSnapshot: (snapshotFileName: string, destinationDir: string) =>
      ipcRenderer.invoke('sync:snapshot-export', snapshotFileName, destinationDir),
  },

  // OPDS 1.2 / 2.0 Catalog & Local Feed Server (KEY-148)
  opds: {
    getPresets: () => ipcRenderer.invoke('opds:get-presets'),
    browseCatalog: (url: string, catalog?: unknown) => ipcRenderer.invoke('opds:browse-catalog', url, catalog),
    searchCatalog: (searchTemplate: string, query: string, catalog?: unknown) =>
      ipcRenderer.invoke('opds:search-catalog', searchTemplate, query, catalog),
    downloadBook: (downloadUrl: string, catalog?: unknown, suggestedFileName?: string) =>
      ipcRenderer.invoke('opds:download-book', downloadUrl, catalog, suggestedFileName),
    startServer: (port?: number) => ipcRenderer.invoke('opds:server-start', port),
    stopServer: () => ipcRenderer.invoke('opds:server-stop'),
    getServerStatus: () => ipcRenderer.invoke('opds:server-status'),
    setServerConfig: (config: unknown) => ipcRenderer.invoke('opds:server-set-config', config),
  },

  // Web Clipper & Serialized Novel Ingestion (KEY-148)
  clipper: {
    clipUrl: (options: unknown) => ipcRenderer.invoke('clipper:clip-url', options),
    clipHtml: (options: unknown) => ipcRenderer.invoke('clipper:clip-html', options),
    scrapeNovel: (options: unknown) => ipcRenderer.invoke('clipper:scrape-novel', options),
    openBrowser: (initialUrl?: string) => ipcRenderer.invoke('clipper:open-browser', initialUrl),
    clipBrowser: (targetFormat?: string, contentsLabel?: string) => ipcRenderer.invoke('clipper:clip-browser', targetFormat, contentsLabel),
  },

  // WeasyPrint PDF export from the reader
  pdfExport: {
    saveBook: (input: unknown) => ipcRenderer.invoke('pdf-export:book', input),
    saveHtml: (input: unknown) => ipcRenderer.invoke('pdf-export:html', input),
  },

  // Reading Statistics & Analytics Dashboard (KEY-149)
  statistics: {
    workspace: (): Promise<import('../shared/statistics-workspace').StatisticsSnapshot> => ipcRenderer.invoke('statistics:workspace'),
    startSession: (payload: unknown) => ipcRenderer.invoke('statistics:start-session', payload),
    turnPage: (page: number, totalPages?: number) => ipcRenderer.invoke('statistics:turn-page', page, totalPages),
    heartbeat: () => ipcRenderer.invoke('statistics:heartbeat'),
    endSession: () => ipcRenderer.invoke('statistics:end-session'),
    recordProgress: (payload: unknown) => ipcRenderer.invoke('statistics:record-progress', payload),
    getBookStats: (bookId: string) => ipcRenderer.invoke('statistics:get-book-stats', bookId),
    getAllBookStats: () => ipcRenderer.invoke('statistics:get-all-book-stats'),
    getDailyHeatmap: (days?: number) => ipcRenderer.invoke('statistics:get-daily-heatmap', days),
    getStreakStats: () => ipcRenderer.invoke('statistics:get-streak-stats'),
    getMedianPageDuration: (bookId: string) => ipcRenderer.invoke('statistics:get-median-page-duration', bookId),
  },

  // App Lock Security & Native Biometrics (KEY-149)
  appLock: {
    getBiometricCapability: () => ipcRenderer.invoke('security:get-biometric-capability'),
    promptBiometricAuth: (promptMessage?: string) => ipcRenderer.invoke('security:prompt-biometric-auth', promptMessage),
    verifyMasterPin: (pin: string) => ipcRenderer.invoke('security:verify-master-pin', pin),
    setMasterPin: (pin: string) => ipcRenderer.invoke('security:set-master-pin', pin),
    clearMasterPin: () => ipcRenderer.invoke('security:clear-master-pin'),
    getLockConfig: () => ipcRenderer.invoke('security:get-lock-config'),
    setLockConfig: (config: unknown) => ipcRenderer.invoke('security:set-lock-config', config),
    getLockState: () => ipcRenderer.invoke('security:get-lock-state'),
    lock: (reason?: string) => ipcRenderer.invoke('security:lock', reason),
    unlock: () => ipcRenderer.invoke('security:unlock'),
    checkIdleTimeout: () => ipcRenderer.invoke('security:check-idle-timeout'),
  },

  // Reader Plugins & Extensibility (KEY-149)
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    enable: (id: string, enabled: boolean) => ipcRenderer.invoke('plugins:enable', id, enabled),
    getStyles: () => ipcRenderer.invoke('plugins:get-styles'),
    lookupWord: (word: string, lang?: string) => ipcRenderer.invoke('plugins:lookup-word', word, lang),
    getTtsVoices: () => ipcRenderer.invoke('plugins:get-tts-voices'),
  },

  // Core Knowledge Layer (highlights, notes, quotes, bookmarks, questions)
  pdfEditor: {
    viewSource: input => ipcRenderer.invoke('pdf-editor:view-source', input),
    releaseViewSource: id => ipcRenderer.invoke('pdf-editor:release-view-source', id),
    evictViewSource: id => ipcRenderer.invoke('pdf-editor:evict-view-source', id),
    saveViewPreview: (id, page, preview) => ipcRenderer.invoke('pdf-editor:save-view-preview', id, page, preview),
    onViewSourceChanged: callback => {
      const listener = (_: unknown, id: string) => callback(id);
      ipcRenderer.on('pdf-editor:view-source-changed', listener);
      return () => { ipcRenderer.removeListener('pdf-editor:view-source-changed', listener); };
    },
    capabilities: () => ipcRenderer.invoke('pdf-editor:capabilities'),
    engineStatus: () => ipcRenderer.invoke('pdf-editor:engine-status'),
    onEngineStatusChanged: (callback: (info: import('../shared/types/pdf-editor').StirlingEngineInfo) => void) => {
      const listener = (_: unknown, info: unknown) => callback(info as import('../shared/types/pdf-editor').StirlingEngineInfo);
      ipcRenderer.on('pdf-editor:engine-status-changed', listener);
      return () => { ipcRenderer.removeListener('pdf-editor:engine-status-changed', listener); };
    },
    open: input => ipcRenderer.invoke('pdf-editor:open', input),
    sources: workId => ipcRenderer.invoke('pdf-editor:sources', workId),
    start: input => ipcRenderer.invoke('pdf-editor:start', input),
    status: id => ipcRenderer.invoke('pdf-editor:status', id),
    cancel: id => ipcRenderer.invoke('pdf-editor:cancel', id),
    chooseSource: () => ipcRenderer.invoke('pdf-editor:choose-source'),
    blankSession: () => ipcRenderer.invoke('pdf-editor:blank-session'),
    chooseAsset: kind => ipcRenderer.invoke('pdf-editor:choose-asset', kind),
    warmEngine: () => ipcRenderer.invoke('pdf-editor:warm-engine'),
    chooseToolFiles: (extensions, multiple) => ipcRenderer.invoke('pdf-editor:choose-tool-files', extensions, multiple),
    clipboard: () => ipcRenderer.invoke('pdf-editor:clipboard'),
    save: input => ipcRenderer.invoke('pdf-editor:save', input),
    saveCopy: id => ipcRenderer.invoke('pdf-editor:save-copy', id),
    close: id => ipcRenderer.invoke('pdf-editor:close', id),
    audit: () => ipcRenderer.invoke('pdf-editor:audit'),
    listPipelines: () => ipcRenderer.invoke('pdf-editor:pipelines:list'),
    savePipeline: (pipeline: unknown) => ipcRenderer.invoke('pdf-editor:pipelines:save', pipeline),
    deletePipeline: (id: string) => ipcRenderer.invoke('pdf-editor:pipelines:delete', id),
    executePipeline: (input: unknown) => ipcRenderer.invoke('pdf-editor:pipelines:execute', input),
    getProcessorTelemetry: () => ipcRenderer.invoke('pdf-editor:processor:telemetry'),
    getPolicies: () => ipcRenderer.invoke('pdf-editor:processor:policies'),
    savePolicies: (policies: unknown) => ipcRenderer.invoke('pdf-editor:processor:save-policies', policies),
    getWatchedFolders: () => ipcRenderer.invoke('pdf-editor:processor:folders'),
    saveWatchedFolders: (folders: unknown) => ipcRenderer.invoke('pdf-editor:processor:save-folders', folders),
    exportPipelineAutomate: (pipeline: unknown) => ipcRenderer.invoke('pdf-editor:pipelines:export-automate', pipeline),
    exportPipelineFolderScan: (folder: unknown, pipeline: unknown) => ipcRenderer.invoke('pdf-editor:pipelines:export-folder-scan', folder, pipeline),
    importPipeline: (jsonContent: string) => ipcRenderer.invoke('pdf-editor:pipelines:import', jsonContent),
    checkWatchedFolders: () => ipcRenderer.invoke('pdf-editor:processor:check-folders'),
    listVersions: (sessionId: string) => ipcRenderer.invoke('pdf-editor:versions:list', sessionId),
    restoreVersion: (sessionId: string, versionFilename: string) => ipcRenderer.invoke('pdf-editor:versions:restore', sessionId, versionFilename),
    undoVersion: (sessionId: string) => ipcRenderer.invoke('pdf-editor:versions:undo', sessionId),
    deleteVersion: (sessionId: string, versionFilename: string) => ipcRenderer.invoke('pdf-editor:versions:delete', sessionId, versionFilename),
    accessibilityCheck: (input: { path: string; runVeraPdf?: boolean }) => ipcRenderer.invoke('pdf-editor:accessibility-check', input),
    fixAccessibility: (input: { path: string; language?: string; title?: string }) => ipcRenderer.invoke('pdf-editor:fix-accessibility', input),
    saveAccessibilityFix: (input: { path: string; stagedPath: string }) => ipcRenderer.invoke('pdf-editor:save-accessibility-fix', input),
    onSourceChanged: callback => {
      const listener = (_: unknown, source: { workId: string | null; sourceId: string | null }) => callback(source);
      ipcRenderer.on('pdf-editor:source-changed', listener);
      return () => { ipcRenderer.removeListener('pdf-editor:source-changed', listener); };
    },
  } satisfies PdfEditorAPI,
  pdfCloud: {
    status: provider => ipcRenderer.invoke('pdf-cloud:status', provider),
    configure: (provider, config) => ipcRenderer.invoke('pdf-cloud:configure', provider, config),
    connect: (provider, language) => ipcRenderer.invoke('pdf-cloud:connect', provider, language),
    cancelLogin: provider => ipcRenderer.invoke('pdf-cloud:cancel-login', provider),
    disconnect: provider => ipcRenderer.invoke('pdf-cloud:disconnect', provider),
    list: (provider, folder, next) => ipcRenderer.invoke('pdf-cloud:list', provider, folder, next),
    import: (provider, remoteId, workId) => ipcRenderer.invoke('pdf-cloud:import', provider, remoteId, workId),
    export: (provider, sessionId, folder, name) => ipcRenderer.invoke('pdf-cloud:export', provider, sessionId, folder, name),
    exportOutput: (provider, jobId, index, folder, name) => ipcRenderer.invoke('pdf-cloud:export-output', provider, jobId, index, folder, name),
    links: () => ipcRenderer.invoke('pdf-cloud:links'),
    link: (provider, sessionId, remoteId) => ipcRenderer.invoke('pdf-cloud:link', provider, sessionId, remoteId),
    setSync: (id, enabled) => ipcRenderer.invoke('pdf-cloud:set-sync', id, enabled),
    unlink: id => ipcRenderer.invoke('pdf-cloud:unlink', id),
    sync: id => ipcRenderer.invoke('pdf-cloud:sync', id),
  } satisfies PdfCloudAPI,
  pdfCollaboration: {
    reviews: session => ipcRenderer.invoke('pdf-collab:list', session),
    saveReview: (session, input) => ipcRenderer.invoke('pdf-collab:add', session, input),
    reply: (session, id, author, text, expected) => ipcRenderer.invoke('pdf-collab:reply', session, id, author, text, expected),
    reviewStatus: (session, id, status, expected) => ipcRenderer.invoke('pdf-collab:status', session, id, status, expected),
    exportReviews: (session, language) => ipcRenderer.invoke('pdf-collab:export', session, language),
    ask: (session, question, language, allowRemote, password, options) => ipcRenderer.invoke('pdf-collab:ask', session, question, language, allowRemote, password, options),
  } satisfies PdfCollaborationAPI,
  planner: {
    list: (): Promise<import('../shared/study-planner').StudyTask[]> => ipcRenderer.invoke('study-planner:list'),
    save: input => ipcRenderer.invoke('study-planner:save', input),
    remove: (id, expected) => ipcRenderer.invoke('study-planner:remove', id, expected),
  } satisfies import('../shared/study-planner').PlannerAPI,
  pathways: {
    list: () => ipcRenderer.invoke('pathways:list'),
    get: id => ipcRenderer.invoke('pathways:get', id),
    save: input => ipcRenderer.invoke('pathways:save', input),
    remove: id => ipcRenderer.invoke('pathways:remove', id),
    addItem: input => ipcRenderer.invoke('pathways:add-item', input),
    addStep: (id, section, title) => ipcRenderer.invoke('pathways:add-step', id, section, title),
    removeItem: id => ipcRenderer.invoke('pathways:remove-item', id),
    setPinned: (id, pinned) => ipcRenderer.invoke('pathways:set-pinned', id, pinned),
    setDone: (id, done) => ipcRenderer.invoke('pathways:set-done', id, done),
    reorder: (id, ids) => ipcRenderer.invoke('pathways:reorder', id, ids),
    exportReferences: (id, format) => ipcRenderer.invoke('pathways:export', id, format),
    templates: () => ipcRenderer.invoke('pathways:templates'),
    saveTemplate: input => ipcRenderer.invoke('pathways:save-template', input),
    removeTemplate: id => ipcRenderer.invoke('pathways:remove-template', id),
    draft: (subject, language) => ipcRenderer.invoke('pathways:draft', subject, language),
  } satisfies import('../shared/pathways').PathwaysAPI,
  pathwayPrerequisites: {
    get: (pathwayId: string): Promise<import('../shared/study-prerequisites').PrerequisitesMap> =>
      ipcRenderer.invoke('pathways:get-prerequisites', pathwayId),
    save: (
      pathwayId: string,
      map: import('../shared/study-prerequisites').PrerequisitesMap
    ): Promise<{ success: boolean; cycle?: string[]; error?: string }> =>
      ipcRenderer.invoke('pathways:save-prerequisites', pathwayId, map),
    renameSection: (pathwayId: string, oldSection: string, newSection: string): Promise<void> =>
      ipcRenderer.invoke('pathways:rename-section', pathwayId, oldSection, newSection),
    deleteSection: (pathwayId: string, section: string): Promise<void> =>
      ipcRenderer.invoke('pathways:delete-section', pathwayId, section),
    getHints: (): Promise<import('../shared/study-prerequisites').PrerequisiteHint[]> =>
      ipcRenderer.invoke('pathways:get-prerequisite-hints'),
    dismissHint: (
      pathwayId: string,
      failingSection: string,
      weakestPrerequisite: string,
      currentFailureCount: number
    ): Promise<void> =>
      ipcRenderer.invoke(
        'pathways:dismiss-prerequisite-hint',
        pathwayId,
        failingSection,
        weakestPrerequisite,
        currentFailureCount
      ),
  },
  pathwayExam: {
    getConfig: (pathwayId: string): Promise<import('../shared/curriculum-exam').CurriculumExamConfig> =>
      ipcRenderer.invoke('pathways:get-exam-config', pathwayId),
    saveConfig: (config: unknown): Promise<import('../shared/curriculum-exam').CurriculumExamConfig> =>
      ipcRenderer.invoke('pathways:save-exam-config', config),
    previewReplan: (
      pathwayId: string,
      lang: 'ar' | 'en'
    ): Promise<import('../shared/curriculum-exam').ReplanResult> =>
      ipcRenderer.invoke('pathways:get-replan-preview', pathwayId, lang),
    applyReplan: (pathwayId: string, schedule: { taskId: string; date: string }[]): Promise<void> =>
      ipcRenderer.invoke('pathways:apply-replan', pathwayId, schedule),
  },
  lectures: {
    list: () => ipcRenderer.invoke('lectures:list'),
    add: () => ipcRenderer.invoke('lectures:add'),
    remove: id => ipcRenderer.invoke('lectures:remove', id),
    update: (id, changes) => ipcRenderer.invoke('lectures:update', id, changes),
    progress: id => ipcRenderer.invoke('lectures:progress', id),
    saveProgress: (id, progress) => ipcRenderer.invoke('lectures:save-progress', id, progress),
    saveShot: (id, png) => ipcRenderer.invoke('lectures:save-shot', id, png),
    shotsDirectory: () => ipcRenderer.invoke('lectures:shots-directory'),
  } satisfies import('../shared/lectures').LecturesAPI,
  courses: {
    account: () => ipcRenderer.invoke('courses:account'),
    saveAccount: account => ipcRenderer.invoke('courses:save-account', account),
    forget: () => ipcRenderer.invoke('courses:forget'),
    importProgress: () => ipcRenderer.invoke('courses:import'),
    snapshot: () => ipcRenderer.invoke('courses:snapshot'),
  } satisfies import('../shared/courses').CoursesAPI,
  sources: {
    get: () => ipcRenderer.invoke('sources:get'),
    importFile: () => ipcRenderer.invoke('sources:import-file'),
    update: address => ipcRenderer.invoke('sources:update', address),
    reset: () => ipcRenderer.invoke('sources:reset'),
  } satisfies import('../shared/source-urls').SourceUrlsAPI,
  coverPhoto: {
    propose: (): Promise<(import('../shared/cover-text').CoverProposal & { cover: string; engine: string; match: { title?: string; authors?: string[]; publisher?: string; publishedYear?: number | string } | null }) | null> => ipcRenderer.invoke('cover-photo:propose'),
  },
  studyInsights: {
    setPaused: paused => ipcRenderer.invoke('study-planner:pause', paused),
    summary: (): Promise<import('../shared/study-insights').StudyInsights> => ipcRenderer.invoke('study-planner:summary'),
    preferences: (): Promise<import('../shared/study-insights').StudyPreferences> => ipcRenderer.invoke('study-planner:preferences'),
    savePreferences: input => ipcRenderer.invoke('study-planner:save-preferences', input),
    words: bookId => ipcRenderer.invoke('study-planner:words', bookId),
    rhythmDailyActivity: days => ipcRenderer.invoke('study-planner:rhythm-activity', days),
    progressTargets: () => ipcRenderer.invoke('study-planner:progress-targets'),
    progressSummary: (targetKind, targetId) => ipcRenderer.invoke('study-planner:progress-summary', targetKind, targetId),
  } satisfies import('../shared/study-insights').StudyInsightsAPI,
  studyWird: {
    getConfig: (): Promise<import('../shared/quran-wird').QuranWirdConfig> => ipcRenderer.invoke('study-planner:wird-get-config'),
    saveConfig: (input: unknown): Promise<import('../shared/quran-wird').QuranWirdConfig> => ipcRenderer.invoke('study-planner:wird-save-config', input),
    syncToday: (todayStr: string): Promise<import('../shared/quran-wird').TodayWirdSyncResult> => ipcRenderer.invoke('study-planner:wird-sync-today', todayStr),
    complete: (todayStr: string, taskId?: string): Promise<import('../shared/quran-wird').TodayWirdSyncResult> => ipcRenderer.invoke('study-planner:wird-complete', todayStr, taskId),
    hasLayout: (profile: import('../shared/quran-wird').QuranWirdProfile): Promise<boolean> => ipcRenderer.invoke('study-planner:wird-has-layout', profile),
  },
  knowledgeCards: {
    decks: () => ipcRenderer.invoke('knowledge-cards:decks'),
    generateDeck: input => ipcRenderer.invoke('knowledge-cards:generate-deck', input),
    exportDeck: id => ipcRenderer.invoke('knowledge-cards:export-deck', id),
    recordAttempt: input => ipcRenderer.invoke('knowledge-cards:attempt', input),
    judgeAttempt: input => ipcRenderer.invoke('knowledge-cards:judge-attempt', input),
    listAttempts: query => ipcRenderer.invoke('knowledge-cards:attempts', query),
    clearPracticeHistory: confirmed => ipcRenderer.invoke('knowledge-cards:clear-practice', confirmed),
    update: (id, input, revision) => ipcRenderer.invoke('knowledge-cards:update', id, input, revision),
    reviewQueue: () => ipcRenderer.invoke('knowledge-cards:review-queue'),
    gradeReview: input => ipcRenderer.invoke('knowledge-cards:grade-review', input),
    list: query => ipcRenderer.invoke('knowledge-cards:list', query),
    save: input => ipcRenderer.invoke('knowledge-cards:save', input),
    listPreserved: () => ipcRenderer.invoke('knowledge-cards:preserved'),
    remove: id => ipcRenderer.invoke('knowledge-cards:remove', id),
    setMemorizing: (id, memorizing) => ipcRenderer.invoke('knowledge-cards:set-memorizing', id, memorizing),
  } satisfies import('../shared/types/knowledge-cards').KnowledgeCardsAPI,
  knowledgeHistory: {
    versions: (id:string,before?:number)=>ipcRenderer.invoke('knowledge-history:request','versions',{id,before}),
    snapshot: (id,revision)=>ipcRenderer.invoke('knowledge-history:request','snapshot',{id,revision}),
    restore: (id,revision,expected,keepExistingAssociations)=>ipcRenderer.invoke('knowledge-history:request','restore',{id,revision,expected,keepExistingAssociations}),
    trash: ()=>ipcRenderer.invoke('knowledge-history:request','trash'),
    erase: (id,removeManagedBackups)=>ipcRenderer.invoke('knowledge-history:request','erase',{id,removeManagedBackups}),
    questions: ()=>ipcRenderer.invoke('knowledge-history:request','questions'),
    setQuestion: (id,status)=>ipcRenderer.invoke('knowledge-history:request','question-set',{id,status}),
    captureEnabled: ()=>ipcRenderer.invoke('knowledge-history:request','capture-enabled'),
    setCapture: enabled=>ipcRenderer.invoke('knowledge-history:request','capture-set',{enabled}),
    conversionReport: ()=>ipcRenderer.invoke('knowledge-history:request','conversion-report'),
    reading: workId=>ipcRenderer.invoke('knowledge-history:request','reading',{workId}),
    saveReflection: input=>ipcRenderer.invoke('knowledge-history:request','reflection-save',input),
    addAction: (id,title)=>ipcRenderer.invoke('knowledge-history:request','action',{id,title}),
    addQuote: (id,text)=>ipcRenderer.invoke('knowledge-history:request','quote',{id,text}),
    addComment: (id,text,options?)=>ipcRenderer.invoke('knowledge-history:request','comment',{id,text,...(options?.parentId?{parentId:options.parentId}:{}),...(options?.anchor?{anchor:options.anchor}:{}),...(options?.actor?{actor:options.actor}:{})}),
    comments: id=>ipcRenderer.invoke('knowledge-history:request','comments',{id}),
    commentCounts: ()=>ipcRenderer.invoke('knowledge-history:request','comment-counts'),
    commentTotals: ()=>ipcRenderer.invoke('knowledge-history:request','comment-totals') as Promise<Record<string,{open:number;total:number}>>,
    editComment: (commentId,text,actor)=>ipcRenderer.invoke('knowledge-history:request','comment-edit',{commentId,text,actor}),
    resolveComment: (commentId,resolved,actor)=>ipcRenderer.invoke('knowledge-history:request','comment-resolve',{commentId,resolved,actor}),
    removeComment: (commentId,actor)=>ipcRenderer.invoke('knowledge-history:request','comment-remove',{commentId,actor}),
  } satisfies import('../shared/knowledge-history').HistoryAPI,
  commentary: {
    list: reference=>ipcRenderer.invoke('knowledge-history:request','commentary-list',{reference}),
    search: query=>ipcRenderer.invoke('knowledge-history:request','commentary-search',{query}),
    save: input=>ipcRenderer.invoke('knowledge-history:request','commentary-save',input),
    remove: id=>ipcRenderer.invoke('knowledge-history:request','commentary-remove',{id}),
  } satisfies import('../shared/personal-commentary').CommentaryAPI,
  studyNotes: {
    list: () => ipcRenderer.invoke('study-notes:list') as Promise<import('../shared/study-notes').StudyNote[]>,
    save: (input: StudyNoteInput) => ipcRenderer.invoke('study-notes:save', input) as Promise<import('../shared/study-notes').StudyNote>,
    remove: (id: string) => ipcRenderer.invoke('study-notes:remove', id) as Promise<void>,
    exportMarkdown: (ids?: string[]) => ipcRenderer.invoke('study-notes:export-markdown', ids) as Promise<{ folder: string; count: number } | null>,
    exportWord: (ids: string[], language: string, layout?: import('../shared/word-export').WordLayout) => ipcRenderer.invoke('study-notes:export-word', ids, language, layout) as Promise<{ file: string; count: number } | null>,
    onChanged: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('study-notes:changed', listener);
      return () => { ipcRenderer.removeListener('study-notes:changed', listener); };
    },
  },
  pdfCompare: {
    run: (workA: string, workB: string, options?: { ignoreDiacritics?: boolean }) => ipcRenderer.invoke('pdf-compare:run', workA, workB, options) as Promise<{ ok: true; data: import('../shared/text-compare').CompareResult & { limited: boolean } } | { ok: false; error: string }>,
  },
  appClose: {
    /** The window asks before closing; answer with answer(true) to close or answer(false) to stay. */
    onRequested: (listener: () => void) => { const wrapped = () => listener(); ipcRenderer.on('app:close-requested', wrapped); return () => { ipcRenderer.removeListener('app:close-requested', wrapped); }; },
    answer: (close: boolean) => ipcRenderer.send('app:close-answer', close),
  },
  materialSave: (() => {
    type R<T> = Promise<{ ok: true; data: T } | { ok: false; error: string }>;
    return {
      policy: () => ipcRenderer.invoke('material-save:policy') as R<{ policy: import('../shared/material-save').SavePolicy; backupFolder: string; defaultFolder: string }>,
      setPolicy: (policy: import('../shared/material-save').SavePolicy) => ipcRenderer.invoke('material-save:set-policy', policy) as R<import('../shared/material-save').SavePolicy>,
      chooseFolder: (language: string) => ipcRenderer.invoke('material-save:choose-folder', language) as R<string | null>,
      status: (workId: string) => ipcRenderer.invoke('material-save:status', workId) as R<import('../shared/material-save').MaterialSaveStatus>,
      save: (workId: string) => ipcRenderer.invoke('material-save:save', workId) as R<{ written: boolean; reason?: string; externalChange?: boolean }>,
      exportCopy: (workId: string, options: import('../shared/material-save').ExportOptions, language: string) => ipcRenderer.invoke('material-save:export', workId, options, language) as R<{ path: string; items: number; bookmarks: number } | null>,
      restoreEmergency: (workId: string) => ipcRenderer.invoke('material-save:restore-emergency', workId) as R<void>,
      resolveIncident: (workId: string) => ipcRenderer.invoke('material-save:resolve', workId) as R<void>,
      undo: (workId: string) => ipcRenderer.invoke('material-save:undo', workId) as R<{ batch: string; items: number; action: string }>,
      redo: (workId: string) => ipcRenderer.invoke('material-save:redo', workId) as R<{ batch: string; items: number; action: string }>,
    };
  })(),
  studyAssistant: {
    resumeExplainBack: (id:string) => ipcRenderer.invoke('study-assistant:resume-explain-back',id) as Promise<import('../shared/explain-back').ExplainResult<import('../shared/explain-back').ExplainCheck>>,
    explainBack: (request: import('../shared/explain-back').ExplainRequest) => ipcRenderer.invoke('study-assistant:explain-back',request) as Promise<import('../shared/explain-back').ExplainResult<import('../shared/explain-back').ExplainCheck>>,
    acceptExplainBack: (input: import('../shared/explain-back').ExplainAcceptance) => ipcRenderer.invoke('study-assistant:accept-explain-back',input) as Promise<import('../shared/explain-back').ExplainResult<{attempt: import('../shared/practice').PracticeAttempt;note: import('../shared/study-notes').StudyNote}>>,
    ask: (request: import('../shared/study-assistant').AssistantRequest) => ipcRenderer.invoke('study-assistant:ask', request) as Promise<{ ok: true; data: import('../shared/study-assistant').AssistantAnswer } | { ok: false; error: string; target?: string }>,
  },
  boards: {
    list: () => ipcRenderer.invoke('boards:list') as Promise<import('../shared/boards').BoardSummary[]>,
    get: (id: string) => ipcRenderer.invoke('boards:get', id) as Promise<import('../shared/boards').Board | null>,
    save: (input: import('../shared/boards').BoardInput) => ipcRenderer.invoke('boards:save', input) as Promise<import('../shared/boards').Board>,
    remove: (id: string) => ipcRenderer.invoke('boards:remove', id) as Promise<void>,
    onChanged: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('boards:changed', listener);
      return () => { ipcRenderer.removeListener('boards:changed', listener); };
    },
  },
  knowledge: {
    getByWork: (workId: string, type?: string) => ipcRenderer.invoke('knowledge:get-by-work', workId, type),
    getAll: () => ipcRenderer.invoke('knowledge:get-all'),
    save: (payload: unknown) => ipcRenderer.invoke('knowledge:save', payload),
    delete: (knowledgeId: string, actor?: 'reader') => ipcRenderer.invoke('knowledge:delete', knowledgeId, actor),
  },

  // Reader Session & Continuous Location Tracking
  reader: {
    recordSession: (session: unknown) => ipcRenderer.invoke('reader:record-session', session),
    getSessions: (workId: string) => ipcRenderer.invoke('reader:get-sessions', workId),
    updateLastLocation: (workId: string, location: string) => ipcRenderer.invoke('reader:update-last-location', workId, location),
    getLastLocation: (workId: string) => ipcRenderer.invoke('reader:get-last-location', workId),
  },
};

if (typeof contextBridge !== 'undefined' && contextBridge?.exposeInMainWorld) {
  contextBridge.exposeInMainWorld('electronAPI', API);
}

export type ElectronAPI = typeof API;


