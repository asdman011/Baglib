'use client';

import React, { useState } from 'react';
import {
  Search,
  X,
  SlidersHorizontal,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Layers,
  Users,
  BookOpen,
  HardDrive,
  MapPin,
  UserCheck,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
} from 'lucide-react';
import type { BookItem } from '../../../shared/types/work';
import {
  type SortField,
  type LibraryFilterState,
  type LibrarySortState,
  getAvailableTopicsWithCounts,
  getTopAuthorsWithCounts,
  formatLocalizedNumber,
} from './library-filter-model';
import { Chip } from '../ui/Chip';
import { useWorkspace } from '../context/WorkspaceContext';
import { ColumnSelectorDropdown } from './ColumnSelectorDropdown';
import type {
  CardDensity,
  ListDensity,
  ListColumnKey,
} from '../../../shared/types/library-views';

export interface LibraryFilterRailProps {
  filterState: LibraryFilterState;
  onFilterChange: (updates: Partial<LibraryFilterState>) => void;
  onClearFilters: () => void;
  allCategories: { id: string; nameAr: string; nameEn: string }[];
  books: BookItem[];
  availableLocations: string[];
  sortState: LibrarySortState;
  onSortChange: (sort: LibrarySortState) => void;
  className?: string;
  isSheet?: boolean;
  onCloseSheet?: () => void;
  cardDensity?: CardDensity;
  onCardDensityChange?: (density: CardDensity) => void;
  listDensity?: ListDensity;
  onListDensityChange?: (density: ListDensity) => void;
  viewMode?: 'grid' | 'list';
  visibleColumns?: ListColumnKey[];
  onToggleColumn?: (col: ListColumnKey) => void;
  onResetColumns?: () => void;
}

export const LibraryFilterRail: React.FC<LibraryFilterRailProps> = ({
  filterState,
  onFilterChange,
  onClearFilters,
  allCategories,
  books,
  availableLocations,
  sortState,
  onSortChange,
  className = '',
  isSheet = false,
  onCloseSheet,
  cardDensity = 'comfortable',
  onCardDensityChange,
  listDensity = 'normal',
  onListDensityChange,
  viewMode = 'grid',
  visibleColumns,
  onToggleColumn,
  onResetColumns,
}) => {
  const { t, lang } = useWorkspace();
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [showAllAuthors, setShowAllAuthors] = useState(false);
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);

  const availableTopics = getAvailableTopicsWithCounts(books, allCategories, lang);
  const availableAuthors = getTopAuthorsWithCounts(books);

  const selectedTopics = filterState.selectedTopics || [];
  const selectedAuthors = filterState.selectedAuthors || [];

  const visibleTopics = showAllTopics ? availableTopics : availableTopics.slice(0, 8);
  const visibleAuthors = showAllAuthors ? availableAuthors : availableAuthors.slice(0, 6);

  const hasActiveFilters = Boolean(
    (filterState.searchQuery && filterState.searchQuery.trim()) ||
      selectedTopics.length > 0 ||
      selectedAuthors.length > 0 ||
      (filterState.selectedReadingStatus && filterState.selectedReadingStatus !== 'ALL') ||
      (filterState.selectedBookType && filterState.selectedBookType !== 'ALL') ||
      (filterState.selectedFormat && filterState.selectedFormat !== 'ALL') ||
      (filterState.selectedStorageFilter && filterState.selectedStorageFilter !== 'ALL') ||
      (filterState.selectedLocation && filterState.selectedLocation !== 'ALL') ||
      (filterState.lendingStatus && filterState.lendingStatus !== 'ALL') ||
      (filterState.activeLibraryCategory && filterState.activeLibraryCategory !== 'ALL') ||
      (filterState.selectedTag && filterState.selectedTag !== 'ALL')
  );

  const toggleTopic = (topicId: string) => {
    const next = selectedTopics.includes(topicId)
      ? selectedTopics.filter((id) => id !== topicId)
      : [...selectedTopics, topicId];
    onFilterChange({ selectedTopics: next });
  };

  const toggleAuthor = (authorName: string) => {
    const next = selectedAuthors.includes(authorName)
      ? selectedAuthors.filter((a) => a !== authorName)
      : [...selectedAuthors, authorName];
    onFilterChange({ selectedAuthors: next });
  };

  return (
    <aside
      className={`flex flex-col space-y-4 text-xs font-sans text-text select-none ${className}`}
      data-library-filter-rail
    >
      {/* Rail Header with Clear Button */}
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/60">
        <div className="flex items-center gap-1.5 font-display font-bold text-sm text-text">
          <Filter className="size-4 text-primary-text shrink-0" aria-hidden="true" />
          <span>{t('filterTopics')}</span>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="flex items-center gap-1 text-[11px] font-medium text-accent hover:underline cursor-pointer"
            title={t('clearAllFilters')}
           aria-label={t('clearAllFilters')}>
            <RotateCcw className="size-3" aria-hidden="true" />
            <span>{t('clearAllFilters')}</span>
          </button>
        )}
      </div>

      {/* Filter Search Input */}
      <div className="relative flex items-center">
        <Search className="absolute start-3 size-3.5 text-text-muted pointer-events-none" aria-hidden="true" />
        <input
          type="text"
          value={filterState.searchQuery || ''}
          onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
          placeholder={t('filterSearchPlaceholder')}
          aria-label={t('filterSearchPlaceholder')}
          className="w-full bg-canvas border border-border rounded-xl ps-9 pe-8 py-2 text-xs text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-focus outline-none transition-all"
        />
        {filterState.searchQuery && (
          <button
            type="button"
            onClick={() => onFilterChange({ searchQuery: '' })}
            aria-label={t('searchClearQuery')}
            className="absolute end-2.5 p-0.5 rounded text-text-muted hover:text-text cursor-pointer"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Active Filter Summary with Removable Chips */}
      {hasActiveFilters && (
        <div className="space-y-1.5 p-2.5 rounded-xl bg-canvas border border-border/70">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
            {t('filterSummaryActive')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {filterState.searchQuery && (
              <Chip
                label={`"${filterState.searchQuery}"`}
                removable
                onRemove={() => onFilterChange({ searchQuery: '' })}
              />
            )}
            {selectedTopics.map((topicId) => {
              const topic = availableTopics.find((t) => t.id === topicId);
              const label = topic ? topic.name : topicId;
              return (
                <Chip
                  key={topicId}
                  label={label}
                  selected
                  removable
                  onRemove={() => toggleTopic(topicId)}
                />
              );
            })}
            {selectedAuthors.map((author) => (
              <Chip
                key={author}
                label={author}
                selected
                removable
                onRemove={() => toggleAuthor(author)}
              />
            ))}
            {filterState.selectedReadingStatus && filterState.selectedReadingStatus !== 'ALL' && (
              <Chip
                label={`${t('readingStatus') || 'الحالة'}: ${filterState.selectedReadingStatus}`}
                removable
                onRemove={() => onFilterChange({ selectedReadingStatus: 'ALL' })}
              />
            )}
            {filterState.selectedBookType && filterState.selectedBookType !== 'ALL' && (
              <Chip
                label={filterState.selectedBookType === 'physical' ? t('badgePhysical') : t('badgeDigital')}
                removable
                onRemove={() => onFilterChange({ selectedBookType: 'ALL' })}
              />
            )}
            {filterState.selectedFormat && filterState.selectedFormat !== 'ALL' && (
              <Chip
                label={filterState.selectedFormat}
                removable
                onRemove={() => onFilterChange({ selectedFormat: 'ALL' })}
              />
            )}
          </div>
        </div>
      )}

      {/* Topics Section (Pill Chips from categories and tags) */}
      {availableTopics.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-text">
            <span className="flex items-center gap-1.5">
              <Layers className="size-3.5 text-primary-text" aria-hidden="true" />
              <span>{t('filterTopics')}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleTopics.map((topic) => {
              const isSelected = selectedTopics.includes(topic.id);
              return (
                <div key={topic.id} data-filter-topic-chip className="cursor-pointer">
                  <Chip
                    label={
                      <span className="flex items-center gap-1">
                        <span>{topic.name}</span>
                        {topic.count > 0 && (
                          <span className="text-[10px] opacity-75 font-mono">
                            ({formatLocalizedNumber(topic.count, lang)})
                          </span>
                        )}
                      </span>
                    }
                    selected={isSelected}
                    onSelect={() => toggleTopic(topic.id)}
                  />
                </div>
              );
            })}
          </div>
          {availableTopics.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAllTopics((prev) => !prev)}
              className="text-[11px] text-primary-text hover:underline font-medium cursor-pointer pt-0.5"
            >
              {showAllTopics ? '▲ عرض أقل' : `▼ المزيد (${availableTopics.length - 8})`}
            </button>
          )}
        </div>
      )}

      {/* Authors Section (Checklist with counts) */}
      {availableAuthors.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-border/60">
          <div className="flex items-center justify-between text-xs font-semibold text-text">
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5 text-primary-text" aria-hidden="true" />
              <span>{t('filterAuthors')}</span>
            </span>
          </div>
          <div className="space-y-1">
            {visibleAuthors.map((author) => {
              const isSelected = selectedAuthors.includes(author.name);
              return (
                <label
                  key={author.name}
                  className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary/10 text-primary-text font-medium' : 'hover:bg-canvas text-text'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleAuthor(author.name)}
                      className="size-3.5 rounded border-border accent-primary cursor-pointer"
                    />
                    <span className="truncate text-xs">{author.name}</span>
                  </div>
                  <span className="text-[10px] text-text-muted font-mono shrink-0">
                    {formatLocalizedNumber(author.count, lang)}
                  </span>
                </label>
              );
            })}
          </div>
          {availableAuthors.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAllAuthors((prev) => !prev)}
              className="text-[11px] text-primary-text hover:underline font-medium cursor-pointer pt-0.5"
            >
              {showAllAuthors ? '▲ عرض أقل' : `▼ المزيد (${availableAuthors.length - 6})`}
            </button>
          )}
        </div>
      )}

      {/* More Filters Section (Collapsible Accordion) */}
      <div className="pt-1 border-t border-border/60">
        <button
          type="button"
          onClick={() => setIsMoreFiltersOpen((prev) => !prev)}
          className="w-full flex items-center justify-between py-1 text-xs font-semibold text-text hover:text-primary-text cursor-pointer"
          aria-expanded={isMoreFiltersOpen}
        >
          <span className="flex items-center gap-1.5">
            <SlidersHorizontal className="size-3.5 text-primary-text" aria-hidden="true" />
            <span>{t('filterMore')}</span>
          </span>
          {isMoreFiltersOpen ? (
            <ChevronUp className="size-3.5 text-text-muted" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3.5 text-text-muted" aria-hidden="true" />
          )}
        </button>

        {isMoreFiltersOpen && (
          <div className="space-y-3 pt-2">
            {/* Reading Status */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted flex items-center gap-1">
                <BookOpen className="size-3" aria-hidden="true" />
                <span>{t('colStatus') || 'حالة القراءة'}</span>
              </label>
              <select
                value={filterState.selectedReadingStatus || 'ALL'}
                onChange={(e) => onFilterChange({ selectedReadingStatus: e.target.value })}
                className="w-full bg-canvas border border-border rounded-lg px-2.5 py-1.5 text-xs text-text outline-none cursor-pointer focus-visible:outline-focus"
              >
                <option value="ALL">{t('statusAll') || 'الكل'}</option>
                <option value="unread">{t('statusUnread') || 'لم يُقرأ'}</option>
                <option value="reading">{t('statusReading') || 'قيد القراءة'}</option>
                <option value="completed">{t('statusCompleted') || 'مكتمل'}</option>
              </select>
            </div>

            {/* Book / Material Type */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted">
                {t('workTypeLabel') || 'نوع المادة'}
              </label>
              <select
                value={filterState.selectedBookType || 'ALL'}
                onChange={(e) => onFilterChange({ selectedBookType: e.target.value })}
                className="w-full bg-canvas border border-border rounded-lg px-2.5 py-1.5 text-xs text-text outline-none cursor-pointer focus-visible:outline-focus"
              >
                <option value="ALL">{t('libraryTypeAll')}</option>
                <option value="digital">{t('libraryTypeDigital')}</option>
                <option value="physical">{t('libraryTypePhysical')}</option>
                <option value="hybrid">{t('libraryTypeHybrid')}</option>
              </select>
            </div>

            {/* Digital Format */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted">
                {t('libraryFormatAll') || 'الصيغة'}
              </label>
              <select
                value={filterState.selectedFormat || 'ALL'}
                onChange={(e) => onFilterChange({ selectedFormat: e.target.value })}
                className="w-full bg-canvas border border-border rounded-lg px-2.5 py-1.5 text-xs text-text outline-none cursor-pointer focus-visible:outline-focus"
              >
                <option value="ALL">{t('libraryFormatAll')}</option>
                <option value="PDF">PDF</option>
                <option value="EPUB">EPUB</option>
                <option value="MOBI">MOBI</option>
                <option value="AZW3">AZW3</option>
                <option value="HTML">HTML</option>
                <option value="TXT">TXT</option>
              </select>
            </div>

            {/* Storage Health */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted flex items-center gap-1">
                <HardDrive className="size-3 text-primary-text" aria-hidden="true" />
                <span>{t('storageManagerTitle')}</span>
              </label>
              <select
                value={filterState.selectedStorageFilter || 'ALL'}
                onChange={(e) =>
                  onFilterChange({
                    selectedStorageFilter: e.target.value as 'ALL' | 'HEALTHY' | 'ATTENTION' | 'DUPLICATES',
                  })
                }
                className="w-full bg-canvas border border-border rounded-lg px-2.5 py-1.5 text-xs text-text outline-none cursor-pointer focus-visible:outline-focus truncate"
              >
                <option value="ALL">{t('storageFilterAll')}</option>
                <option value="HEALTHY">{t('storageFilterHealthy')}</option>
                <option value="ATTENTION">{t('storageFilterAttention')}</option>
                <option value="DUPLICATES">{t('storageFilterDuplicates')}</option>
              </select>
            </div>

            {/* Physical Location */}
            {availableLocations.length > 0 && (
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-text-muted flex items-center gap-1">
                  <MapPin className="size-3 text-accent" aria-hidden="true" />
                  <span>{t('filterLocationAll')}</span>
                </label>
                <select
                  value={filterState.selectedLocation || 'ALL'}
                  onChange={(e) => onFilterChange({ selectedLocation: e.target.value })}
                  className="w-full bg-canvas border border-border rounded-lg px-2.5 py-1.5 text-xs text-text outline-none cursor-pointer focus-visible:outline-focus truncate"
                >
                  <option value="ALL">{t('filterLocationAll')}</option>
                  {availableLocations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Lending Status */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted flex items-center gap-1">
                <UserCheck className="size-3 text-accent" aria-hidden="true" />
                <span>{t('filterLendingAll')}</span>
              </label>
              <select
                value={filterState.lendingStatus || 'ALL'}
                onChange={(e) =>
                  onFilterChange({
                    lendingStatus: e.target.value as 'ALL' | 'AVAILABLE' | 'LENT' | 'OVERDUE',
                  })
                }
                className="w-full bg-canvas border border-border rounded-lg px-2.5 py-1.5 text-xs text-text outline-none cursor-pointer focus-visible:outline-focus truncate"
              >
                <option value="ALL">{t('filterLendingAll')}</option>
                <option value="AVAILABLE">{t('filterLendingAvailable')}</option>
                <option value="LENT">{t('filterLendingLoaned')}</option>
                <option value="OVERDUE">{t('filterLendingOverdue')}</option>
              </select>
            </div>

            {/* Sort Selector & Direction */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted flex items-center gap-1">
                <ArrowUpDown className="size-3 text-primary-text" aria-hidden="true" />
                <span>{t('sortLabel')}</span>
              </label>
              <div className="flex items-center gap-1">
                <select
                  value={sortState.field}
                  onChange={(e) => {
                    const f = e.target.value as SortField;
                    const defaultDir = f === 'newest' || f === 'year' || f === 'progress' ? 'desc' : 'asc';
                    onSortChange({ field: f, direction: defaultDir });
                  }}
                  className="flex-1 bg-canvas border border-border rounded-lg px-2.5 py-1.5 text-xs text-text outline-none cursor-pointer focus-visible:outline-focus truncate"
                >
                  <option value="newest">{t('sortNewest') || 'الأحدث أضيفت'}</option>
                  <option value="title">{t('sortTitle') || 'العنوان'}</option>
                  <option value="author">{t('sortAuthor') || 'المؤلف'}</option>
                  <option value="year">{t('sortYear') || 'سنة النشر'}</option>
                  <option value="progress">{t('sortReadingProgress') || 'نسبة الإنجاز'}</option>
                  <option value="location">{t('sortLocation') || 'الموقع والرف'}</option>
                  <option value="category">{t('sortCategory') || 'التصنيف'}</option>
                  <option value="status">{t('colStatus') || 'حالة القراءة'}</option>
                  <option value="format">{t('sortFormat') || 'الصيغة والنوع'}</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    onSortChange({
                      field: sortState.field,
                      direction: sortState.direction === 'asc' ? 'desc' : 'asc',
                    })
                  }
                  title={sortState.direction === 'asc' ? t('sortDirectionAsc') : t('sortDirectionDesc')}
                  className="p-1.5 rounded-lg bg-surface border border-border text-primary-text hover:bg-canvas transition-colors cursor-pointer shrink-0"
                 aria-label={sortState.direction === 'asc' ? t('sortDirectionAsc') : t('sortDirectionDesc')}>
                  {sortState.direction === 'asc' ? (
                    <ArrowUp className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ArrowDown className="size-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Density & Layout Controls (KEY-310: density compact, merged, broad) */}
      <div className="pt-2 border-t border-border/60 space-y-2" data-advanced-density-controls>
        <div className="flex items-center justify-between text-xs font-semibold text-text">
          <span>{t('libraryRibbonView') || 'العرض والكثافة'}</span>
          <span className="text-[10px] text-text-muted font-normal">
            {viewMode === 'grid' ? (t('viewGrid') || 'عرض الشبكة') : (t('viewList') || 'عرض القائمة')}
          </span>
        </div>

        {viewMode === 'grid' && onCardDensityChange && (
          <div className="flex items-center bg-canvas border border-border rounded-xl p-0.5 text-xs">
            <button
              type="button"
              onClick={() => onCardDensityChange('compact')}
              className={`flex-1 py-1.5 rounded-lg transition-all text-center font-medium cursor-pointer ${
                cardDensity === 'compact'
                  ? 'bg-primary/15 text-primary-text font-bold'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {t('densityCompact').split(' ')[0]}
            </button>
            <button
              type="button"
              onClick={() => onCardDensityChange('comfortable')}
              className={`flex-1 py-1.5 rounded-lg transition-all text-center font-medium cursor-pointer ${
                cardDensity === 'comfortable'
                  ? 'bg-primary/15 text-primary-text font-bold'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {t('densityComfortable').split(' ')[0]}
            </button>
            <button
              type="button"
              onClick={() => onCardDensityChange('spacious')}
              className={`flex-1 py-1.5 rounded-lg transition-all text-center font-medium cursor-pointer ${
                cardDensity === 'spacious'
                  ? 'bg-primary/15 text-primary-text font-bold'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {t('densitySpacious').split(' ')[0]}
            </button>
          </div>
        )}

        {viewMode === 'list' && (
          <div className="space-y-2">
            {onListDensityChange && (
              <button
                type="button"
                onClick={() => onListDensityChange(listDensity === 'compact' ? 'normal' : 'compact')}
                className="w-full py-1.5 px-2.5 rounded-xl border border-border bg-canvas hover:bg-surface text-xs font-medium text-text-muted hover:text-text transition-colors text-center"
              >
                {listDensity === 'compact' ? t('densityNormal') : t('densityRowCompact')}
              </button>
            )}
            {visibleColumns && onToggleColumn && onResetColumns && (
              <ColumnSelectorDropdown
                visibleColumns={visibleColumns}
                onToggleColumn={onToggleColumn}
                onResetColumns={onResetColumns}
              />
            )}
          </div>
        )}
      </div>

      {isSheet && onCloseSheet && (
        <div className="pt-4 border-t border-border/60">
          <button
            type="button"
            onClick={onCloseSheet}
            className="w-full py-2 rounded-xl bg-primary text-primary-contrast font-medium text-xs shadow-xs"
          >
            {t('close')}
          </button>
        </div>
      )}
    </aside>
  );
};
