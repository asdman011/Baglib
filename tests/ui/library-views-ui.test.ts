import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translations } from '../../src/renderer/translations';

describe('Library Views UI & Translations (Story 9 / KEY-106..111)', () => {
  it('has comprehensive bilingual translations for pagination controls (KEY-106)', () => {
    const ar = translations.ar;
    const en = translations.en;

    assert.ok(ar.paginationPrevious, 'Arabic paginationPrevious exists');
    assert.ok(en.paginationPrevious, 'English paginationPrevious exists');
    assert.ok(ar.paginationNext, 'Arabic paginationNext exists');
    assert.ok(en.paginationNext, 'English paginationNext exists');
    assert.ok(ar.paginationShowingRange, 'Arabic paginationShowingRange exists');
    assert.ok(en.paginationShowingRange, 'English paginationShowingRange exists');
    assert.ok(ar.paginationItemsPerPage, 'Arabic paginationItemsPerPage exists');
    assert.ok(en.paginationItemsPerPage, 'English paginationItemsPerPage exists');
    assert.ok(ar.paginationJumpTo, 'Arabic paginationJumpTo exists');
    assert.ok(en.paginationJumpTo, 'English paginationJumpTo exists');
    assert.ok(ar.paginationGo, 'Arabic paginationGo exists');
    assert.ok(en.paginationGo, 'English paginationGo exists');
  });

  it('has comprehensive bilingual translations for multi-criteria sorting (KEY-107)', () => {
    const ar = translations.ar;
    const en = translations.en;

    assert.ok(ar.sortLabel, 'Arabic sortLabel exists');
    assert.ok(en.sortLabel, 'English sortLabel exists');
    assert.ok(ar.sortReadingProgress, 'Arabic sortReadingProgress exists');
    assert.ok(en.sortReadingProgress, 'English sortReadingProgress exists');
    assert.ok(ar.sortLocation, 'Arabic sortLocation exists');
    assert.ok(en.sortLocation, 'English sortLocation exists');
    assert.ok(ar.sortDirectionAsc, 'Arabic sortDirectionAsc exists');
    assert.ok(en.sortDirectionAsc, 'English sortDirectionAsc exists');
    assert.ok(ar.sortDirectionDesc, 'Arabic sortDirectionDesc exists');
    assert.ok(en.sortDirectionDesc, 'English sortDirectionDesc exists');
  });

  it('has bilingual translations for card and list densities (KEY-108, KEY-109)', () => {
    const ar = translations.ar;
    const en = translations.en;

    assert.ok(ar.densityLabel, 'Arabic densityLabel exists');
    assert.ok(en.densityLabel, 'English densityLabel exists');
    assert.ok(ar.densityCompact, 'Arabic densityCompact exists');
    assert.ok(en.densityCompact, 'English densityCompact exists');
    assert.ok(ar.densityComfortable, 'Arabic densityComfortable exists');
    assert.ok(en.densityComfortable, 'English densityComfortable exists');
    assert.ok(ar.densitySpacious, 'Arabic densitySpacious exists');
    assert.ok(en.densitySpacious, 'English densitySpacious exists');
    assert.ok(ar.densityNormal, 'Arabic densityNormal exists');
    assert.ok(en.densityNormal, 'English densityNormal exists');
    assert.ok(ar.densityRowCompact, 'Arabic densityRowCompact exists');
    assert.ok(en.densityRowCompact, 'English densityRowCompact exists');
  });

  it('has bilingual translations for column selector and headers (KEY-109)', () => {
    const ar = translations.ar;
    const en = translations.en;

    assert.ok(ar.columnsCustomizer, 'Arabic columnsCustomizer exists');
    assert.ok(en.columnsCustomizer, 'English columnsCustomizer exists');
    assert.ok(ar.columnCover, 'Arabic columnCover exists');
    assert.ok(en.columnCover, 'English columnCover exists');
    assert.ok(ar.columnTitle, 'Arabic columnTitle exists');
    assert.ok(en.columnTitle, 'English columnTitle exists');
    assert.ok(ar.columnCategory, 'Arabic columnCategory exists');
    assert.ok(en.columnCategory, 'English columnCategory exists');
    assert.ok(ar.columnFormat, 'Arabic columnFormat exists');
    assert.ok(en.columnFormat, 'English columnFormat exists');
    assert.ok(ar.columnLocation, 'Arabic columnLocation exists');
    assert.ok(en.columnLocation, 'English columnLocation exists');
    assert.ok(ar.columnStatus, 'Arabic columnStatus exists');
    assert.ok(en.columnStatus, 'English columnStatus exists');
    assert.ok(ar.columnActions, 'Arabic columnActions exists');
    assert.ok(en.columnActions, 'English columnActions exists');
    assert.ok(ar.resetColumns, 'Arabic resetColumns exists');
    assert.ok(en.resetColumns, 'English resetColumns exists');
  });

  it('has bilingual translations for bulk actions, batch selection & modals (KEY-110)', () => {
    const ar = translations.ar;
    const en = translations.en;

    assert.ok(ar.batchSelectAllPage, 'Arabic batchSelectAllPage exists');
    assert.ok(en.batchSelectAllPage, 'English batchSelectAllPage exists');
    assert.ok(ar.batchDeselectAll, 'Arabic batchDeselectAll exists');
    assert.ok(en.batchDeselectAll, 'English batchDeselectAll exists');
    assert.ok(ar.batchSelectedCount, 'Arabic batchSelectedCount exists');
    assert.ok(en.batchSelectedCount, 'English batchSelectedCount exists');
    assert.ok(ar.bulkAssignCategory, 'Arabic bulkAssignCategory exists');
    assert.ok(en.bulkAssignCategory, 'English bulkAssignCategory exists');
    assert.ok(ar.bulkAddTagsBtn, 'Arabic bulkAddTagsBtn exists');
    assert.ok(en.bulkAddTagsBtn, 'English bulkAddTagsBtn exists');
    assert.ok(ar.bulkChangeStatus, 'Arabic bulkChangeStatus exists');
    assert.ok(en.bulkChangeStatus, 'English bulkChangeStatus exists');
    assert.ok(ar.bulkExportData, 'Arabic bulkExportData exists');
    assert.ok(en.bulkExportData, 'English bulkExportData exists');
    assert.ok(ar.bulkDeleteBtn, 'Arabic bulkDeleteBtn exists');
    assert.ok(en.bulkDeleteBtn, 'English bulkDeleteBtn exists');
    assert.ok(ar.bulkDeleteConfirmDesc, 'Arabic bulkDeleteConfirmDesc exists');
    assert.ok(en.bulkDeleteConfirmDesc, 'English bulkDeleteConfirmDesc exists');
  });
});
