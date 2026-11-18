'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, BookA, GripVertical, Loader2, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  BIOGRAPHY_SCIENCE,
  type ArabicLexiconsImportProgress,
  type DictionaryItem,
} from '../../../shared/types/dictionary';

interface Science {
  id: string;
  name_ar: string;
  name_en: string;
}

/** Dictionaries the user holds, each tagged with the science it serves. */
export function DictionariesPanel() {
  const { t, lang } = useWorkspace();
  const [dictionaries, setDictionaries] = useState<DictionaryItem[]>([]);
  const [sciences, setSciences] = useState<Science[]>([]);
  const [science, setScience] = useState('');
  const [failed, setFailed] = useState(false);
  const [importingPack, setImportingPack] = useState(false);
  const [packProgress, setPackProgress] = useState<ArabicLexiconsImportProgress | null>(null);

  const uiLang: 'ar' | 'en' = lang === 'en' ? 'en' : 'ar';

  const refresh = useCallback(async () => {
    try {
      const api = window.electronAPI;
      const [items, categories] = await Promise.all([
        api.dictionaryList(uiLang),
        api.categories.getAll(),
      ]);
      setDictionaries(items as DictionaryItem[]);
      setSciences(categories as unknown as Science[]);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [uiLang]);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onArabicLexiconsImportProgress) return;
    return api.onArabicLexiconsImportProgress((progress) => {
      setPackProgress(progress);
    });
  }, []);

  const act = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await refresh();
    } catch {
      setFailed(true);
    }
  };

  // KEY-414: the user's dictionary order; lookups and the lookup window follow it.
  const [dragging, setDragging] = useState<string | null>(null);
  const saveOrder = (ids: string[]) =>
    act(async () => {
      const r = await window.electronAPI.dictionaryFeatures.setOrder(ids);
      if (!r.ok) throw new Error(r.error);
    });
  const move = (id: string, by: -1 | 1) => {
    const ids = dictionaries.map((d) => d.id);
    const at = ids.indexOf(id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    void saveOrder(ids);
  };
  const dropOn = (targetId: string) => {
    if (!dragging || dragging === targetId) return setDragging(null);
    const ids = dictionaries.map((d) => d.id).filter((id) => id !== dragging);
    ids.splice(ids.indexOf(targetId), 0, dragging);
    setDragging(null);
    void saveOrder(ids);
  };

  const handleImportPack = async () => {
    setImportingPack(true);
    setPackProgress({ stage: 'reading' });
    setFailed(false);
    try {
      const res = await window.electronAPI.dictionaryImportArabicLexicons({ lang: uiLang });
      if (res) {
        await refresh();
      }
    } catch {
      setFailed(true);
    } finally {
      setImportingPack(false);
      setPackProgress(null);
    }
  };

  const handleRemovePack = async () => {
    await act(() => window.electronAPI.dictionaryRemoveArabicLexicons());
  };

  const hasArabicLexiconsPack = dictionaries.some(
    (d) => d.format === 'arabic-lexicons' || d.id.startsWith('arlex-')
  );

  const renderProgressText = (p: ArabicLexiconsImportProgress) => {
    if (p.stage === 'reading') return t('arlexImportingStageReading');
    if (p.stage === 'unzipping') return t('arlexImportingStageUnzipping');
    if (p.stage === 'validating') return t('arlexImportingStageValidating');
    if (p.stage === 'indexing') {
      return t('arlexImportingStageIndexing', {
        current: p.current ?? 0,
        total: p.total ?? 11,
      });
    }
    return t('arlexImportingStageReading');
  };

  const options = (
    <>
      <option value="">{t('dictionaryGeneral')}</option>
      <option value={BIOGRAPHY_SCIENCE}>{t('dictionaryBiography')}</option>
      {sciences.map((item) => (
        <option key={item.id} value={item.id}>
          {lang === 'ar' ? item.name_ar : item.name_en}
        </option>
      ))}
    </>
  );

  return (
    <details data-dictionaries className="border-t border-subtle pt-3 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold text-main">
        <BookA className="size-4 text-muted" />
        {t('dictionariesTitle')}
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-xs leading-loose text-muted">{t('dictionariesHint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t('dictionaryScience')}
            value={science}
            onChange={(event) => setScience(event.target.value)}
            className="min-w-0 flex-1 rounded border border-subtle bg-canvas p-2"
          >
            {options}
          </select>
          <button
            type="button"
            onClick={() =>
              void act(() => window.electronAPI.dictionaryChooseImport(science || undefined))
            }
            className="rounded border border-subtle p-2 hover:bg-canvas"
          >
            {t('dictionaryImport')}
          </button>
          <button
            type="button"
            data-import-arabic-lexicons-btn
            disabled={importingPack}
            onClick={() => void handleImportPack()}
            className="rounded border border-subtle bg-surface p-2 font-medium text-main hover:bg-canvas disabled:opacity-50"
          >
            {t('arlexImportPack')}
          </button>
          {hasArabicLexiconsPack && (
            <button
              type="button"
              data-remove-arabic-lexicons-btn
              disabled={importingPack}
              onClick={() => void handleRemovePack()}
              className="rounded border border-subtle p-2 text-danger hover:bg-canvas disabled:opacity-50"
            >
              {t('arlexRemovePack')}
            </button>
          )}
        </div>
        {importingPack && packProgress && (
          <p
            role="status"
            data-arabic-lexicons-progress
            className="flex items-center gap-2 rounded border border-subtle bg-canvas/60 p-2 text-xs text-main"
          >
            <Loader2 className="size-3.5 animate-spin text-muted" />
            <span>{renderProgressText(packProgress)}</span>
          </p>
        )}
        {failed && (
          <p role="alert" className="text-red-600 dark:text-red-400">
            {t('knowledgeCardFailed')}
          </p>
        )}
        {dictionaries.length > 1 && <p className="text-xs leading-loose text-muted">{t('dictionaryOrderHint')}</p>}
        <ul className="space-y-1" data-dictionary-order>
          {dictionaries.map((item, index) => (
            <li
              key={item.id}
              data-dictionary={item.id}
              draggable
              onDragStart={(event) => {
                setDragging(item.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(event) => {
                if (dragging) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                dropOn(item.id);
              }}
              onDragEnd={() => setDragging(null)}
              className={`space-y-1 rounded border p-2 ${dragging === item.id ? 'border-accent opacity-60' : 'border-subtle'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted" aria-hidden="true" />
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.isEnabled}
                    onChange={(event) =>
                      void act(() =>
                        window.electronAPI.dictionaryToggle(item.id, event.target.checked)
                      )
                    }
                  />
                  <span dir="auto" className="min-w-0 break-words font-medium">
                    {item.title} · {item.entryCount}
                  </span>
                </label>
                <span className="flex shrink-0 items-center">
                  <button type="button" data-dictionary-move-up={item.id} disabled={index === 0} onClick={() => move(item.id, -1)} title={t('dictionaryMoveUp')} aria-label={t('dictionaryMoveUp')} className="rounded p-1 text-muted hover:bg-canvas disabled:opacity-30">
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button type="button" data-dictionary-move-down={item.id} disabled={index === dictionaries.length - 1} onClick={() => move(item.id, 1)} title={t('dictionaryMoveDown')} aria-label={t('dictionaryMoveDown')} className="rounded p-1 text-muted hover:bg-canvas disabled:opacity-30">
                    <ArrowDown className="size-3.5" />
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => void act(() => window.electronAPI.dictionaryDelete(item.id))}
                  title={t('dictionaryRemove')}
                  aria-label={t('dictionaryRemove')}
                  className="shrink-0 rounded p-1 text-muted hover:bg-canvas"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {item.attribution && (
                <p
                  dir="auto"
                  data-dictionary-attribution={item.id}
                  className="ps-6 text-xs text-muted"
                >
                  {item.attribution}
                </p>
              )}
              <select
                aria-label={t('dictionaryScience')}
                value={item.science ?? ''}
                onChange={(event) =>
                  void act(() =>
                    window.electronAPI.dictionarySetScience(item.id, event.target.value || null)
                  )
                }
                className="w-full rounded border border-subtle bg-canvas p-1"
              >
                {options}
              </select>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
