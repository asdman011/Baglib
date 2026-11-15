'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Upload, FileText, FileCode, Search, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { translations } from '../../translations';
import type { QuickNoteItem } from '../../../shared/manuscript-export';
import type { Manuscript, ManuscriptDocument } from '../../../shared/manuscripts';

interface ResearchImportModalProps {
  language: 'ar' | 'en';
  isOpen: boolean;
  onClose: () => void;
  manuscript: Manuscript;
  onImportSuccess: (doc: ManuscriptDocument) => void;
}

export function ResearchImportModal({
  language,
  isOpen,
  onClose,
  manuscript,
  onImportSuccess
}: ResearchImportModalProps) {
  const t = translations[language];
  const [tab, setTab] = useState<'note' | 'markdown'>('note');
  const [quickNotes, setQuickNotes] = useState<QuickNoteItem[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [markdownText, setMarkdownText] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedNoteId(null);
      setMarkdownText('');
      setCustomTitle('');
      setErrorMessage(null);
      return;
    }

    let isMounted = true;
    setIsLoadingNotes(true);
    window.electronAPI?.manuscripts
      ?.quickNotesList?.()
      .then(notes => {
        if (isMounted) {
          setQuickNotes(notes || []);
          if (notes?.length) setSelectedNoteId(notes[0].id);
        }
      })
      .catch(() => {
        if (isMounted) setQuickNotes([]);
      })
      .finally(() => {
        if (isMounted) setIsLoadingNotes(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return quickNotes;
    const q = searchQuery.toLowerCase();
    return quickNotes.filter(
      n =>
        n.title.toLowerCase().includes(q) ||
        n.snippet.toLowerCase().includes(q) ||
        n.tags.some(tag => tag.toLowerCase().includes(q))
    );
  }, [quickNotes, searchQuery]);

  if (!isOpen) return null;

  const handleImportNote = async () => {
    if (!selectedNoteId) return;
    setIsImporting(true);
    setErrorMessage(null);
    try {
      const api = window.electronAPI?.manuscripts;
      if (!api?.importNote) throw new Error('API not available');

      const doc = await api.importNote({
        manuscriptId: manuscript.id,
        noteId: selectedNoteId
      });

      onImportSuccess(doc);
      onClose();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || t.researchImportFailed);
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportMarkdown = async () => {
    if (!markdownText.trim()) return;
    setIsImporting(true);
    setErrorMessage(null);
    try {
      const api = window.electronAPI?.manuscripts;
      if (!api?.importMarkdown) throw new Error('API not available');

      const doc = await api.importMarkdown({
        manuscriptId: manuscript.id,
        markdown: markdownText,
        title: customTitle.trim() || undefined
      });

      onImportSuccess(doc);
      onClose();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || t.researchImportFailed);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!customTitle && file.name) {
      setCustomTitle(file.name.replace(/\.[^/.]+$/, ''));
    }

    const reader = new FileReader();
    reader.onload = evt => {
      const text = String(evt.target?.result || '');
      setMarkdownText(text);
    };
    reader.readAsText(file, 'utf-8');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      onKeyDown={e => {
        if (e.key === 'Escape' && !isImporting) onClose();
      }}
    >
      <div className="bg-bg-panel border border-border rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col text-start">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-bg-surface/50">
          <div className="flex items-center gap-2.5">
            <Upload className="w-5 h-5 text-brand" />
            <h2 id="import-modal-title" className="text-base font-semibold text-text-primary">
              {t.researchImportModalTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-border px-5 bg-bg-surface">
          <button
            type="button"
            onClick={() => setTab('note')}
            className={`flex items-center gap-2 py-3 px-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'note'
                ? 'border-brand text-brand'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>{t.researchImportTabNote}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('markdown')}
            className={`flex items-center gap-2 py-3 px-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'markdown'
                ? 'border-brand text-brand'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>{t.researchImportTabMarkdown}</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto max-h-[65vh]">
          {tab === 'note' && (
            <div className="space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute inset-y-0 start-3 my-auto text-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t.researchImportSearchNotes}
                  className="w-full text-sm bg-bg-surface border border-border rounded-lg ps-9 pe-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              {/* Notes List */}
              {isLoadingNotes ? (
                <div className="flex items-center justify-center py-10 text-text-muted text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t.loading}</span>
                </div>
              ) : filteredNotes.length === 0 ? (
                <div className="py-10 text-center text-text-muted text-sm">
                  {t.researchImportNoNotes}
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {filteredNotes.map(note => {
                    const isSelected = selectedNoteId === note.id;
                    return (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => setSelectedNoteId(note.id)}
                        className={`w-full p-2.5 rounded-lg border text-start transition-all ${
                          isSelected
                            ? 'border-brand bg-brand/5 ring-1 ring-brand text-brand'
                            : 'border-border bg-bg-surface hover:bg-bg-hover text-text-primary'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">{note.title}</span>
                          <span className="text-[11px] text-text-muted font-mono shrink-0 ms-2">
                            {note.updatedAt?.slice(0, 10)}
                          </span>
                        </div>
                        {note.snippet && (
                          <p className="text-xs text-text-muted line-clamp-1 mt-1">
                            {note.snippet}
                          </p>
                        )}
                        {note.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {note.tags.slice(0, 3).map(tag => (
                              <span
                                key={tag}
                                className="text-[10px] bg-bg-panel border border-border px-1.5 py-0.5 rounded text-text-muted"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'markdown' && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                  {t.researchImportChapterTitle}
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={e => setCustomTitle(e.target.value)}
                  placeholder={t.researchImportChapterTitle}
                  className="w-full text-sm bg-bg-surface border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider">
                    {t.researchImportTabMarkdown}
                  </label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-brand hover:underline flex items-center gap-1"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{t.researchImportOpenFile}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.markdown,.txt"
                    onChange={handleFilePicked}
                    className="hidden"
                  />
                </div>
                <textarea
                  value={markdownText}
                  onChange={e => setMarkdownText(e.target.value)}
                  placeholder={t.researchImportMarkdownPlaceholder}
                  rows={8}
                  className="w-full text-sm font-mono bg-bg-surface border border-border rounded-lg p-3 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand resize-y leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="mt-3 p-3 rounded-lg border border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 flex items-start gap-2.5 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-bg-surface/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={tab === 'note' ? handleImportNote : handleImportMarkdown}
            disabled={
              isImporting ||
              (tab === 'note' && !selectedNoteId) ||
              (tab === 'markdown' && !markdownText.trim())
            }
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand hover:bg-brand/90 disabled:opacity-50 rounded-lg shadow-sm transition-colors"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t.researchImporting}</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>{t.researchImportAction}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
