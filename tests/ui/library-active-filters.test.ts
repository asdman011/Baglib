import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  countActiveAdvancedFilters,
  getActiveFilterChipsList,
  type LibraryFilterState,
} from '../../src/renderer/components/library/library-filter-model';

describe('Library Active Filters & Chips (KEY-310)', () => {
  it('returns 0 count and empty chips for pristine filter state', () => {
    const emptyState: LibraryFilterState = {
      searchQuery: '',
      selectedTopics: [],
      selectedAuthors: [],
      selectedReadingStatus: 'ALL',
      selectedBookType: 'ALL',
      selectedFormat: 'ALL',
      selectedStorageFilter: 'ALL',
      selectedLocation: 'ALL',
      lendingStatus: 'ALL',
      activeLibraryCategory: 'ALL',
      selectedTag: 'ALL',
    };

    assert.strictEqual(countActiveAdvancedFilters(emptyState), 0);
    assert.deepStrictEqual(getActiveFilterChipsList(emptyState), []);
  });

  it('treats search query as a chip but does not count towards advanced filter badge', () => {
    const searchOnly: LibraryFilterState = {
      searchQuery: 'الغزالي',
    };

    assert.strictEqual(countActiveAdvancedFilters(searchOnly), 0);
    const chips = getActiveFilterChipsList(searchOnly);
    assert.strictEqual(chips.length, 1);
    assert.strictEqual(chips[0].type, 'search');
    assert.strictEqual(chips[0].label, '"الغزالي"');
    assert.deepStrictEqual(chips[0].onClear, { searchQuery: '' });
  });

  it('accurately counts advanced filters and produces chips with onClear transitions', () => {
    const state: LibraryFilterState = {
      searchQuery: 'ابن رشد',
      selectedTopics: ['cat-phil', '#فلسفة'],
      selectedAuthors: ['أبو الوليد ابن رشد'],
      selectedReadingStatus: 'reading',
      selectedBookType: 'physical',
      selectedFormat: 'PDF',
      selectedLocation: 'الرف الأول',
      lendingStatus: 'AVAILABLE',
      selectedStorageFilter: 'HEALTHY',
    };

    // 2 topics + 1 author + status + bookType + format + location + lending + storage = 9
    assert.strictEqual(countActiveAdvancedFilters(state), 9);

    const chips = getActiveFilterChipsList(state, {
      topicNameResolver: (id) => (id === 'cat-phil' ? 'الفلسفة' : id),
      labels: {
        physical: 'نسخة ورقية',
        digital: 'رقمي',
        readingStatusPrefix: 'الحالة',
        statusReading: 'قيد القراءة',
      },
    });

    assert.strictEqual(chips.length, 10); // 1 search + 9 advanced

    // Verify search chip
    assert.strictEqual(chips[0].type, 'search');

    // Verify topic chips
    const topic1 = chips.find((c) => c.id === 'topic-cat-phil');
    assert.ok(topic1);
    assert.strictEqual(topic1.label, 'الفلسفة');
    assert.deepStrictEqual(topic1.onClear, { selectedTopics: ['#فلسفة'] });

    // Verify author chip
    const authorChip = chips.find((c) => c.id === 'author-أبو الوليد ابن رشد');
    assert.ok(authorChip);
    assert.deepStrictEqual(authorChip.onClear, { selectedAuthors: [] });

    // Verify status chip
    const statusChip = chips.find((c) => c.id === 'status');
    assert.ok(statusChip);
    assert.strictEqual(statusChip.label, 'الحالة: قيد القراءة');
    assert.deepStrictEqual(statusChip.onClear, { selectedReadingStatus: 'ALL' });

    // Verify bookType chip
    const typeChip = chips.find((c) => c.id === 'bookType');
    assert.ok(typeChip);
    assert.strictEqual(typeChip.label, 'نسخة ورقية');
    assert.deepStrictEqual(typeChip.onClear, { selectedBookType: 'ALL' });
  });

  it('handles category dropdown and tag filters correctly', () => {
    const state: LibraryFilterState = {
      activeLibraryCategory: 'cat-history',
      selectedTag: '#نادر',
    };

    assert.strictEqual(countActiveAdvancedFilters(state), 2);
    const chips = getActiveFilterChipsList(state);
    assert.strictEqual(chips.length, 1); // tag chip (category has activeLibraryCategory)
    const tagChip = chips.find((c) => c.id === 'tag');
    assert.ok(tagChip);
    assert.strictEqual(tagChip.label, '#نادر');
    assert.deepStrictEqual(tagChip.onClear, { selectedTag: 'ALL' });
  });
});
