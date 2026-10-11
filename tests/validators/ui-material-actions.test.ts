import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translations } from '../../src/renderer/translations';

describe('UI Material Import & Metadata Actions Tests', () => {
  describe('Bilingual Translations & Labels', () => {
    it('verifies addBook label has no plus sign in both Arabic and English', () => {
      assert.strictEqual(translations.ar.addBook, 'إضافة مادة');
      assert.strictEqual(translations.en.addBook, 'Add Material');
      assert.strictEqual(translations.ar.addBook.includes('+'), false);
      assert.strictEqual(translations.en.addBook.includes('+'), false);
    });

    it('verifies openLibraryHubBtn and openLibraryHubTooltip exist for Open Library & RSS action', () => {
      assert.strictEqual(translations.ar.openLibraryHubBtn, 'المكتبات المفتوحة & RSS');
      assert.strictEqual(translations.en.openLibraryHubBtn, 'Open Library & RSS');
      assert.ok(translations.ar.openLibraryHubTooltip.length > 0);
      assert.ok(translations.en.openLibraryHubTooltip.length > 0);
    });

    it('verifies removeLinkedFile translation exists in Arabic and English', () => {
      assert.strictEqual(translations.ar.removeLinkedFile, 'إزالة الملف المربوط');
      assert.strictEqual(translations.en.removeLinkedFile, 'Remove Linked File');
    });
  });

  describe('Auto-fill Visibility State Logic', () => {
    // Pure state reducer simulating BookDetailModal file import transitions
    interface ModalFileState {
      filePath?: string;
      isFileImported: boolean;
    }

    const initialModalState = (existingFilePath?: string): ModalFileState => ({
      filePath: existingFilePath,
      isFileImported: Boolean(existingFilePath && existingFilePath.trim().length > 0),
    });

    const onFileImportSuccess = (state: ModalFileState, newPath: string): ModalFileState => ({
      ...state,
      filePath: newPath,
      isFileImported: Boolean(newPath && newPath.trim().length > 0),
    });

    const onFileRemove = (state: ModalFileState): ModalFileState => ({
      ...state,
      filePath: undefined,
      isFileImported: false,
    });

    const onOnlineImport = (state: ModalFileState, importedFilePath?: string): ModalFileState => ({
      ...state,
      filePath: importedFilePath,
      isFileImported: Boolean(importedFilePath && importedFilePath.trim().length > 0),
    });

    it('hides Auto-fill by default when opening modal for a new book without file', () => {
      const state = initialModalState();
      assert.strictEqual(state.isFileImported, false, 'Auto-fill must be hidden by default');
    });

    it('shows Auto-fill when opening an existing book that already has an imported file', () => {
      const state = initialModalState('/path/to/book.pdf');
      assert.strictEqual(state.isFileImported, true, 'Auto-fill must be visible for books with an imported file');
    });

    it('displays Auto-fill only after local material file has been successfully imported', () => {
      let state = initialModalState();
      assert.strictEqual(state.isFileImported, false);

      // Simulating successful file validation & import
      state = onFileImportSuccess(state, 'C:\\Books\\Tafsir.pdf');
      assert.strictEqual(state.isFileImported, true, 'Auto-fill should become visible after successful file import');
    });

    it('hides Auto-fill immediately when user removes the linked file', () => {
      let state = initialModalState('C:\\Books\\Tafsir.pdf');
      assert.strictEqual(state.isFileImported, true);

      // Removing the file
      state = onFileRemove(state);
      assert.strictEqual(state.isFileImported, false, 'Auto-fill must be hidden when file is removed');
      assert.strictEqual(state.filePath, undefined);
    });

    it('displays Auto-fill when a file is downloaded and imported from an online source', () => {
      let state = initialModalState();
      assert.strictEqual(state.isFileImported, false);

      // Shielded download completed with local file path
      state = onOnlineImport(state, 'C:\\Downloads\\Annas_Archive_Item.epub');
      assert.strictEqual(state.isFileImported, true, 'Auto-fill must be visible after online file download and import');
    });

    it('keeps Auto-fill hidden if online import only imports metadata without downloading a file', () => {
      let state = initialModalState();
      assert.strictEqual(state.isFileImported, false);

      // Online import without a downloaded local file path
      state = onOnlineImport(state, undefined);
      assert.strictEqual(state.isFileImported, false, 'Auto-fill must remain hidden if no file was imported');
    });
  });
});
