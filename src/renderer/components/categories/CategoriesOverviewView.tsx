'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  Layers,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Folder,
  FolderOpen,
  Plus,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Search,
  Tag as TagIcon,
  GitMerge,
  AlertTriangle,
  X,
  Check,
} from 'lucide-react';
import type { CategoryNode, CategoryCreateInput, CategoryUpdateInput, CategoryDeleteStrategy } from '../../../shared/types/category';
import type { TagWithCount } from '../../../shared/types/tag';
import { CategoryCascader } from './CategoryCascader';
import { getTagColorClass } from '../tags/TagEditor';

export const CategoriesOverviewView: React.FC = () => {
  const {
    categoryTree,
    allTags,
    refreshCategoryTree,
    refreshTags,
    refreshBooks,
    lang,
    dir,
    t,
    setViewMode,
    setActiveLibraryCategory,
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<'categories' | 'tags'>('categories');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Category Modal State
  const [categoryModalMode, setCategoryModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingCategory, setEditingCategory] = useState<CategoryNode | null>(null);
  const [categoryFormNameAr, setCategoryFormNameAr] = useState('');
  const [categoryFormNameEn, setCategoryFormNameEn] = useState('');
  const [categoryFormParentId, setCategoryFormParentId] = useState<string | null>(null);
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);

  // Category Deletion Modal State
  const [deletingCategory, setDeletingCategory] = useState<CategoryNode | null>(null);
  const [deleteStrategy, setDeleteStrategy] = useState<CategoryDeleteStrategy>('orphan');
  const [deleteReassignTargetId, setDeleteReassignTargetId] = useState<string | null>(null);

  // Tag Modals State
  const [renamingTag, setRenamingTag] = useState<TagWithCount | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [mergingTag, setMergingTag] = useState<TagWithCount | null>(null);
  const [mergeTargetTagId, setMergeTargetTagId] = useState<string | null>(null);
  const [deletingTag, setDeletingTag] = useState<TagWithCount | null>(null);
  const [tagActionError, setTagActionError] = useState<string | null>(null);

  // Load tree and tags
  useEffect(() => {
    refreshCategoryTree();
    refreshTags();
  }, []);

  // Filtered Category Tree
  const filterTree = (nodes: CategoryNode[], query: string): CategoryNode[] => {
    if (!query) return nodes;
    const q = query.toLowerCase();

    function matchNode(node: CategoryNode): boolean {
      const arMatch = node.nameAr.toLowerCase().includes(q);
      const enMatch = node.nameEn ? node.nameEn.toLowerCase().includes(q) : false;
      const childMatch = node.children && node.children.some(matchNode);
      return arMatch || enMatch || Boolean(childMatch);
    }

    function cloneAndPrune(node: CategoryNode): CategoryNode | null {
      const arMatch = node.nameAr.toLowerCase().includes(q);
      const enMatch = node.nameEn ? node.nameEn.toLowerCase().includes(q) : false;
      const filteredChildren = (node.children || [])
        .map(cloneAndPrune)
        .filter((c): c is CategoryNode => c !== null);

      if (arMatch || enMatch || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }
      return null;
    }

    return nodes.map(cloneAndPrune).filter((n): n is CategoryNode => n !== null);
  };

  const displayedCategoryTree = useMemo(() => {
    return filterTree(categoryTree, searchQuery);
  }, [categoryTree, searchQuery]);

  // Filtered Tags
  const displayedTags = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allTags;
    return allTags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [allTags, searchQuery]);

  // Handle Category Creation or Update
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategoryFormError(null);

    const nameAr = categoryFormNameAr.trim();
    const nameEn = categoryFormNameEn.trim();

    if (!nameAr) {
      setCategoryFormError('الاسم بالعربية مطلوب / Arabic name is required');
      return;
    }

    try {
      const api = window.electronAPI.categories;
      if (categoryModalMode === 'create') {
        const input: CategoryCreateInput = {
          nameAr,
          nameEn: nameEn || undefined,
          parentId: categoryFormParentId || null,
        };
        await api.create(input);
      } else if (categoryModalMode === 'edit' && editingCategory) {
        const input: CategoryUpdateInput = {
          nameAr,
          nameEn: nameEn || undefined,
          parentId: categoryFormParentId || null,
        };
        await api.update(editingCategory.id, input);
      }

      await refreshCategoryTree();
      setCategoryModalMode(null);
      setEditingCategory(null);
    } catch (err: any) {
      setCategoryFormError(err?.message || 'Failed to save category');
    }
  };

  // Open Create Child Modal
  const openCreateChildModal = (parent?: CategoryNode) => {
    setCategoryModalMode('create');
    setEditingCategory(null);
    setCategoryFormNameAr('');
    setCategoryFormNameEn('');
    setCategoryFormParentId(parent ? parent.id : null);
    setCategoryFormError(null);
  };

  // Open Edit Modal
  const openEditModal = (cat: CategoryNode) => {
    setCategoryModalMode('edit');
    setEditingCategory(cat);
    setCategoryFormNameAr(cat.nameAr);
    setCategoryFormNameEn(cat.nameEn || '');
    setCategoryFormParentId(cat.parentId || null);
    setCategoryFormError(null);
  };

  // Handle Category Deletion
  const handleConfirmDeleteCategory = async () => {
    if (!deletingCategory) return;
    try {
      if (deleteStrategy === 'reassign' && !deleteReassignTargetId) {
        setCategoryFormError('يرجى اختيار التصنيف البديل / Target category required');
        return;
      }

      await window.electronAPI.categories.delete(
        deletingCategory.id,
        deleteStrategy,
        deleteReassignTargetId || undefined
      );

      await refreshCategoryTree();
      await refreshBooks();
      setDeletingCategory(null);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete category');
    }
  };

  // Reorder Siblings
  const handleMoveCategory = async (siblings: CategoryNode[], index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    const newOrder = [...siblings];
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;

    const orderedIds = newOrder.map((c) => c.id);
    try {
      await window.electronAPI.categories.reorder(orderedIds);
      await refreshCategoryTree();
    } catch (err) {
      console.error('Failed to reorder categories:', err);
    }
  };

  // Tag Actions
  const handleRenameTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingTag || !newTagName.trim()) return;
    try {
      await window.electronAPI.tags.update(renamingTag.id, newTagName.trim());
      await refreshTags();
      await refreshBooks();
      setRenamingTag(null);
    } catch (err: any) {
      setTagActionError(err?.message || 'Failed to rename tag');
    }
  };

  const handleMergeTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergingTag || !mergeTargetTagId) return;
    try {
      await window.electronAPI.tags.merge(mergingTag.id, mergeTargetTagId);
      await refreshTags();
      await refreshBooks();
      setMergingTag(null);
    } catch (err: any) {
      setTagActionError(err?.message || 'Failed to merge tags');
    }
  };

  const handleDeleteTag = async () => {
    if (!deletingTag) return;
    try {
      await window.electronAPI.tags.delete(deletingTag.id);
      await refreshTags();
      await refreshBooks();
      setDeletingTag(null);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete tag');
    }
  };

  // Recursive Category Item Component
  const CategoryRow: React.FC<{
    node: CategoryNode;
    siblings: CategoryNode[];
    index: number;
    depth?: number;
  }> = ({ node, siblings, index, depth = 0 }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const hasChildren = node.children && node.children.length > 0;
    const name = lang === 'ar' ? node.nameAr : (node.nameEn || node.nameAr);
    const secondaryName = lang === 'ar' ? node.nameEn : node.nameAr;

    const ArrowIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;

    return (
      <div className="flex flex-col">
        <div
          className={`flex items-center justify-between gap-3 py-2 px-3 rounded-2xl transition-all select-none group border
            ${
              depth === 0
                ? 'bg-surface/90 border-subtle shadow-sm hover:border-pale-sky-500/50 mb-1.5'
                : 'hover:bg-subtle/50 border-transparent hover:border-subtle/40'
            }`}
          style={{ marginInlineStart: depth > 0 ? `${depth * 16}px` : '0px' }}
        >
          {/* Main Info & Expand Toggle */}
          <div
            className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
            onClick={() => {
              setActiveLibraryCategory(node.id);
              setViewMode('library');
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) setIsExpanded(!isExpanded);
              }}
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                depth === 0
                  ? 'bg-pale-sky-500/10 text-pale-sky-500 hover:bg-pale-sky-500/20'
                  : 'bg-subtle/50 text-muted hover:bg-pale-sky-500/15 hover:text-pale-sky-500'
              }`}
            >
              {hasChildren ? (
                isExpanded ? (
                  <FolderOpen className="w-4 h-4" />
                ) : (
                  <Folder className="w-4 h-4" />
                )
              ) : (
                <Layers className="w-4 h-4 opacity-70" />
              )}
            </button>

            <div className="flex items-center gap-2 truncate">
              <span className={`font-semibold ${depth === 0 ? 'text-sm' : 'text-xs'} text-main truncate`}>
                {name}
              </span>
              {secondaryName && secondaryName !== name && (
                <span className="text-[11px] text-muted truncate hidden sm:inline opacity-70">
                  ({secondaryName})
                </span>
              )}
            </div>

            {/* Work Count Badges */}
            <div className="flex items-center gap-1.5 shrink-0 ms-1">
              {(node.totalWorkCount !== undefined ? node.totalWorkCount : 0) > 0 && (
                <span
                  title={t('categoryTotalCount', { count: node.totalWorkCount ?? 0 })}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pale-sky-500/15 text-pale-sky-500"
                >
                  {node.totalWorkCount}
                </span>
              )}
              {hasChildren && node.directWorkCount !== undefined && node.directWorkCount > 0 && (
                <span
                  title={t('categoryDirectCount', { count: node.directWorkCount })}
                  className="px-1.5 py-0.5 rounded-full text-[10px] bg-subtle text-muted hidden md:inline"
                >
                  {node.directWorkCount} {t('bookSingle')}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons & Reorder Controls */}
          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
            {/* Reorder Buttons */}
            {siblings.length > 1 && (
              <div className="flex items-center gap-0.5 bg-subtle/40 rounded-lg p-0.5 border border-subtle/50">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveCategory(siblings, index, 'up');
                  }}
                  title={t('categoryMoveUp')}
                  className="p-1 hover:text-pale-sky-500 disabled:opacity-30 disabled:hover:text-inherit rounded"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={index === siblings.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveCategory(siblings, index, 'down');
                  }}
                  title={t('categoryMoveDown')}
                  className="p-1 hover:text-pale-sky-500 disabled:opacity-30 disabled:hover:text-inherit rounded"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Add Child Category */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openCreateChildModal(node);
              }}
              title={t('addCategory')}
              className="p-1.5 text-muted hover:text-pale-sky-500 hover:bg-pale-sky-500/10 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            {/* Edit Category */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(node);
              }}
              title={t('editCategory')}
              className="p-1.5 text-muted hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>

            {/* Delete Category */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDeletingCategory(node);
                setDeleteStrategy('orphan');
                setDeleteReassignTargetId(null);
              }}
              title={t('deleteCategory')}
              className="p-1.5 text-muted hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            {/* Expand / Collapse Chevron */}
            {hasChildren && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="p-1 text-muted hover:text-main rounded-md"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ArrowIcon className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Children Sub-tree */}
        {isExpanded && hasChildren && (
          <div className="flex flex-col gap-1 border-s-2 border-subtle/30 ms-4 ps-2 mb-1">
            {node.children.map((child, cIdx) => (
              <CategoryRow
                key={child.id}
                node={child}
                siblings={node.children}
                index={cIdx}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Header Bar */}
      <div className="p-6 pb-4 border-b border-subtle bg-surface/50 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-main flex items-center gap-2">
              <Layers className="w-6 h-6 text-pale-sky-500" />
              <span>{t('manageCategories')}</span>
            </h1>
            <p className="text-xs text-muted mt-1">
              {activeTab === 'categories' ? t('manageCategoriesDesc') : t('manageTagsDesc')}
            </p>
          </div>

          {/* Tab Navigation & Add Action */}
          <div className="flex items-center gap-3">
            <div className="flex bg-subtle/60 p-1 rounded-xl border border-subtle/60">
              <button
                type="button"
                onClick={() => setActiveTab('categories')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'categories'
                    ? 'bg-surface text-pale-sky-500 shadow-sm'
                    : 'text-muted hover:text-main'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t('categoriesTab')}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tags')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'tags'
                    ? 'bg-surface text-pale-sky-500 shadow-sm'
                    : 'text-muted hover:text-main'
                }`}
              >
                <TagIcon className="w-3.5 h-3.5" />
                <span>{t('tagsTab')}</span>
                <span className="ms-1 px-1.5 py-0.2 rounded-full bg-subtle text-[10px]">
                  {allTags.length}
                </span>
              </button>
            </div>

            {activeTab === 'categories' && (
              <button
                type="button"
                onClick={() => openCreateChildModal()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-pale-sky-500 text-white hover:bg-pale-sky-600 shadow-sm font-semibold text-xs transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('addCategory')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-4 relative max-w-md">
          <Search className="w-4 h-4 text-muted absolute top-2.5 inset-inline-start-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'categories' ? t('searchCategory') : t('searchTags')}
            className="w-full bg-surface border border-subtle rounded-xl text-sm ps-9 pe-8 py-2 text-main placeholder:text-muted focus:border-pale-sky-500 focus:ring-1 focus:ring-pale-sky-500/20 outline-none transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute top-2.5 inset-inline-end-3 text-muted hover:text-main"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'categories' ? (
          <div className="max-w-4xl mx-auto">
            {displayedCategoryTree.length === 0 ? (
              <div className="text-center py-16 bg-surface/30 rounded-2xl border border-dashed border-subtle">
                <Layers className="w-12 h-12 text-muted mx-auto mb-3 opacity-40" />
                <h3 className="text-sm font-bold text-main">{t('noCategories')}</h3>
                <p className="text-xs text-muted mt-1">{t('manageCategoriesDesc')}</p>
                <button
                  type="button"
                  onClick={() => openCreateChildModal()}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pale-sky-500 text-white font-medium text-xs hover:bg-pale-sky-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('addCategory')}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {displayedCategoryTree.map((rootNode, idx) => (
                  <CategoryRow
                    key={rootNode.id}
                    node={rootNode}
                    siblings={displayedCategoryTree}
                    index={idx}
                    depth={0}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Tags Tab Content */
          <div className="max-w-4xl mx-auto">
            {displayedTags.length === 0 ? (
              <div className="text-center py-16 bg-surface/30 rounded-2xl border border-dashed border-subtle">
                <TagIcon className="w-12 h-12 text-muted mx-auto mb-3 opacity-40" />
                <h3 className="text-sm font-bold text-main">{t('noTags')}</h3>
                <p className="text-xs text-muted mt-1">{t('manageTagsDesc')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {displayedTags.map((tag) => {
                  const colors = getTagColorClass(tag.name);
                  return (
                    <div
                      key={tag.id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-surface border border-subtle shadow-sm hover:border-subtle-accent transition-all group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${colors.bg} ${colors.text} ${colors.border}`}
                        >
                          # {tag.name}
                        </span>
                        <span className="text-[11px] text-muted font-medium">
                          ({tag.workCount})
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingTag(tag);
                            setNewTagName(tag.name);
                            setTagActionError(null);
                          }}
                          title={t('renameTag')}
                          className="p-1 hover:text-amber-500 hover:bg-subtle rounded-md transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMergingTag(tag);
                            setMergeTargetTagId(null);
                            setTagActionError(null);
                          }}
                          title={t('mergeTags')}
                          className="p-1 hover:text-indigo-400 hover:bg-subtle rounded-md transition-colors"
                        >
                          <GitMerge className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingTag(tag)}
                          title={t('deleteTag')}
                          className="p-1 hover:text-rose-500 hover:bg-subtle rounded-md transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODALS */}
      {/* ========================================================================= */}

      {/* 1. Create / Edit Category Modal */}
      {categoryModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-subtle rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-subtle">
              <h2 className="text-lg font-display font-bold text-main flex items-center gap-2">
                <Folder className="w-5 h-5 text-pale-sky-500" />
                <span>{categoryModalMode === 'create' ? t('addCategory') : t('editCategory')}</span>
              </h2>
              <button
                type="button"
                onClick={() => setCategoryModalMode(null)}
                className="text-muted hover:text-main p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="mt-4 space-y-4">
              {categoryFormError && (
                <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{categoryFormError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-main mb-1.5">
                  {t('categoryNameAr')} *
                </label>
                <input
                  type="text"
                  required
                  value={categoryFormNameAr}
                  onChange={(e) => setCategoryFormNameAr(e.target.value)}
                  placeholder="مثال: الفقه وأصوله"
                  className="w-full bg-background border border-subtle rounded-xl px-3 py-2 text-sm text-main focus:border-pale-sky-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-main mb-1.5">
                  {t('categoryNameEn')}
                </label>
                <input
                  type="text"
                  value={categoryFormNameEn}
                  onChange={(e) => setCategoryFormNameEn(e.target.value)}
                  placeholder="e.g. Fiqh & Jurisprudence"
                  className="w-full bg-background border border-subtle rounded-xl px-3 py-2 text-sm text-main focus:border-pale-sky-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-main mb-1.5">
                  {t('parentCategory')}
                </label>
                <CategoryCascader
                  value={categoryFormParentId}
                  onChange={(id) => setCategoryFormParentId(id)}
                  placeholder={t('noParentCategory')}
                  allowClear={true}
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => setCategoryModalMode(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:bg-subtle transition-colors"
                >
                  {t('bulkCancelBtn')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-pale-sky-500 text-white hover:bg-pale-sky-600 transition-colors shadow-sm"
                >
                  {t('saveCategory')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Delete Category with Strategies Modal */}
      {deletingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-subtle rounded-3xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-500 pb-3 border-b border-subtle">
              <AlertTriangle className="w-6 h-6" />
              <h2 className="text-base font-bold">
                {t('deleteCategoryModalTitle', {
                  name: lang === 'ar' ? deletingCategory.nameAr : (deletingCategory.nameEn || deletingCategory.nameAr),
                })}
              </h2>
            </div>

            <p className="text-xs text-muted mt-3">
              {t('deleteCategoryWarning', {
                direct: deletingCategory.directWorkCount ?? 0,
                sub: deletingCategory.children?.length ?? 0,
              })}
            </p>

            <div className="mt-4 space-y-3">
              {/* Orphan Option */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                  deleteStrategy === 'orphan'
                    ? 'border-pale-sky-500 bg-pale-sky-500/10'
                    : 'border-subtle hover:bg-subtle/30'
                }`}
              >
                <input
                  type="radio"
                  name="deleteStrategy"
                  checked={deleteStrategy === 'orphan'}
                  onChange={() => setDeleteStrategy('orphan')}
                  className="mt-0.5 text-pale-sky-500 focus:ring-pale-sky-500"
                />
                <div>
                  <div className="text-xs font-bold text-main">{t('deleteStrategyOrphan')}</div>
                  <div className="text-[11px] text-muted mt-0.5">{t('deleteStrategyOrphanDesc')}</div>
                </div>
              </label>

              {/* Reassign Option */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                  deleteStrategy === 'reassign'
                    ? 'border-pale-sky-500 bg-pale-sky-500/10'
                    : 'border-subtle hover:bg-subtle/30'
                }`}
              >
                <input
                  type="radio"
                  name="deleteStrategy"
                  checked={deleteStrategy === 'reassign'}
                  onChange={() => setDeleteStrategy('reassign')}
                  className="mt-0.5 text-pale-sky-500 focus:ring-pale-sky-500"
                />
                <div className="flex-1">
                  <div className="text-xs font-bold text-main">{t('deleteStrategyReassign')}</div>
                  <div className="text-[11px] text-muted mt-0.5">{t('deleteStrategyReassignDesc')}</div>

                  {deleteStrategy === 'reassign' && (
                    <div className="mt-3">
                      <label className="block text-[11px] font-semibold text-main mb-1">
                        {t('reassignTargetCategory')}
                      </label>
                      <CategoryCascader
                        value={deleteReassignTargetId}
                        onChange={(id) => setDeleteReassignTargetId(id)}
                        placeholder={t('selectCategory')}
                      />
                    </div>
                  )}
                </div>
              </label>
            </div>

            <div className="pt-5 flex items-center justify-end gap-2 border-t border-subtle mt-4">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:bg-subtle transition-colors"
              >
                {t('bulkCancelBtn')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCategory}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 transition-colors shadow-sm"
              >
                {t('confirmDeleteCategory')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Rename Tag Modal */}
      {renamingTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-subtle rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-main flex items-center gap-2 pb-3 border-b border-subtle">
              <Edit2 className="w-4 h-4 text-amber-500" />
              <span>{t('renameTagTitle')}</span>
            </h3>

            <form onSubmit={handleRenameTag} className="mt-4 space-y-4">
              {tagActionError && (
                <div className="p-2.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs rounded-xl">
                  {tagActionError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-main mb-1.5">
                  {t('tagNameLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="w-full bg-background border border-subtle rounded-xl px-3 py-2 text-sm text-main focus:border-pale-sky-500 outline-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => setRenamingTag(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:bg-subtle"
                >
                  {t('bulkCancelBtn')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-pale-sky-500 text-white hover:bg-pale-sky-600 shadow-sm"
                >
                  {t('renameTag')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Merge Tag Modal */}
      {mergingTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-subtle rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-main flex items-center gap-2 pb-3 border-b border-subtle">
              <GitMerge className="w-4 h-4 text-indigo-400" />
              <span>{t('mergeTagsTitle', { name: mergingTag.name })}</span>
            </h3>

            <form onSubmit={handleMergeTag} className="mt-4 space-y-4">
              {tagActionError && (
                <div className="p-2.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs rounded-xl">
                  {tagActionError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-main mb-1.5">
                  {t('mergeTargetTag')}
                </label>
                <select
                  required
                  value={mergeTargetTagId || ''}
                  onChange={(e) => setMergeTargetTagId(e.target.value || null)}
                  className="w-full bg-background border border-subtle rounded-xl px-3 py-2 text-sm text-main focus:border-pale-sky-500 outline-none"
                >
                  <option value="">{t('selectCategory')}</option>
                  {allTags
                    .filter((t) => t.id !== mergingTag.id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.workCount} books)
                      </option>
                    ))}
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => setMergingTag(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:bg-subtle"
                >
                  {t('bulkCancelBtn')}
                </button>
                <button
                  type="submit"
                  disabled={!mergeTargetTagId}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 shadow-sm"
                >
                  {t('mergeConfirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Delete Tag Confirmation Modal */}
      {deletingTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-subtle rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-rose-500 flex items-center gap-2 pb-3 border-b border-subtle">
              <Trash2 className="w-4 h-4" />
              <span>{t('confirmDeleteTagTitle', { name: deletingTag.name })}</span>
            </h3>

            <p className="text-xs text-muted mt-3">
              {t('confirmDeleteTagDesc', { count: deletingTag.workCount })}
            </p>

            <div className="pt-4 flex items-center justify-end gap-2 border-t border-subtle mt-4">
              <button
                type="button"
                onClick={() => setDeletingTag(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:bg-subtle"
              >
                {t('bulkCancelBtn')}
              </button>
              <button
                type="button"
                onClick={handleDeleteTag}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 shadow-sm"
              >
                {t('deleteTag')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
