'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { Manuscript, ManuscriptDocument, ManuscriptMode } from '../../../shared/manuscripts';
import { translations } from '../../translations';
import {
  PanelLeftClose,
  PanelLeftOpen,
  FileText,
  Frame,
  Star,
  Info,
  MoreHorizontal,
  Pencil,
  Copy,
  Download,
  Trash2,
  Presentation,
  PanelRight,
  ListOrdered,
  History,
  Check,
} from 'lucide-react';

interface Props {
  language: 'ar' | 'en';
  document: ManuscriptDocument;
  manuscript?: Manuscript;
  mode: ManuscriptMode;
  onModeChange: (mode: ManuscriptMode) => void;
  onToggleSidebar: () => void;
  isSidebarCollapsed: boolean;
  isFavourite: boolean;
  onToggleFavourite: () => void;
  onOpenInfo: () => void;
  onOpenToc: () => void;
  onOpenHistory: () => void;
  onRename: (title: string) => Promise<void>;
  onDuplicate: () => Promise<void>;
  onTrash: () => Promise<void>;
  onExportMarkdown?: () => Promise<void>;
  onExportHtml?: () => Promise<void>;
  onTogglePresentation: () => void;
  isPresentation: boolean;
  onToggleRightPanel: () => void;
  isRightPanelOpen: boolean;
  onSetDefaultMode?: (mode: ManuscriptMode) => Promise<void>;
}

export function ResearchTopBar({
  language,
  document,
  manuscript,
  mode,
  onModeChange,
  onToggleSidebar,
  isSidebarCollapsed,
  isFavourite,
  onToggleFavourite,
  onOpenInfo,
  onOpenToc,
  onOpenHistory,
  onRename,
  onDuplicate,
  onTrash,
  onExportMarkdown,
  onExportHtml,
  onTogglePresentation,
  isPresentation,
  onToggleRightPanel,
  isRightPanelOpen,
  onSetDefaultMode,
}: Props) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(document.title);
  const [prevDocTitle, setPrevDocTitle] = useState(document.title);
  if (document.title !== prevDocTitle) {
    setPrevDocTitle(document.title);
    setTitleValue(document.title);
  }
  const menuRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const t = translations[language];

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const handleTitleSubmit = async () => {
    setIsEditingTitle(false);
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== document.title) {
      await onRename(trimmed);
    } else {
      setTitleValue(document.title);
    }
  };

  return (
    <header className="research-top-bar" role="banner">
      {/* Start / Left cluster */}
      <div className="research-top-bar-start">
        {/* Sidebar Toggle */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="research-top-btn"
          title={t.researchToggleSidebar}
          aria-label={t.researchToggleSidebar}
        >
          {isSidebarCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>

        {/* Page / Edgeless Mode Toggle (Segmented Pill) */}
        <div className="research-mode-toggle" role="group" aria-label={t.researchPageMode}>
          <button
            type="button"
            onClick={() => onModeChange('page')}
            className={`research-mode-btn ${mode === 'page' ? 'active' : ''}`}
            title={t.researchPageMode}
            aria-label={t.researchPageMode}
            aria-pressed={mode === 'page'}
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onModeChange('edgeless')}
            className={`research-mode-btn ${mode === 'edgeless' ? 'active' : ''}`}
            title={t.researchEdgelessMode}
            aria-label={t.researchEdgelessMode}
            aria-pressed={mode === 'edgeless'}
          >
            <Frame className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Document Title (Editable) */}
        <div className="research-title-container">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={() => void handleTitleSubmit()}
              onKeyDown={e => {
                if (e.key === 'Enter') void handleTitleSubmit();
                if (e.key === 'Escape') {
                  setTitleValue(document.title);
                  setIsEditingTitle(false);
                }
              }}
              className="research-title-input"
              maxLength={1000}
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingTitle(true)}
              className="research-title-display"
              title={manuscript ? `${manuscript.title} · ${document.title}` : t.manuscriptRename}
            >
              <span className="truncate max-w-[280px]">{document.title}</span>
            </button>
          )}
        </div>

        {/* Favourite Star */}
        <button
          type="button"
          onClick={onToggleFavourite}
          className={`research-top-btn ${isFavourite ? 'text-amber-500 fill-amber-500' : 'text-text-muted hover:text-text-main'}`}
          title={isFavourite ? t.researchRemoveFromFavourites : t.researchAddToFavourites}
          aria-label={isFavourite ? t.researchRemoveFromFavourites : t.researchAddToFavourites}
          aria-pressed={isFavourite}
        >
          <Star className={`w-4 h-4 ${isFavourite ? 'fill-amber-500' : ''}`} />
        </button>

        {/* Info Icon Button */}
        <button
          type="button"
          onClick={onOpenInfo}
          className="research-top-btn"
          title={t.researchViewInfo}
          aria-label={t.researchViewInfo}
        >
          <Info className="w-4 h-4" />
        </button>

        {/* More Options "..." Menu (Screenshot 3.png) */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="research-top-btn"
            title={t.reSettings || 'Options'}
            aria-label={t.reSettings || 'Options'}
            aria-expanded={isMenuOpen}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {isMenuOpen && (
            <div
              className="research-top-menu animate-in fade-in zoom-in-95 duration-100"
              role="menu"
            >
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsEditingTitle(true);
                }}
                className="research-top-menu-item"
                role="menuitem"
              >
                <Pencil className="w-4 h-4" />
                <span>{t.manuscriptRename}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  const next = document.primary_mode === 'edgeless' ? 'page' : 'edgeless';
                  void onSetDefaultMode?.(next);
                }}
                className="research-top-menu-item"
                role="menuitem"
              >
                <Frame className="w-4 h-4" />
                <span>{t.researchDefaultToEdgeless}</span>
                {document.primary_mode === 'edgeless' && <Check className="w-3.5 h-3.5 ms-auto text-primary" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onToggleFavourite();
                }}
                className="research-top-menu-item"
                role="menuitem"
              >
                <Star className={`w-4 h-4 ${isFavourite ? 'fill-amber-500 text-amber-500' : ''}`} />
                <span>{isFavourite ? t.researchRemoveFromFavourites : t.researchAddToFavourites}</span>
              </button>

              <div className="research-menu-divider" />

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenInfo();
                }}
                className="research-top-menu-item"
                role="menuitem"
              >
                <Info className="w-4 h-4" />
                <span>{t.researchViewInfo}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenToc();
                }}
                className="research-top-menu-item"
                role="menuitem"
              >
                <ListOrdered className="w-4 h-4" />
                <span>{t.researchViewToc}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenHistory();
                }}
                className="research-top-menu-item"
                role="menuitem"
              >
                <History className="w-4 h-4" />
                <span>{t.researchViewHistory}</span>
              </button>

              <div className="research-menu-divider" />

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  void onDuplicate();
                }}
                className="research-top-menu-item"
                role="menuitem"
              >
                <Copy className="w-4 h-4" />
                <span>{t.researchDuplicate}</span>
              </button>

              <div className="research-menu-divider" />
              <span className="text-[10px] text-text-muted px-2.5 py-0.5 uppercase tracking-wider block">
                {t.researchExport}
              </span>

              {onExportMarkdown && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    void onExportMarkdown();
                  }}
                  className="research-top-menu-item"
                  role="menuitem"
                >
                  <Download className="w-4 h-4" />
                  <span>{t.researchExportMarkdown}</span>
                </button>
              )}

              {onExportHtml && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    void onExportHtml();
                  }}
                  className="research-top-menu-item"
                  role="menuitem"
                >
                  <Download className="w-4 h-4" />
                  <span>{t.researchExportHtml}</span>
                </button>
              )}

              <div className="research-menu-divider" />

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  void onTrash();
                }}
                className="research-top-menu-item text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                role="menuitem"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t.manuscriptTrash}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* End / Right cluster */}
      <div className="research-top-bar-end">
        {/* Presentation Button */}
        <button
          type="button"
          onClick={onTogglePresentation}
          className={`research-top-btn ${isPresentation ? 'active text-primary' : ''}`}
          title={t.researchPresentation}
          aria-label={t.researchPresentation}
          aria-pressed={isPresentation}
        >
          <Presentation className="w-4 h-4" />
        </button>

        {/* Right Panel Toggle (TOC / Info) */}
        <button
          type="button"
          onClick={onToggleRightPanel}
          className={`research-top-btn ${isRightPanelOpen ? 'active text-primary' : ''}`}
          title={t.researchToggleRightPanel}
          aria-label={t.researchToggleRightPanel}
          aria-pressed={isRightPanelOpen}
        >
          <PanelRight className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
