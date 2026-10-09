'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Layers, ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import type { CategoryNode } from '../../../shared/types/category';

const CategoryNodeItem: React.FC<{ node: CategoryNode, depth?: number }> = ({ node, depth = 0 }) => {
  const { books, lang, dir, setViewMode, setActiveLibraryCategory } = useWorkspace();
  const [isExpanded, setIsExpanded] = useState(depth === 0);

  const name = lang === 'ar' ? node.nameAr : node.nameEn;
  
  const catBooks = useMemo(() => {
    return books.filter(b => b.primaryCategory?.id === node.id);
  }, [books, node.id]);

  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="flex flex-col">
      <div 
        className={`flex items-center gap-3 py-2.5 px-4 rounded-xl transition-all cursor-pointer select-none group 
          ${depth === 0 ? 'mt-3 bg-surface border border-subtle shadow-sm hover:border-pale-sky-500/50' : 'hover:bg-subtle/40'}`}
        style={{ marginInlineStart: depth > 0 ? `${depth * 12}px` : '0px' }}
        onClick={() => {
          setActiveLibraryCategory(node.id);
          setViewMode('library');
        }}
      >
        <div 
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
            depth === 0 
              ? 'bg-pale-sky-500/10 text-pale-sky-500 hover:bg-pale-sky-500/20' 
              : 'bg-subtle/50 text-muted group-hover:bg-pale-sky-500/20 group-hover:text-pale-sky-500'
          }`}
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }
          }}
        >
          {hasChildren ? (
            isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />
          ) : (
            <Layers className="w-4 h-4" />
          )}
        </div>
        
        <div className="flex-1 flex flex-col justify-center">
          <span className={`font-display font-bold ${depth === 0 ? 'text-[15px]' : 'text-sm'} text-main`}>{name}</span>
          {catBooks.length > 0 && (
            <span className="text-[11px] text-muted font-sans mt-0.5">
              {catBooks.length} {catBooks.length === 1 ? 'Book' : 'Books'}
            </span>
          )}
        </div>

        {hasChildren && (
          <div 
            className="text-muted opacity-40 group-hover:opacity-100 transition-opacity p-1 cursor-pointer hover:bg-subtle rounded-md"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              dir === 'rtl' ? <ChevronDown className="w-4 h-4 -rotate-90" /> : <ChevronRight className="w-4 h-4" />
            )}
          </div>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div className={`flex flex-col mt-1 gap-1 border-s-2 border-subtle/30 ms-8 ps-2`}>
          {node.children.map(child => (
            <CategoryNodeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};


export const CategoriesOverviewView: React.FC = () => {
  const { t } = useWorkspace();
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTree() {
      try {
        const data = await window.electronAPI.getCategoryTree() as CategoryNode[];
        setTree(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchTree();
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas/30 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-pale-sky-500/10 text-pale-sky-500 flex items-center justify-center shrink-0">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-display text-main">{t('manageCategories')}</h1>
          <p className="text-xs text-muted font-sans mt-1">{t('manageCategoriesDesc')}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted text-sm font-sans">
          Loading Categories...
        </div>
      ) : tree.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted text-sm font-sans">
          {t('noCategories')}
        </div>
      ) : (
        <div className="flex flex-col pb-10 max-w-5xl">
          {tree.map((node) => (
            <CategoryNodeItem key={node.id} node={node} />
          ))}
        </div>
      )}
    </div>
  );
};
