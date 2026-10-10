import { contextBridge, ipcRenderer } from 'electron';

export const API = {
  getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
  openFileDialog: () => ipcRenderer.invoke('system:open-file-dialog'),
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
  safeDownload: (url: string, filename: string) =>
    ipcRenderer.invoke('library:safe-download', url, filename),
  showItemInFolder: (filePath: string) =>
    ipcRenderer.invoke('library:show-item-in-folder', filePath),
  openFile: (filePath: string) =>
    ipcRenderer.invoke('library:open-file', filePath),


  // Categories
  getCategoryTree: () => ipcRenderer.invoke('library:get-category-tree'),
  getCategoryBreadcrumbs: (categoryId: string) => ipcRenderer.invoke('library:get-category-breadcrumbs', categoryId),
  getSubtreeWorkIds: (categoryId: string) => ipcRenderer.invoke('library:get-subtree-work-ids', categoryId),

  // Knowledge Layer
  getAllNotes: () => ipcRenderer.invoke('library:get-all-notes'),
  addNote: (noteData: any) => ipcRenderer.invoke('library:add-note', noteData),
  deleteNote: (noteId: string) => ipcRenderer.invoke('library:delete-note', noteId),

  onNotification: (callback: (message: string) => void) => {
    const subscription = (_: any, value: string) => callback(value);
    ipcRenderer.on('system:notification', subscription);
    return () => ipcRenderer.removeListener('system:notification', subscription);
  },
};

contextBridge.exposeInMainWorld('electronAPI', API);

export type ElectronAPI = typeof API;

