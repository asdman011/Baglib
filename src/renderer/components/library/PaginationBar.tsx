'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Hash } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  pageSizeOptions = [12, 24, 48, 96],
  onPageChange,
  onPageSizeChange,
}) => {
  const { t, dir } = useWorkspace();
  const [jumpInput, setJumpInput] = useState('');

  const safeTotalPages = Math.max(1, totalPages);
  const from = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(totalCount, currentPage * pageSize);

  const isRtl = dir === 'rtl';

  // Navigation handlers with RTL direction inversion
  const handlePrev = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < safeTotalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(jumpInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= safeTotalPages) {
      onPageChange(pageNum);
      setJumpInput('');
    }
  };

  // Generate page numbers with ellipsis
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const delta = 2; // numbers to show around current page

    if (safeTotalPages <= 7) {
      for (let i = 1; i <= safeTotalPages; i++) pages.push(i);
      return pages;
    }

    pages.push(1);
    if (currentPage - delta > 2) {
      pages.push('ellipsis');
    }

    const start = Math.max(2, currentPage - delta);
    const end = Math.min(safeTotalPages - 1, currentPage + delta);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage + delta < safeTotalPages - 1) {
      pages.push('ellipsis');
    }
    pages.push(safeTotalPages);

    return pages;
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-4 px-4 bg-surface-raised/40 backdrop-blur-md rounded-2xl border border-border/40 text-xs sm:text-sm mt-6">
      {/* Total & Range Display */}
      <div className="text-muted font-medium flex items-center gap-2">
        <span>
          {t('paginationShowingRange', {
            from: from.toLocaleString(),
            to: to.toLocaleString(),
            total: totalCount.toLocaleString(),
          })}
        </span>
      </div>

      {/* Page Navigation Controls */}
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {/* First Page */}
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg border border-border/50 bg-surface/50 text-foreground hover:bg-surface-raised disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title={isRtl ? 'الصفحة الأولى' : 'First Page'}
        >
          {isRtl ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
        </button>

        {/* Previous Page */}
        <button
          onClick={handlePrev}
          disabled={currentPage <= 1}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border/50 bg-surface/50 text-foreground hover:bg-surface-raised disabled:opacity-30 disabled:cursor-not-allowed transition-all font-medium"
        >
          {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          <span className="hidden sm:inline">{t('paginationPrevious')}</span>
        </button>

        {/* Number Buttons */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((p, idx) => {
            if (p === 'ellipsis') {
              return (
                <span key={`ellipsis-${idx}`} className="px-2 text-muted select-none">
                  …
                </span>
              );
            }
            const isActive = p === currentPage;
            return (
              <button
                key={`page-${p}`}
                onClick={() => onPageChange(p)}
                className={`min-w-[32px] h-8 rounded-lg font-medium transition-all ${
                  isActive
                    ? 'bg-pale-sky-600 text-white shadow-sm shadow-pale-sky-500/20 font-semibold'
                    : 'bg-surface/50 text-foreground/80 hover:bg-surface-raised border border-border/40'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          onClick={handleNext}
          disabled={currentPage >= safeTotalPages}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border/50 bg-surface/50 text-foreground hover:bg-surface-raised disabled:opacity-30 disabled:cursor-not-allowed transition-all font-medium"
        >
          <span className="hidden sm:inline">{t('paginationNext')}</span>
          {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Last Page */}
        <button
          onClick={() => onPageChange(safeTotalPages)}
          disabled={currentPage >= safeTotalPages}
          className="p-1.5 rounded-lg border border-border/50 bg-surface/50 text-foreground hover:bg-surface-raised disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title={isRtl ? 'الصفحة الأخيرة' : 'Last Page'}
        >
          {isRtl ? <ChevronsLeft className="w-4 h-4" /> : <ChevronsRight className="w-4 h-4" />}
        </button>
      </div>

      {/* Page Size & Jump Controls */}
      <div className="flex items-center gap-3">
        {/* Page Size Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted text-xs hidden sm:inline">{t('paginationItemsPerPage')}</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-surface/80 border border-border/60 text-foreground rounded-lg px-2 py-1 text-xs font-medium focus:ring-1 focus:ring-pale-sky-500 outline-none"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* Quick Jump Input */}
        <form onSubmit={handleJumpSubmit} className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={safeTotalPages}
            placeholder={String(currentPage)}
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            className="w-14 bg-surface/80 border border-border/60 text-foreground rounded-lg px-2 py-1 text-xs text-center focus:ring-1 focus:ring-pale-sky-500 outline-none"
            title={t('paginationJumpTo')}
          />
          <button
            type="submit"
            className="px-2 py-1 bg-surface-raised hover:bg-surface border border-border/50 text-foreground/80 hover:text-foreground text-xs rounded-lg font-medium transition-colors"
          >
            {t('paginationGo')}
          </button>
        </form>
      </div>
    </div>
  );
};
