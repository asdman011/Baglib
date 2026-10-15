'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Columns3, Check, RotateCcw } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { ListColumnKey } from '../../../shared/types/library-views';

interface ColumnSelectorDropdownProps {
  visibleColumns: ListColumnKey[];
  onToggleColumn: (col: ListColumnKey) => void;
  onResetColumns: () => void;
}

interface ColumnOption {
  key: ListColumnKey;
  labelKey: string;
  defaultVisible: boolean;
}

const AVAILABLE_COLUMNS: ColumnOption[] = [
  { key: 'cover', labelKey: 'columnCover', defaultVisible: true },
  { key: 'title', labelKey: 'columnTitle', defaultVisible: true },
  { key: 'category', labelKey: 'columnCategory', defaultVisible: true },
  { key: 'format', labelKey: 'columnFormat', defaultVisible: true },
  { key: 'location', labelKey: 'columnLocation', defaultVisible: true },
  { key: 'status', labelKey: 'columnStatus', defaultVisible: true },
  { key: 'year', labelKey: 'columnYear', defaultVisible: false },
  { key: 'publisher', labelKey: 'columnPublisher', defaultVisible: false },
  { key: 'isbn', labelKey: 'columnIsbn', defaultVisible: false },
  { key: 'tags', labelKey: 'columnTags', defaultVisible: false },
  { key: 'actions', labelKey: 'columnActions', defaultVisible: true },
];

export const ColumnSelectorDropdown: React.FC<ColumnSelectorDropdownProps> = ({
  visibleColumns,
  onToggleColumn,
  onResetColumns,
}) => {
  const { t, dir } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover on click outside
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

  const isRtl = dir === 'rtl';

  return (
    <div className="relative inline-block text-start" ref={containerRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
          isOpen
            ? 'bg-pale-sky-500/10 border-pale-sky-500/40 text-pale-sky-500'
            : 'bg-surface/70 border-border/60 text-foreground/80 hover:bg-surface-raised hover:text-foreground'
        }`}
        title={t('columnsCustomizer')}
      >
        <Columns3 className="w-4 h-4 shrink-0 text-muted" />
        <span className="hidden sm:inline">{t('columnsCustomizer')}</span>
      </button>

      {isOpen && (
        <div
          className={`absolute top-full mt-2 w-56 bg-surface-raised/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-xl shadow-black/20 p-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100 ${
            isRtl ? 'left-0' : 'right-0'
          }`}
        >
          <div className="px-2 py-1.5 border-b border-border/40 font-semibold text-foreground/90 flex items-center justify-between">
            <span>{t('columnsCustomizer')}</span>
            <button
              onClick={onResetColumns}
              className="text-[11px] text-muted hover:text-pale-sky-500 flex items-center gap-1 transition-colors"
              title={t('resetColumns')}
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t('resetColumns')}</span>
            </button>
          </div>

          <div className="py-1 max-h-60 overflow-y-auto space-y-0.5">
            {AVAILABLE_COLUMNS.map((col) => {
              const isVisible = visibleColumns.includes(col.key);
              const isMandatory = col.key === 'title'; // Title cannot be hidden
              return (
                <button
                  key={col.key}
                  disabled={isMandatory}
                  onClick={() => onToggleColumn(col.key)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-start transition-colors ${
                    isMandatory
                      ? 'opacity-60 cursor-not-allowed'
                      : 'hover:bg-surface text-foreground/80 hover:text-foreground cursor-pointer'
                  }`}
                >
                  <span className={isVisible ? 'font-medium text-foreground' : 'text-muted'}>
                    {t(col.labelKey as any)}
                  </span>
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      isVisible
                        ? 'bg-pale-sky-500 border-pale-sky-500 text-white'
                        : 'border-border/60 bg-surface/50'
                    }`}
                  >
                    {isVisible && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
