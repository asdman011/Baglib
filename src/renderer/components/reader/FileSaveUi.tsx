'use client';
import React, { useState } from 'react';
import { AlertTriangle, FileDown, X } from 'lucide-react';
import { ADDITION_KINDS, COLOR_HEX, EXPORT_CATEGORIES, type AdditionKind, type ExportCategory, type MaterialSaveStatus } from '../../../shared/material-save';
import type { TranslationKey } from '../../translations';
import { InfoTip } from '../layout/InfoTip';

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** Closing a book (or the app) with changes not yet written into its file (ADR-012). */
export function SaveCloseDialog({ title, busy, onSave, onDiscard, onCancel, t }: { title: string; busy: boolean; onSave: () => void; onDiscard: () => void; onCancel: () => void; t: T }) {
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
    <div role="alertdialog" aria-modal="true" aria-labelledby="save-close-title" aria-describedby="save-close-body" data-save-close
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } }}
      className="w-full max-w-md space-y-3 rounded-2xl border border-subtle bg-surface p-5 text-main shadow-2xl" onClick={event => event.stopPropagation()}>
      <h2 id="save-close-title" className="text-sm font-bold">{t('saveCloseTitle')}</h2>
      <div id="save-close-body" className="space-y-2 text-sm leading-relaxed">
        <p dir="auto">{t('saveCloseBody', { title })}</p>
        <p className="text-xs text-muted">{t('saveCloseNote')}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-1 text-sm">
        <button type="button" data-save-close-cancel onClick={onCancel} className="rounded-lg border border-subtle px-3 py-1.5 hover:bg-canvas">{t('saveCloseCancel')}</button>
        <button type="button" data-save-close-discard onClick={onDiscard} className="rounded-lg border border-subtle px-3 py-1.5 hover:bg-canvas">{t('saveCloseDiscard')}</button>
        <button type="button" data-save-close-save autoFocus disabled={busy} onClick={onSave} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">{busy ? t('saveStateSaving') : t('saveCloseSave')}</button>
      </div>
    </div>
  </div>;
}

const incidentKeys: Record<NonNullable<MaterialSaveStatus['incident']>, TranslationKey> = {
  interrupted: 'saveIncidentInterrupted', corrupt: 'saveIncidentCorrupt', 'external-change': 'saveIncidentExternal',
};
/** A recovery incident: the emergency copy is kept until the user decides. */
export function SaveIncidentBanner({ status, onRestore, onKeep, t }: { status: MaterialSaveStatus; onRestore: () => void; onKeep: () => void; t: T }) {
  if (!status.incident) return null;
  return <div role="alert" data-save-incident={status.incident} className="flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-main">
    <AlertTriangle size={14} aria-hidden="true" className="shrink-0 text-amber-600" />
    <span className="font-semibold">{t(incidentKeys[status.incident])}</span>
    <span className="text-muted">{t('saveIncidentHelp')}</span>
    <span className="ms-auto flex gap-2">
      {status.backup && <button type="button" data-save-incident-restore onClick={onRestore} className="rounded-lg border border-subtle bg-surface px-2 py-1 hover:bg-canvas">{t('saveIncidentRestore')}</button>}
      <button type="button" data-save-incident-keep onClick={onKeep} className="rounded-lg border border-subtle bg-surface px-2 py-1 hover:bg-canvas">{t('saveIncidentKeep')}</button>
    </span>
  </div>;
}

const categoryKeys: Record<ExportCategory, TranslationKey> = {
  textMarks: 'exportCatTextMarks', shapes: 'exportCatShapes', textBoxes: 'exportCatTextBoxes', comments: 'exportCatComments',
  replies: 'exportCatReplies', questions: 'exportCatQuestions', bookmarks: 'exportCatBookmarks', pageNotes: 'exportCatPageNotes',
};
const kindKeys: Record<AdditionKind, TranslationKey> = {
  highlight: 'markupToolHighlight', underline: 'markupToolUnderline', strike: 'markupToolStrike', rect: 'markupToolRect', oval: 'markupToolOval',
  arrow: 'markupToolArrow', text: 'markupToolText', area: 'markupToolArea', pin: 'markupToolComment', note: 'exportCatPageNotes', question: 'exportCatQuestions',
};
const colorKeys: Record<string, TranslationKey> = { amber: 'markupColorAmber', emerald: 'markupColorEmerald', rose: 'markupColorRose', sky: 'markupColorSky', violet: 'markupColorViolet' };

/** Selective export (ADR-012): an independent copy with only the chosen BagLib additions. */
export function ExportPdfDialog({ workId, pages, onClose, t, lang, dir }: { workId: string; pages: number; onClose: () => void; t: T; lang: string; dir: 'rtl' | 'ltr' }) {
  const [categories, setCategories] = useState<Set<ExportCategory>>(new Set(EXPORT_CATEGORIES));
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [colors, setColors] = useState<Set<string>>(new Set());
  const [kinds, setKinds] = useState<Set<AdditionKind>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = <V,>(set: Set<V>, value: V) => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); return next; };
  const info = (label: TranslationKey, text: TranslationKey) => <InfoTip label={label} ariaLabel={t('infoAbout', { label: t(label) })} text={t(text)} />;
  const run = async () => {
    setBusy(true); setMessage(null);
    try {
      const result = await window.electronAPI.materialSave.exportCopy(workId, { categories: [...categories], pages: range, colors: colors.size ? [...colors] : null, kinds: kinds.size ? [...kinds] : null }, lang);
      if (!result.ok) setMessage({ ok: false, text: result.error === 'engine-missing' ? t('saveStateNoEngine') : t('exportFailed') });
      else if (result.data) setMessage({ ok: true, text: `${t('exportDone', { path: result.data.path })} · ${t('exportCount', { items: result.data.items, bookmarks: result.data.bookmarks })}` });
    } catch { setMessage({ ok: false, text: t('exportFailed') }); } finally { setBusy(false); }
  };
  const chip = (active: boolean) => `rounded-full border px-2 py-0.5 text-xs ${active ? 'border-emerald-500 bg-emerald-500/15' : 'border-subtle hover:bg-canvas'}`;
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-2 sm:p-4" dir={dir} onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby="export-pdf-title" data-export-pdf onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) onClose(); }}
      className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-subtle bg-surface text-main shadow-2xl" onClick={event => event.stopPropagation()}>
      <header className="flex items-center gap-2 border-b border-subtle px-4 py-2">
        <FileDown size={16} aria-hidden="true" />
        <h2 id="export-pdf-title" className="text-sm font-bold">{t('exportPdfTitle')}</h2>
        <button type="button" aria-label={t('close')} title={t('close')} onClick={onClose} className="ms-auto rounded p-1 hover:bg-canvas"><X size={16} /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <p className="text-xs leading-relaxed text-muted">{t('exportIntro')}</p>
        <fieldset className="min-w-0 space-y-2">
          <legend className="flex items-center gap-1 text-xs font-bold">{t('exportCategories')}{info('exportCategories', 'exportCategoriesInfo')}</legend>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button type="button" data-export-select-all onClick={() => setCategories(new Set(EXPORT_CATEGORIES))} className="rounded-lg border border-subtle px-2 py-1 hover:bg-canvas">{t('exportSelectAll')}</button>
            <button type="button" data-export-clear-all onClick={() => setCategories(new Set())} className="rounded-lg border border-subtle px-2 py-1 hover:bg-canvas">{t('exportClearAll')}</button>
            {info('exportClearAll', 'exportClearAllInfo')}
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {EXPORT_CATEGORIES.map(category => <label key={category} className="flex items-center gap-2">
              <input type="checkbox" data-export-category={category} checked={categories.has(category)} onChange={() => setCategories(current => toggle(current, category))} />
              {t(categoryKeys[category])}
            </label>)}
          </div>
        </fieldset>
        <fieldset className="min-w-0 space-y-2">
          <legend className="text-xs font-bold">{t('exportPages')}</legend>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1"><input type="checkbox" data-export-all-pages checked={!range} onChange={event => setRange(event.target.checked ? null : { from: 1, to: pages || 1 })} />{t('exportAllPages')}</label>
            {range && <>
              <label className="flex items-center gap-1">{t('exportPagesFrom')}<input type="number" data-export-from dir="ltr" min={1} max={pages || undefined} value={range.from} onChange={event => setRange({ from: Math.max(1, Number(event.target.value) || 1), to: Math.max(range.to, Number(event.target.value) || 1) })} className="w-16 rounded border border-subtle bg-canvas px-1 py-0.5" /></label>
              <label className="flex items-center gap-1">{t('exportPagesTo')}<input type="number" data-export-to dir="ltr" min={range.from} max={pages || undefined} value={range.to} onChange={event => setRange({ ...range, to: Math.max(range.from, Number(event.target.value) || range.from) })} className="w-16 rounded border border-subtle bg-canvas px-1 py-0.5" /></label>
            </>}
          </div>
        </fieldset>
        <fieldset className="min-w-0 space-y-2">
          <legend className="text-xs font-bold">{t('exportColors')}</legend>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={!colors.size} onClick={() => setColors(new Set())} className={chip(!colors.size)}>{t('exportAnyColor')}</button>
            {Object.entries(COLOR_HEX).map(([id, hex]) => <button key={id} type="button" data-export-color={id} aria-pressed={colors.has(id)} onClick={() => setColors(current => toggle(current, id))} className={`${chip(colors.has(id))} inline-flex items-center gap-1`}>
              <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: hex }} />{t(colorKeys[id])}
            </button>)}
          </div>
        </fieldset>
        <fieldset className="min-w-0 space-y-2">
          <legend className="text-xs font-bold">{t('exportKinds')}</legend>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={!kinds.size} onClick={() => setKinds(new Set())} className={chip(!kinds.size)}>{t('exportAnyKind')}</button>
            {ADDITION_KINDS.map(kind => <button key={kind} type="button" data-export-kind={kind} aria-pressed={kinds.has(kind)} onClick={() => setKinds(current => toggle(current, kind))} className={chip(kinds.has(kind))}>{t(kindKeys[kind])}</button>)}
          </div>
        </fieldset>
        <p className="text-xs text-muted">{t('exportViewerNote')}</p>
        {message && <p role={message.ok ? 'status' : 'alert'} data-export-message={message.ok ? 'done' : 'failed'} dir="auto" className={`break-all text-xs ${message.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>{message.text}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-subtle px-4 py-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-subtle px-3 py-1.5 text-sm hover:bg-canvas">{t('close')}</button>
        <button type="button" data-export-go disabled={busy} onClick={() => void run()} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? t('exportWorking') : t('exportGo')}</button>
      </footer>
    </div>
  </div>;
}
