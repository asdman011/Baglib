import { contextBridge, ipcRenderer } from 'electron';

export const API = {
  getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
  openFileDialog: () => ipcRenderer.invoke('system:open-file-dialog'),
  openFilesDialog: () => ipcRenderer.invoke('system:open-files-dialog'),
  openDirectoryDialog: () => ipcRenderer.invoke('system:open-directory-dialog'),
  readPdfBase64: (filePath: string) => ipcRenderer.invoke('system:read-pdf-base64', filePath),
  extractPdfText: (filePath: string) => ipcRenderer.invoke('system:extract-pdf-text', filePath),

  // Database
  getDatabaseStatus: () => ipcRenderer.invoke('database:get-status'),
  getAllBooks: () => ipcRenderer.invoke('library:get-all-books'),
  addBook: (bookData: any) => ipcRenderer.invoke('library:add-book', bookData),
  updateBook: (bookData: any) => ipcRenderer.invoke('library:update-book', bookData),
  deleteBook: (bookId: string) => ipcRenderer.invoke('library:delete-book', bookId),
  updateReadingStatus: (bookId: string, status: string, progress?: number) =>
    ipcRenderer.invoke('library:update-reading-status', bookId, status, progress),

  // Story 9 Pagination & Bulk Operations
  getPaginatedWorks: (options: any) =>
    ipcRenderer.invoke('library:get-paginated-works', options),
  bulkUpdateCategory: (input: { workIds: string[]; categoryId: string }) =>
    ipcRenderer.invoke('library:bulk-update-category', input),
  bulkUpdateReadingStatus: (input: { workIds: string[]; readingStatus: string; readingProgress?: number }) =>
    ipcRenderer.invoke('library:bulk-update-reading-status', input),
  bulkAddTags: (input: { workIds: string[]; tags: string[] }) =>
    ipcRenderer.invoke('library:bulk-add-tags', input),
  bulkDelete: (input: { workIds: string[] }) =>
    ipcRenderer.invoke('library:bulk-delete', input),

  // Lending Management
  recordLoan: (workId: string, loanData: any) => ipcRenderer.invoke('library:record-loan', workId, loanData),
  returnLoan: (loanId: string, returnDate?: string, condition?: string) =>
    ipcRenderer.invoke('library:return-loan', loanId, returnDate, condition),
  getLendingHistory: (workId: string) => ipcRenderer.invoke('library:get-lending-history', workId),
  getActiveLoans: () => ipcRenderer.invoke('library:get-active-loans'),

  // Online Metadata & External Repositories (Story 5)
  searchLibgen: (query: string, maxResults?: number) =>
    ipcRenderer.invoke('library:search-libgen', query, maxResults),
  searchAnnasArchive: (query: string, maxResults?: number) =>
    ipcRenderer.invoke('library:search-annas', query, maxResults),
  searchBibliographic: (query: any, maxResults?: number) =>
    ipcRenderer.invoke('library:search-bibliographic', query, maxResults),
  getBibliographicDetails: (workId: string) =>
    ipcRenderer.invoke('library:get-bibliographic-details', workId),
  searchBibliographicByIsbn: (isbn: string) =>
    ipcRenderer.invoke('library:search-bibliographic-isbn', isbn),
  lookupMetadata: (params: { isbn?: string; title?: string; author?: string; query?: string; filePath?: string; filename?: string }) =>
    ipcRenderer.invoke('library:lookup-metadata', params),
  parseFilename: (filename: string) =>
    ipcRenderer.invoke('library:parse-filename', filename),
  resolveCover: (options: any) =>
    ipcRenderer.invoke('library:resolve-cover', options),
  extractOfflineMetadata: (params: { filePath?: string; filename?: string }) =>
    ipcRenderer.invoke('library:extract-offline-metadata', params),
  discoverMetadata: (params: { filePath?: string; filename?: string; title?: string; author?: string; isbn?: string; page?: number; deeper?: boolean; offlineOnly?: boolean }) =>
    ipcRenderer.invoke('library:discover-metadata', params),
  extractPdfCover: (filePath: string, pageIndex?: number) =>
    ipcRenderer.invoke('library:extract-pdf-cover', filePath, pageIndex),
  safeDownload: (url: string, filename: string) =>
    ipcRenderer.invoke('library:safe-download', url, filename),
  showItemInFolder: (filePath: string) =>
    ipcRenderer.invoke('library:show-item-in-folder', filePath),
  openFile: (filePath: string) =>
    ipcRenderer.invoke('library:open-file', filePath),

  // Digital E-Book File Validation & Ingestion (Story 6)
  validateDigitalFile: (filePath: string) =>
    ipcRenderer.invoke('digital:validate-file', filePath),
  validateDigitalFiles: (filePaths: string[]) =>
    ipcRenderer.invoke('digital:validate-files', filePaths),
  getSupportedDigitalFormats: () =>
    ipcRenderer.invoke('digital:get-supported-formats'),
  importDigitalFile: (options: any) =>
    ipcRenderer.invoke('digital:import-file', options),
  importDigitalFiles: (optionsList: any[]) =>
    ipcRenderer.invoke('digital:import-files', optionsList),
  extractDigitalMetadata: (filePath: string, formatHint?: string) =>
    ipcRenderer.invoke('digital:extract-metadata', filePath, formatHint),
  checkDigitalDuplicates: (inputs: any[]) =>
    ipcRenderer.invoke('digital:check-duplicates', inputs),
  verifyFileStorage: (workId: string) =>
    ipcRenderer.invoke('digital:verify-file', workId),
  verifyAllFilesStorage: () =>
    ipcRenderer.invoke('digital:verify-files'),
  onDigitalImportProgress: (callback: (progress: any) => void) => {
    const listener = (_e: any, progress: any) => callback(progress);
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
    pruneDuplicate: (options: any) =>
      ipcRenderer.invoke('storage:prune-duplicate', options),
  },

  // Physical Library & Shelving (Story 8 / KEY-5)
  physical: {
    getLocations: () => ipcRenderer.invoke('physical:get-locations'),
    getLocationTree: () => ipcRenderer.invoke('physical:get-location-tree'),
    getInventoryStats: () => ipcRenderer.invoke('physical:get-inventory-stats'),
    updateLocation: (input: any) => ipcRenderer.invoke('physical:update-location', input),
  },

  // Lending Lifecycle & Borrowers (Story 8 / KEY-5)
  lending: {
    borrowBook: (input: any) => ipcRenderer.invoke('lending:borrow-book', input),
    returnBook: (input: any) => ipcRenderer.invoke('lending:return-book', input),
    checkOverdue: () => ipcRenderer.invoke('lending:check-overdue'),
    getHistory: (workId: string) => ipcRenderer.invoke('lending:get-history', workId),
    getAllLoans: (filter?: any) => ipcRenderer.invoke('lending:get-all-loans', filter),
    getBorrowers: () => ipcRenderer.invoke('lending:get-borrowers'),
  },


  // Categories
  getCategoryTree: () => ipcRenderer.invoke('library:get-category-tree'),
  getCategoryBreadcrumbs: (categoryId: string) => ipcRenderer.invoke('library:get-category-breadcrumbs', categoryId),
  getSubtreeWorkIds: (categoryId: string) => ipcRenderer.invoke('library:get-subtree-work-ids', categoryId),

  // Knowledge Layer
  getAllNotes: () => ipcRenderer.invoke('library:get-all-notes'),
  addNote: (noteData: any) => ipcRenderer.invoke('library:add-note', noteData),
  deleteNote: (noteId: string) => ipcRenderer.invoke('library:delete-note', noteId),

  // Application Settings & View Preferences (Story 9)
  settings: {
    get: (key: string, defaultValue?: any) => ipcRenderer.invoke('settings:get', key, defaultValue),
    set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    delete: (key: string) => ipcRenderer.invoke('settings:delete', key),
    getViewPreferences: () => ipcRenderer.invoke('settings:get-view-preferences'),
    saveViewPreferences: (prefs: any) => ipcRenderer.invoke('settings:save-view-preferences', prefs),
  },

  // Quota & Rate-Limiter Tracking
  getQuotaStatus: () => ipcRenderer.invoke('metadata:get-quota-status'),
  setQuotaCountTest: (count: number, date?: string) =>
    ipcRenderer.invoke('metadata:set-quota-count-test', count, date),
  onQuotaWarning: (callback: (payload: any) => void) => {
    const subscription = (_: any, value: any) => callback(value);
    ipcRenderer.on('metadata:quota-warning', subscription);
    return () => ipcRenderer.removeListener('metadata:quota-warning', subscription);
  },

  // Provider Priority & Configuration
  getProviderConfig: () =>
    ipcRenderer.invoke('metadata:get-provider-config'),
  updateProviderConfig: (configs: any) =>
    ipcRenderer.invoke('metadata:update-provider-config', configs),

  onNotification: (callback: (message: string) => void) => {
    const subscription = (_: any, value: string) => callback(value);
    ipcRenderer.on('system:notification', subscription);
    return () => ipcRenderer.removeListener('system:notification', subscription);
  },
};

contextBridge.exposeInMainWorld('electronAPI', API);

export type ElectronAPI = typeof API;

