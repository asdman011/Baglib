'use client';
/**
 * KEY-345: one Export and one Import for the Notes tab, acting on where the user is.
 * Export writes exactly the notes the current folder and filters show — as a folder tree mirroring the Notes tab
 * (Markdown) or as one file (Word, CSV, LaTeX). Import reads any Markdown, an Obsidian vault, a Word document or
 * BagLib's CSV, shows how many notes it found, and attaches them to the open folder.
 */
import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { TranslationKey } from '../../translations';
import { HAFS_SURAH_AYAH_COUNTS } from '../../../shared/quran-wird';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** The study target that stands for a Notes folder, so imported notes land in it; null where none exists. */
export function folderTarget(folder: string | null): string | null {
  if (!folder) return null;
  const [root, id] = folder.split('/');
  if (root === 'quran' && id) { const surah = Number(id); const last = HAFS_SURAH_AYAH_COUNTS[surah - 1]; return last ? `quran:hafs:${surah}:1-${last}` : null; }
  if (root === 'library' && id) return `book:${id}`;
  if (root === 'poetry' && id) return `poetry:ashaar:${id}:0:0`;
  if (root === 'lectures' && id) return `media:${id}:0`;
  return null;
}

export function NotesExportDialog({ open, onClose, t, folderTitle, ids, folders, onDone, onWord }: {
  open: boolean; onClose: () => void; t: Translate; folderTitle: string; ids: string[];
  /** Folder names for each note (relative to the open folder), for the folder-tree layout. */
  folders: Record<string, string[]>;
  onDone: (result: { folder: string; count: number }) => void;
  onWord: () => void;
}) {
  const [layout, setLayout] = useState<'folders' | 'file'>('folders');
  const [format, setFormat] = useState<'word' | 'csv' | 'latex'>('word');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const go = async () => {
    setBusy(true); setFailed(false);
    try {
      if (layout === 'file' && format === 'word') { onWord(); onClose(); return; }
      const result = layout === 'folders' ? await window.electronAPI.studyNotes.exportFolders(ids, folders) : await window.electronAPI.studyNotes.exportOpenFormat(ids, format as 'csv' | 'latex');
      if (result) { onDone(result); onClose(); }
    } catch { setFailed(true); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={() => { if (!busy) onClose(); }} title={t('notesExport')}>
    <div className="space-y-4 p-4 text-sm leading-relaxed" data-notes-export-dialog>
      <p data-notes-export-scope>{t('notesExportScope', { count: ids.length, folder: folderTitle })}</p>
      <fieldset className="space-y-2">
        <label className="flex items-center gap-2"><input type="radio" name="notes-layout" data-notes-export-layout="folders" checked={layout === 'folders'} onChange={() => setLayout('folders')} />{t('notesExportFolders')}</label>
        <label className="flex items-center gap-2"><input type="radio" name="notes-layout" data-notes-export-layout="file" checked={layout === 'file'} onChange={() => setLayout('file')} />{t('notesExportOneFile')}</label>
      </fieldset>
      {layout === 'file' && <label className="flex flex-col gap-2">{t('notesExportFormat')}
        <select data-notes-export-format value={format} onChange={event => setFormat(event.target.value as typeof format)} className="rounded-lg border border-subtle bg-surface p-2 text-start">
          <option value="word">Word (.docx)</option><option value="csv">{t('notesFormatCsv')}</option><option value="latex">{t('notesFormatLatex')}</option>
        </select></label>}
      {failed && <p role="alert" className="text-danger">{t('studyActionFailed')}</p>}
      <Button variant="primary" disabled={busy || !ids.length} onClick={() => void go()} data-notes-export-go>{t('wordExportGo')}</Button>
    </div>
  </Modal>;
}

export function NotesImportDialog({ open, onClose, t, folder, folderTitle, onDone }: {
  open: boolean; onClose: () => void; t: Translate; folder: string | null; folderTitle: string; onDone: (count: number) => void;
}) {
  const [found, setFound] = useState<{ token: string; count: number; titles: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const target = folderTarget(folder);
  const close = () => { if (busy) return; setFound(null); setFailed(false); onClose(); };
  const prepare = async (kind: 'markdown' | 'folder' | 'docx' | 'csv') => {
    setBusy(true); setFailed(false);
    try { setFound(await window.electronAPI.studyNotes.importPrepare(kind)); } catch { setFailed(true); } finally { setBusy(false); }
  };
  const commit = async () => {
    if (!found) return;
    setBusy(true); setFailed(false);
    try {
      const result = await window.electronAPI.studyNotes.importCommit(found.token, target ? { target, label: folderTitle } : undefined);
      window.dispatchEvent(new CustomEvent('baglib:notes-changed'));
      onDone(result.count); setFound(null); onClose();
    } catch { setFailed(true); } finally { setBusy(false); }
  };
  const sources = [['markdown', 'notesImportMarkdownAny'], ['folder', 'notesImportObsidian'], ['docx', 'notesImportWord'], ['csv', 'notesImportCsv']] as const;
  return <Modal open={open} onClose={close} title={t('notesImport')}>
    <div className="space-y-4 p-4 text-sm leading-relaxed" data-notes-import-dialog>
      {!found ? <div className="grid grid-cols-2 gap-2">{sources.map(([kind, label]) => <Button key={kind} variant="secondary" disabled={busy} data-notes-import-kind={kind} onClick={() => void prepare(kind)}>{t(label)}</Button>)}</div>
        : <>
          <p data-notes-import-found>{t('notesImportFound', { count: found.count })}</p>
          {found.titles.length > 0 && <ul className="list-disc ps-5 text-muted">{found.titles.map((title, index) => <li key={index} dir="auto" className="truncate">{title}</li>)}</ul>}
          {target && <p className="text-xs text-muted" data-notes-import-attach>{t('notesImportAttach', { folder: folderTitle })}</p>}
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy || !found.count} onClick={() => void commit()} data-notes-import-go>{t('notesImportConfirm', { count: found.count })}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setFound(null)}>{t('bayanBack')}</Button>
          </div>
        </>}
      {failed && <p role="alert" className="text-danger">{t('studyActionFailed')}</p>}
    </div>
  </Modal>;
}
