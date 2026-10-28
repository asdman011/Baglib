'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Search,
  X,
  Check,
  Layers,
} from 'lucide-react';
import type { CategoryNode } from '../../../shared/types/category';

export interface CategoryCascaderProps {
  value?: string | null;
  onChange: (categoryId: string | null, category?: { id: string; nameAr: string; nameEn?: string }) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  allowClear?: boolean;
}

interface FlatCategoryWithAncestors {
  id: string;
  nameAr: string;
  nameEn?: string;
  parentId: string | null;
  pathNames: string[];
  node: CategoryNode;
}

export const CategoryCascader: React.FC<CategoryCascaderProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
  disabled = false,
  allowClear = true,
}) => {
  const { categoryTree, lang, dir, t } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activePath, setActivePath] = useState<string[]>([]); // Array of category IDs for cascader column levels
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const [previousSearchVisibility, setPreviousSearchVisibility] = useState<readonly unknown[] | null>(null);
  const inputsSearchVisibility = [isOpen];
  if (previousSearchVisibility === null || inputsSearchVisibility.some((value, index) => !Object.is(value, previousSearchVisibility[index]))) {
    setPreviousSearchVisibility(inputsSearchVisibility);
    if (!isOpen) setSearchQuery('');
  }

  // Flatten categories with ancestor breadcrumb chains for fast search and display lookup
  const flatCategories = useMemo(() => {
    const result: FlatCategoryWithAncestors[] = [];

    function traverse(nodes: CategoryNode[], path: string[]) {
      for (const node of nodes) {
        const currentName = lang === 'ar' ? (node.nameAr || node.nameEn || '') : (node.nameEn || node.nameAr || '');
        const currentPath = [...path, currentName];
        result.push({
          id: node.id,
          nameAr: node.nameAr,
          nameEn: node.nameEn,
          parentId: node.parentId,
          pathNames: currentPath,
          node,
        });
        if (node.children && node.children.length > 0) {
          traverse(node.children, currentPath);
        }
      }
    }

    traverse(categoryTree, []);
    return result;
  }, [categoryTree, lang]);

  // Map for fast ID lookup
  const flatMap = useMemo(() => {
    const map = new Map<string, FlatCategoryWithAncestors>();
    for (const item of flatCategories) {
      map.set(item.id, item);
    }
    return map;
  }, [flatCategories]);

  // Current selected category item
  const selectedItem = value ? flatMap.get(value) : null;

  // Sync active cascader path when value or isOpen changes
  const [previousResetInputs1, setPreviousResetInputs1] = useState<readonly unknown[] | null>(null);
  const resetInputs1 = [value, flatMap, isOpen];
  if (previousResetInputs1 === null || resetInputs1.some((value, index) => !Object.is(value, previousResetInputs1[index]))) {
    setPreviousResetInputs1(resetInputs1);

    if (value && flatMap.has(value)) {
      // Find ancestor chain IDs
      const chain: string[] = [];
      let curr = flatMap.get(value);
      while (curr) {
        chain.unshift(curr.id);
        curr = curr.parentId ? flatMap.get(curr.parentId) : undefined;
      }
      setActivePath(chain);
    } else {
      setActivePath([]);
    }

  }

  // Filtered categories for search mode
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return flatCategories.filter((item) => {
      const arMatch = item.nameAr.toLowerCase().includes(q);
      const enMatch = item.nameEn ? item.nameEn.toLowerCase().includes(q) : false;
      const pathMatch = item.pathNames.some((p) => p.toLowerCase().includes(q));
      return arMatch || enMatch || pathMatch;
    });
  }, [searchQuery, flatCategories]);

  // Cascader columns calculation
  const cascaderColumns = useMemo(() => {
    const columns: CategoryNode[][] = [];
    columns.push(categoryTree);

    let currentNodes = categoryTree;
    for (const selectedId of activePath) {
      const found = currentNodes.find((n) => n.id === selectedId);
      if (found && found.children && found.children.length > 0) {
        columns.push(found.children);
        currentNodes = found.children;
      } else {
        break;
      }
    }

    return columns;
  }, [categoryTree, activePath]);

  const handleSelect = (node: CategoryNode) => {
    onChange(node.id, {
      id: node.id,
      nameAr: node.nameAr,
      nameEn: node.nameEn,
    });
    setIsOpen(false);
  };

  const handleClear = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const displayText = selectedItem
    ? selectedItem.pathNames.join(' / ')
    : (placeholder || t('selectCategory'));

  const ArrowIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <div ref={containerRef} className={`relative inline-block w-full text-start ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-start transition-all border outline-none
          ${
            disabled
              ? 'opacity-50 cursor-not-allowed bg-subtle/30 border-subtle'
              : isOpen
              ? 'bg-surface border-pale-sky-500 shadow-sm ring-1 ring-pale-sky-500/20'
              : 'bg-surface border-subtle hover:border-subtle-accent hover:bg-subtle/20'
          }`}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          <Folder className={`w-4 h-4 shrink-0 ${selectedItem ? 'text-pale-sky-500' : 'text-muted'}`} />
          <span
            className={`truncate text-sm ${
              selectedItem ? 'text-main font-medium' : 'text-muted'
            }`}
            title={selectedItem ? selectedItem.pathNames.join(' / ') : undefined}
          >
            {displayText}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 text-muted">
          {allowClear && selectedItem && !disabled && (
            <span
              role="button"
              tabIndex={0}
              title={t('clearCategory')}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleClear(e);
                }
              }}
              className="p-1 hover:text-rose-500 hover:bg-subtle rounded-md transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className="absolute z-50 mt-1.5 w-full min-w-[280px] max-w-[560px] bg-surface rounded-2xl border border-subtle shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          style={{ insetInlineStart: 0 }}
        >
          {/* Search Header */}
          <div className="p-2.5 border-b border-subtle bg-subtle/30 flex items-center gap-2">
            <Search className="w-4 h-4 text-muted shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchCategory')}
              className="flex-1 bg-transparent text-sm text-main placeholder:text-muted outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-muted hover:text-main p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Results Mode */}
          {searchQuery.trim() ? (
            <div className="max-h-72 overflow-y-auto p-1.5 divide-y divide-subtle/40">
              {searchResults.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted">
                  {t('noCategoryFound')}
                </div>
              ) : (
                searchResults.map((item) => {
                  const isSelected = item.id === value;
                  const name = lang === 'ar' ? item.nameAr : (item.nameEn || item.nameAr);
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelect(item.node)}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl cursor-pointer text-sm transition-all ${
                        isSelected
                          ? 'bg-pale-sky-500/15 text-pale-sky-500 font-semibold'
                          : 'hover:bg-subtle/60 text-main'
                      }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="truncate font-medium">{name}</span>
                        {item.pathNames.length > 1 && (
                          <span className="text-[11px] text-muted truncate">
                            {item.pathNames.slice(0, -1).join(' > ')}
                          </span>
                        )}
                      </div>
                      {isSelected && <Check className="w-4 h-4 shrink-0 text-pale-sky-500" />}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Cascader Multi-Column / Tree Mode */
            <div className="flex divide-x divide-subtle/60 rtl:divide-x-reverse max-h-72 overflow-x-auto overflow-y-hidden bg-surface">
              {cascaderColumns.map((colNodes, colIndex) => {
                const activeIdInThisCol = activePath[colIndex];
                return (
                  <div
                    key={colIndex}
                    className="w-48 sm:w-56 shrink-0 overflow-y-auto p-1.5 space-y-1 border-subtle"
                  >
                    {colNodes.map((node) => {
                      const isActive = activeIdInThisCol === node.id;
                      const isSelected = value === node.id;
                      const hasChildren = node.children && node.children.length > 0;
                      const name = lang === 'ar' ? node.nameAr : (node.nameEn || node.nameAr);

                      return (
                        <div
                          key={node.id}
                          onMouseEnter={() => {
                            // Expand child column on hover/focus
                            const newPath = activePath.slice(0, colIndex);
                            newPath.push(node.id);
                            setActivePath(newPath);
                          }}
                          onClick={() => {
                            // Single click selects category
                            handleSelect(node);
                          }}
                          className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl cursor-pointer text-xs sm:text-sm select-none transition-all ${
                            isSelected
                              ? 'bg-pale-sky-500/15 text-pale-sky-500 font-semibold'
                              : isActive
                              ? 'bg-subtle text-main font-medium'
                              : 'hover:bg-subtle/50 text-main'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {hasChildren ? (
                              isActive ? (
                                <FolderOpen className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
                              ) : (
                                <Folder className="w-3.5 h-3.5 text-muted shrink-0" />
                              )
                            ) : (
                              <Layers className="w-3.5 h-3.5 text-muted shrink-0" />
                            )}
                            <span className="truncate">{name}</span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {isSelected && <Check className="w-3.5 h-3.5 text-pale-sky-500" />}
                            {hasChildren && (
                              <ArrowIcon className="w-3.5 h-3.5 text-muted opacity-60" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer Actions */}
          <div className="p-2 border-t border-subtle bg-subtle/20 flex items-center justify-between text-xs text-muted">
            <span>
              {flatCategories.length} {t('navCategories')}
            </span>
            {allowClear && selectedItem && (
              <button
                type="button"
                onClick={handleClear}
                className="text-rose-500 hover:underline font-medium"
              >
                {t('clearCategory')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
