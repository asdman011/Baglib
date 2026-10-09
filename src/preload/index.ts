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
  deleteBook: (bookId: string) => ipcRenderer.invoke('library:delete-book', bookId),

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

