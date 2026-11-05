'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BookA, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { BIOGRAPHY_SCIENCE, type DictionaryItem } from '../../../shared/types/dictionary';

interface Science { id: string; name_ar: string; name_en: string }

/** Dictionaries the user holds, each tagged with the science it serves. */
export function DictionariesPanel() {
  const { t, lang } = useWorkspace();
  const [dictionaries, setDictionaries] = useState<DictionaryItem[]>([]);
  const [sciences, setSciences] = useState<Science[]>([]);
  const [science, setScience] = useState('');
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const api = window.electronAPI;
      const [items, categories] = await Promise.all([api.dictionaryList(), api.categories.getAll()]);
      setDictionaries(items as DictionaryItem[]);
      setSciences(categories as unknown as Science[]);
      setFailed(false);
    } catch { setFailed(true); }
  }, []);
  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);

  const act = async (action: () => Promise<unknown>) => {
    try { await action(); await refresh(); } catch { setFailed(true); }
  };
  const options = <>
    <option value="">{t('dictionaryGeneral')}</option>
    <option value={BIOGRAPHY_SCIENCE}>{t('dictionaryBiography')}</option>
    {sciences.map(item => <option key={item.id} value={item.id}>{lang === 'ar' ? item.name_ar : item.name_en}</option>)}
  </>;

  return <details data-dictionaries className="border-t border-subtle pt-3 text-sm">
    <summary className="flex cursor-pointer items-center gap-2 font-semibold text-main"><BookA className="size-4 text-muted" />{t('dictionariesTitle')}</summary>
    <div className="mt-2 space-y-2">
      <p className="text-xs leading-loose text-muted">{t('dictionariesHint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t('dictionaryScience')} value={science} onChange={event => setScience(event.target.value)} className="min-w-0 flex-1 rounded border border-subtle bg-canvas p-2">{options}</select>
        <button type="button" onClick={() => void act(() => window.electronAPI.dictionaryChooseImport(science || undefined))} className="rounded border border-subtle p-2">{t('dictionaryImport')}</button>
      </div>
      {failed && <p role="alert" className="text-red-600 dark:text-red-400">{t('knowledgeCardFailed')}</p>}
      <ul className="space-y-1">
        {dictionaries.map(item => <li key={item.id} data-dictionary={item.id} className="space-y-1 rounded border border-subtle p-2">
          <div className="flex items-center justify-between gap-2">
            <label className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={item.isEnabled} onChange={event => void act(() => window.electronAPI.dictionaryToggle(item.id, event.target.checked))} /><span dir="auto" className="min-w-0 break-words">{item.title} · {item.entryCount}</span></label>
            <button type="button" onClick={() => void act(() => window.electronAPI.dictionaryDelete(item.id))} title={t('dictionaryRemove')} aria-label={t('dictionaryRemove')} className="shrink-0 rounded p-1 text-muted hover:bg-canvas"><Trash2 className="size-3.5" /></button>
          </div>
          <select aria-label={t('dictionaryScience')} value={item.science ?? ''} onChange={event => void act(() => window.electronAPI.dictionarySetScience(item.id, event.target.value || null))} className="w-full rounded border border-subtle bg-canvas p-1">{options}</select>
        </li>)}
      </ul>
    </div>
  </details>;
}
