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

  describe('Drag & Drop Bilingual Translations', () => {
    it('verifies drag and drop prompt translations exist and are localized in Arabic and English', () => {
      assert.ok(translations.ar.dropBookHere.includes('أفلت'));
      assert.ok(translations.en.dropBookHere.includes('Drop'));
      assert.ok(translations.ar.dropBookSubtitle.length > 0);
      assert.ok(translations.en.dropBookSubtitle.length > 0);
      assert.ok(translations.ar.dropInvalidFile.includes('PDF'));
      assert.ok(translations.en.dropInvalidFile.includes('PDF'));
    });

    it('verifies toast messages for drag-drop and file replacement exist', () => {
      assert.ok(translations.ar.bookAddedFromDrop.includes('{title}'));
      assert.ok(translations.en.bookAddedFromDrop.includes('{title}'));
      assert.strictEqual(
        translations.ar.metadataUpdatedFromNewFile,
        'تم تحديث بيانات الكتاب والغلاف بناءً على الملف الجديد بنجاح!'
      );
      assert.strictEqual(
        translations.en.metadataUpdatedFromNewFile,
        'Metadata and cover updated from the new file successfully!'
      );
    });
  });

  describe('File Replacement Metadata Overwrite Logic', () => {
    interface BookFormMetadata {
      title: string;
      author: string;
      publisher: string;
      year: string;
      isbn: string;
      digitalFormat: string;
      fileSize: string;
      filePath: string;
      coverImage?: string;
      abstract?: string;
    }

    interface ExtractedOfflineMetadata {
      title?: string;
      authors?: string[];
      publisher?: string;
      publishYear?: number;
      isbn?: string;
      coverImage?: string;
      description?: string;
    }

    const applyFileReplacement = (
      prev: BookFormMetadata,
      newFilePath: string,
      fileName: string,
      fileSizeStr: string,
      extracted: ExtractedOfflineMetadata,
      renderedCover?: string
    ): BookFormMetadata => {
      const ext = fileName.split('.').pop()?.toUpperCase() || 'PDF';
      const cleanName = fileName.replace(/\.[^/.]+$/, '').replace(/[-_.]+/g, ' ').trim();
      const newTitle = (extracted.title && extracted.title.trim().length > 0) ? extracted.title.trim() : cleanName;
      const newAuthor = (extracted.authors && extracted.authors.length > 0) ? extracted.authors.join(', ') : '';

      return {
        ...prev,
        title: newTitle,
        author: newAuthor,
        publisher: extracted.publisher || '',
        year: extracted.publishYear ? String(extracted.publishYear) : '',
        isbn: extracted.isbn || '',
        coverImage: renderedCover || extracted.coverImage || undefined,
        digitalFormat: ext,
        fileSize: fileSizeStr,
        filePath: newFilePath,
        abstract: extracted.description || '',
      };
    };

    it('replaces all metadata fields when choosing a different file in BookDetailModal', () => {
      const fileAState: BookFormMetadata = {
        title: 'Algorithms 101',
        author: 'Robert Sedgewick',
        publisher: 'Addison-Wesley',
        year: '2011',
        isbn: '978-0321573513',
        digitalFormat: 'PDF',
        fileSize: '15.4 MB',
        filePath: 'C:\\Books\\Algorithms101.pdf',
        coverImage: 'data:image/jpeg;base64,OLDFILEACOVER',
        abstract: 'An introduction to computer algorithms.',
      };

      const fileBMetadata: ExtractedOfflineMetadata = {
        title: 'Clean Architecture',
        authors: ['Robert C. Martin'],
        publisher: 'Prentice Hall',
        publishYear: 2017,
        isbn: '978-0134494166',
        description: 'A craftsman guide to software structure.',
      };

      const updatedState = applyFileReplacement(
        fileAState,
        'C:\\Books\\Clean_Architecture.epub',
        'Clean_Architecture.epub',
        '4.2 MB',
        fileBMetadata,
        'data:image/png;base64,NEWFILEBCOVER'
      );

      // Verifies old file metadata is completely overwritten with the new file's metadata
      assert.strictEqual(updatedState.title, 'Clean Architecture');
      assert.strictEqual(updatedState.author, 'Robert C. Martin');
      assert.strictEqual(updatedState.publisher, 'Prentice Hall');
      assert.strictEqual(updatedState.year, '2017');
      assert.strictEqual(updatedState.isbn, '978-0134494166');
      assert.strictEqual(updatedState.digitalFormat, 'EPUB');
      assert.strictEqual(updatedState.fileSize, '4.2 MB');
      assert.strictEqual(updatedState.filePath, 'C:\\Books\\Clean_Architecture.epub');
      assert.strictEqual(updatedState.coverImage, 'data:image/png;base64,NEWFILEBCOVER');
      assert.strictEqual(updatedState.abstract, 'A craftsman guide to software structure.');
    });

    it('falls back to cleaned filename when new file has no embedded metadata', () => {
      const existingState: BookFormMetadata = {
        title: 'Old Title',
        author: 'Old Author',
        publisher: 'Old Publisher',
        year: '1999',
        isbn: '1234567890',
        digitalFormat: 'PDF',
        fileSize: '1.0 MB',
        filePath: 'C:\\Books\\Old.pdf',
      };

      const updatedState = applyFileReplacement(
        existingState,
        'C:\\Books\\Muqaddimah_Ibn_Khaldun.pdf',
        'Muqaddimah_Ibn_Khaldun.pdf',
        '8.5 MB',
        {} // no embedded metadata
      );

      assert.strictEqual(updatedState.title, 'Muqaddimah Ibn Khaldun');
      assert.strictEqual(updatedState.author, '');
      assert.strictEqual(updatedState.publisher, '');
      assert.strictEqual(updatedState.year, '');
      assert.strictEqual(updatedState.digitalFormat, 'PDF');
      assert.strictEqual(updatedState.fileSize, '8.5 MB');
    });
  });

  describe('Supported Digital Book File Formats', () => {
    const isSupportedBookExtension = (filename: string): boolean => {
      const ext = filename.split('.').pop()?.toLowerCase();
      const valid = ['pdf', 'epub', 'mobi', 'azw', 'azw3', 'txt', 'html', 'htm', 'djvu', 'fb2'];
      return Boolean(ext && valid.includes(ext));
    };

    it('accepts standard digital book formats', () => {
      assert.strictEqual(isSupportedBookExtension('book.pdf'), true);
      assert.strictEqual(isSupportedBookExtension('novel.epub'), true);
      assert.strictEqual(isSupportedBookExtension('kindle.mobi'), true);
      assert.strictEqual(isSupportedBookExtension('document.azw3'), true);
      assert.strictEqual(isSupportedBookExtension('text.txt'), true);
      assert.strictEqual(isSupportedBookExtension('scan.djvu'), true);
    });

    it('rejects non-book files', () => {
      assert.strictEqual(isSupportedBookExtension('installer.exe'), false);
      assert.strictEqual(isSupportedBookExtension('archive.zip'), false);
      assert.strictEqual(isSupportedBookExtension('photo.png'), false);
      assert.strictEqual(isSupportedBookExtension('audio.mp3'), false);
    });
  });
});

