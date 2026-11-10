'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  MoreHorizontal,
  Plus,
  UploadCloud,
  FolderPlus,
  Camera,
  Scissors,
  Cpu,
  HardDrive,
  Sparkles,
  Trash2,
  BarChart2,
  ShieldCheck,
  Cloud,
  Globe,
  ChevronDown,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { useWorkspace } from '../context/WorkspaceContext';

export interface LibraryMoreMenuProps {
  onAddNewBook?: () => void;
  onOpenImportWizard?: () => void;
  onImportFolder: () => void;
  onAddFromCover: () => void;
  onOpenWebClipper: () => void;
  onOpenPdfTools: () => void;
  onOpenStorageManager: () => void;
  onOpenAudit: () => void;
  onOpenTrash: () => void;
  onOpenStats: () => void;
  onOpenSecurity: () => void;
  onOpenCloudSync: () => void;
  onOpenOpds: () => void;
  storageIssueCount?: number;
  trashCount?: number;
  selectedBooksCount?: number;
}

export const LibraryMoreMenu: React.FC<LibraryMoreMenuProps> = ({
  onAddNewBook,
  onOpenImportWizard,
  onImportFolder,
  onAddFromCover,
  onOpenWebClipper,
  onOpenPdfTools,
  onOpenStorageManager,
  onOpenAudit,
  onOpenTrash,
  onOpenStats,
  onOpenSecurity,
  onOpenCloudSync,
  onOpenOpds,
  storageIssueCount = 0,
  trashCount = 0,
  selectedBooksCount = 0,
}) => {
  const { t, dir } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleAction = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  return (
    <div ref={containerRef} className="relative inline-flex" dir={dir}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        icon={<MoreHorizontal className="size-3.5" />}
        data-library-dialog="more-menu"
      >
        <span>{t('ribbonMoreActions')}</span>
        <ChevronDown className="size-3 opacity-60" aria-hidden="true" />
        {(storageIssueCount > 0 || trashCount > 0) && (
          <span className="size-2 rounded-full bg-accent inline-block ms-0.5" />
        )}
      </Button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          tabIndex={-1}
          className="absolute top-full mt-1.5 z-50 min-w-56 max-w-xs py-2 bg-surface border border-border rounded-2xl shadow-xl text-text text-xs font-sans max-h-[80vh] overflow-y-auto end-0"
        >
          {/* Group 1: Import & Add */}
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            {t('libraryRibbonAdd')}
          </div>
          {onAddNewBook && (
            <button
              type="button"
              role="menuitem"
              onClick={() => handleAction(onAddNewBook)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-start hover:bg-canvas transition-colors cursor-pointer text-text"
            >
              <Plus className="size-3.5 text-primary-text shrink-0" aria-hidden="true" />
              <span className="truncate">{t('addBook')}</span>
            </button>
          )}
          {onOpenImportWizard && (
            <button
              type="button"
              role="menuitem"
              onClick={() => handleAction(onOpenImportWizard)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-start hover:bg-canvas transition-colors cursor-pointer text-text"
            >
              <UploadCloud className="size-3.5 text-primary-text shrink-0" aria-hidden="true" />
              <span className="truncate">{t('importWizardTitle')}</span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onImportFolder)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-start hover:bg-canvas transition-colors cursor-pointer text-text"
          >
            <FolderPlus className="size-3.5 text-primary-text shrink-0" aria-hidden="true" />
            <span className="truncate">{t('importFolder')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onAddFromCover)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-start hover:bg-canvas transition-colors cursor-pointer text-text"
          >
            <Camera className="size-3.5 text-primary-text shrink-0" aria-hidden="true" />
            <span className="truncate">{t('coverPhotoButton')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onOpenWebClipper)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-start hover:bg-canvas transition-colors cursor-pointer text-text"
          >
            <Scissors className="size-3.5 text-primary-text shrink-0" aria-hidden="true" />
            <span className="truncate">{t('webClipperTitle')}</span>
          </button>

          {/* Group 2: PDF Tools */}
          <div className="border-t border-border/60 my-1.5" />
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            {t('libraryRibbonPdf')}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onOpenPdfTools)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-start hover:bg-canvas transition-colors cursor-pointer text-text"
          >
            <Cpu className="size-3.5 text-primary-text shrink-0" aria-hidden="true" />
            <span className="truncate">{t('pdfToolsHubTitle')}</span>
          </button>

          {/* Group 3: Library Management */}
          <div className="border-t border-border/60 my-1.5" />
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            {t('libraryRibbonCare')}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onOpenStorageManager)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-start hover:bg-canvas transition-colors cursor-pointer text-text"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <HardDrive className="size-3.5 text-primary-text shrink-0" aria-hidden="true" />
              <span className="truncate">{t('storageManagerTitle')}</span>
            </span>
            {storageIssueCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-accent/20 text-accent">
                {storageIssueCount}
              </span>
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onOpenAudit)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-start hover:bg-canvas transition-colors cursor-pointer text-text"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="size-3.5 text-accent shrink-0" aria-hidden="true" />
              <span className="truncate">
                {selectedBooksCount > 0
                  ? `${t('auditAndRefreshMetadata')} (${selectedBooksCount})`
                  : t('auditAndRefreshMetadata')}
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onOpenTrash)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-start hover:bg-canvas transition-colors cursor-pointer text-text"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Trash2 className="size-3.5 text-danger shrink-0" aria-hidden="true" />
              <span className="truncate">{t('trashBin')}</span>
            </span>
            {trashCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-danger/15 text-danger">
                {trashCount}
              </span>
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onOpenStats)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-start hover:bg-canvas transition-colors cursor-pointer text-text"
          >
            <BarChart2 className="size-3.5 text-primary-text shrink-0" aria-hidden="true" />
            <span className="truncate">{t('statsDashboardTitle')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onOpenSecurity)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-start hover:bg-canvas transition-colors cursor-pointer text-text"
          >
            <ShieldCheck className="size-3.5 text-primary-text shrink-0" aria-hidden="true" />
            <span className="truncate">{t('securityModalTitle')}</span>
          </button>

          {/* Group 4: Online & Sync */}
          <div className="border-t border-border/60 my-1.5" />
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            {t('libraryRibbonOnline')}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onOpenCloudSync)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-start hover:bg-canvas transition-colors cursor-pointer text-text"
          >
            <Cloud className="size-3.5 text-accent shrink-0" aria-hidden="true" />
            <span className="truncate">{t('tabCloudStorage')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onOpenOpds)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-start hover:bg-canvas transition-colors cursor-pointer text-text"
          >
            <Globe className="size-3.5 text-primary-text shrink-0" aria-hidden="true" />
            <span className="truncate">{t('tabOpdsCatalogs')}</span>
          </button>
        </div>
      )}
    </div>
  );
};
