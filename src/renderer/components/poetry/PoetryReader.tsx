'use client';
import { IslamicReaderHeader, IslamicReaderPanel } from '../islamic/IslamicReaderChrome';
import type { ReaderTab } from '../islamic/reader-chrome';
import { saveContinueReading } from '../islamic/continue-reading';
import React, { useMemo, useState } from 'react';
import type { PoetryDetail } from '../../../shared/types/poetry';
import { poetryDisplayText, poetryDescriptionText } from '../../../shared/poetry';
import { ContextMenu } from '../ui/ContextMenu';
import { shortcutForEvent, shortcutHint } from '../actions/shortcuts';
import { addPassageToSrs, passageNote } from '../actions/passage-actions';
import { NoteMarker } from '../notes/NoteMarker';
import { useNoteMarkers } from '../../hooks/useNoteMarkers';
import { useCtrlWheelZoom } from '../../hooks/useCtrlWheelZoom';
import { poetryRowCount } from '../../../shared/note-targets';
import { Copy, Share2, NotebookPen, SquareCheck } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { buildPoetryRows, poetryCopyText, poetryRhymeLetter, poetryRowLineClass, type PoetryRowModel } from './poetry-layout';
import { POETRY_LINE_ACTIONS, runPoetryLineAction, type PoetryLineActionHandlers } from './poetry-line-actions';
import { EnglishPoetryNarration } from './EnglishPoetryNarration';
import { PoetryNarrations } from './PoetryNarrations';
import { SavedPoetryNotes } from './SavedPoetryNotes';
import { PoetBiography } from './PoetBiography';
import { useCompanionContext } from '../../utils/companion-context';

const POETRY_SIZE_KEY = 'baglib.poetry.size', POETRY_SIZE_MIN = 18, POETRY_SIZE_MAX = 40;
export function PoetryReader({ poem, onBack, onPoet, initialVerse, initialTo }: { poem: PoetryDetail; onBack: () => void; onPoet?: (id: number) => void; initialVerse?: number; initialTo?: number }) {
  const { t, dir, lang } = useWorkspace();
  const noteCounts = useNoteMarkers();
  const verses = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(poem.verses_json);
      return Array.isArray(parsed) && parsed.every(value => typeof value === 'string') ? parsed as string[] : [];
    } catch { return []; }
  }, [poem.verses_json]);
  const paired = poem.language === 'ar' && poem.layout_type === 'bayt';
  const targetVerse = Math.max(0, Math.min(Number.isSafeInteger(initialVerse) ? initialVerse! : 0, verses.length - 1));
  const targetRow = paired ? Math.floor(targetVerse / 2) : targetVerse;
  const endVerse = Math.max(targetVerse, Math.min(Number.isSafeInteger(initialTo) ? initialTo! : targetVerse, verses.length - 1));
  const endRow = paired ? Math.floor(endVerse / 2) : endVerse;
  const targetElement = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (initialVerse === undefined) return;
    targetElement.current?.scrollIntoView({ block: 'center' });
    targetElement.current?.focus({ preventScroll: true });
  }, [initialVerse]);
  const [diacritics, setDiacritics] = useState(true);
  // The companion note pane links to the open poem, at the verses it was opened on.
  useCompanionContext('bayan', () => {
    const from = Math.max(0, Math.min(Number.isSafeInteger(initialVerse) ? initialVerse! : 0, Math.max(verses.length - 1, 0)));
    const to = Math.max(from, Math.min(Number.isSafeInteger(initialTo) ? initialTo! : from + (paired ? 1 : 0), Math.max(verses.length - 1, 0)));
    return { kind: 'poem', target: `poetry:ashaar:${poem.id}:${from}:${to}`, label: [poem.poet_name, poem.title].filter(Boolean).join(' — ') };
  }, [poem.id, initialVerse, initialTo, verses.length, paired]);
  const [justify, setJustify] = useState(false);
  const [offset, setOffset] = useState(() => Math.floor(targetRow / 100) * 100);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [personalNote, setPersonalNote] = useState('');
  const saveNative = async (from: number, to: number, type: 'note' | 'quote' | 'bookmark') => {
    try {
      const result = await window.electronAPI.poetry.saveKnowledge({ poemId: poem.id, from, to, type, note: type === 'bookmark' ? undefined : personalNote });
      if (!result.ok) throw new Error(result.error);
      window.dispatchEvent(new CustomEvent('baglib:notes-changed'));
      setSaved(true); setFailed(false);
    } catch { setFailed(true); }
  };
  const [selection, setSelection] = useState<[number, number] | null>(() => initialVerse === undefined || !verses.length ? null : [targetRow, endRow]);
  const anchor = React.useRef(targetRow);
  const saveNote = async (row: PoetryRowModel) => { await saveNative(row.sourceFrom, row.sourceTo, 'note'); };
  const [panelOpen, setPanelOpen] = useState(false);
  const [readerTab, setReaderTab] = useState<ReaderTab>('commentary');
  const [font, setFont] = useState(poem.language === 'ar' ? 'Amiri' : 'EB Garamond');
  // KEY-339: a saved verse size (was a fixed 24px), changed by the slider or Ctrl+wheel over the poem.
  const [size, setSize] = useState(() => { try { const saved = Number(localStorage.getItem(POETRY_SIZE_KEY)); return saved >= POETRY_SIZE_MIN && saved <= POETRY_SIZE_MAX ? saved : 24; } catch { return 24; } });
  const changeSize = (next: number) => { const value = Math.max(POETRY_SIZE_MIN, Math.min(POETRY_SIZE_MAX, next)); setSize(value); try { localStorage.setItem(POETRY_SIZE_KEY, String(value)); } catch { /* the size still applies for this session */ } };
  const poemScroller = React.useRef<HTMLDivElement>(null);
  useCtrlWheelZoom(poemScroller, step => changeSize(size + step * 2));
  const fonts = poem.language === 'ar' ? ([['Amiri', 'bayanFontAmiri'], ['Scheherazade New', 'bayanFontScheherazade'], ['Noto Naskh Arabic', 'bayanFontNaskh']] as const) : ([['EB Garamond', 'bayanFontGaramond'], ['Lora', 'bayanFontLora']] as const);
  const description = useMemo(() => {
    try { return poetryDescriptionText(JSON.parse(poem.description_json || 'null')); } catch { return ''; }
  }, [poem.description_json]);
  const sourceButton = (url: string | null, label: 'bayanPoemSource' | 'bayanPoetSource') => url && /^https?:\/\//u.test(url) ? <button type="button" className="block max-w-full break-all text-start text-sm underline" onClick={() => { void window.electronAPI.openExternal(url).catch(() => setFailed(true)); }}>{t(label)}: {url}</button> : null;
  const rows = useMemo(() => buildPoetryRows(verses, paired), [verses, paired]);
  const rhyme = useMemo(() => poem.language === 'ar' ? poetryRhymeLetter(rows) : null, [rows, poem.language]);
  const selectedRows = selection ? rows.slice(selection[0], selection[1] + 1) : [];
  const saveSelection = async (type: 'note' | 'quote' | 'bookmark') => {
    if (!selection || !selectedRows.length) return;
    await saveNative(selectedRows[0].sourceFrom, selectedRows[selectedRows.length - 1].sourceTo, type);
  };
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true); setFailed(false);
    } catch { setFailed(true); }
  };
  const copyRow = (row: Pick<PoetryRowModel, 'sadr' | 'ajuz'>) => copyText(poetryCopyText([row], poem));
  const shareRows = async (selectionRows: readonly Pick<PoetryRowModel, 'sadr' | 'ajuz'>[]) => {
    try {
      const result = await window.electronAPI.sunnah.share(poetryCopyText(selectionRows, poem));
      if (!result.ok) throw new Error(result.error);
      setFailed(false);
    } catch { setFailed(true); }
  };
  const copySelection = () => selectedRows.length ? copyText(poetryCopyText(selectedRows, poem)) : Promise.resolve();
  const copyPoem = () => copyText(poetryCopyText(rows.filter(row => row.sadr.trim() || row.ajuz?.trim()), poem));
  const [numbers, setNumbers] = useState(false);
  const [actionsRow, setActionsRow] = useState<number | null>(null);
  const [activeRow, setActiveRow] = useState(targetRow);
  React.useEffect(() => {
    const row = rows[activeRow];
    if (!row) return;
    void saveContinueReading('poetry', { target: 'poetry:ashaar:' + poem.id + ':' + row.sourceFrom + ':' + row.sourceTo, label: [poem.poet_name, poem.title].filter(Boolean).join(' — ') }).catch(() => setFailed(true));
  }, [activeRow, rows, poem.id, poem.poet_name, poem.title]);
  const listElement = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (actionsRow === null) return;
    const close = (event: Event) => { if (!(event.target instanceof Element) || !event.target.closest(`[data-poetry-row-index="${actionsRow}"]`)) setActionsRow(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setActionsRow(null); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [actionsRow]);
  const selectRow = (row: PoetryRowModel, extend: boolean) => {
    if (extend) setSelection([Math.min(anchor.current, row.index), Math.max(anchor.current, row.index)]);
    else { anchor.current = row.index; setSelection(selection?.[0] === row.index && selection[1] === row.index ? null : [row.index, row.index]); }
  };
  // The one handler table behind every per-line action: hover icons, keyboard and long-press.
  const lineHandlers: PoetryLineActionHandlers = {
    share: row => { void shareRows([row]); },
    copy: row => { void copyRow(row); },
    saveNote: row => { void saveNote(rows[row.index]); },
    select: row => selectRow(rows[row.index], false),
  };
  const lineIcons = { copy: Copy, share: Share2, note: NotebookPen, select: SquareCheck } as const;
  const moveFocus = (index: number) => {
    const next = listElement.current?.querySelector<HTMLElement>(`[data-poetry-row-index="${index}"]`);
    if (next) { setActiveRow(index); next.focus(); }
  };
  const lineNumber = (row: PoetryRowModel) => numbers || (poem.language === 'en' && (row.index + 1) % 5 === 0) ? (row.index + 1).toLocaleString(lang) : null;
  const centred = poem.language === 'ar';
  const halfStyle = justify ? { textAlign: 'justify', textAlignLast: 'justify' } as const : undefined;
  const chips = [{ key: 'bayanEra', value: poem.poet_era }, { key: 'bayanMeter', value: poem.meter }, { key: 'bayanRhyme', value: rhyme }, { key: 'bayanTheme', value: poem.theme }, { key: 'bayanLanguageType', value: poem.language_variant === '-' ? null : poem.language_variant }, { key: 'bayanLocation', value: poem.poet_location }, { key: 'bayanVerseCount', value: String(poem.verse_count ?? verses.length) }] as const;
  return <section data-poetry-id={poem.id} data-poetry-reference={initialVerse === undefined ? '' : `${initialVerse}:${initialTo ?? initialVerse}`} dir={dir} className="relative flex h-full min-h-0 flex-col bg-canvas p-4">
    <IslamicReaderHeader title={poem.title || poem.poet_name} t={t} panelOpen={panelOpen} onPanelToggle={() => setPanelOpen(value => !value)} picker={<><button type="button" onClick={onBack} className="rounded-lg p-2 text-sm">{t('bayanBack')}</button><select aria-label={t('navBayan')} value={poem.id} onChange={onBack} className="flex-1"><option value={poem.id}>{poem.poet_name} · {poem.title}</option></select></>} settings={<div className="flex flex-col gap-3"><label>{t('bayanFont')}<select value={font} onChange={event => setFont(event.target.value)} className="mx-3 rounded border border-subtle bg-canvas p-2">{fonts.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label><label className="flex items-center gap-3">{t('bayanFontSize')}<input type="range" data-poetry-size-range min={POETRY_SIZE_MIN} max={POETRY_SIZE_MAX} step={2} value={size} onChange={event => changeSize(Number(event.target.value))} /></label>      <button type="button" onClick={() => void shareRows(selectedRows.length ? selectedRows : rows)}>{t('bayanShare')}</button>
      <button type="button" onClick={() => void copyPoem()}>{t('bayanCopyPoem')}</button>
      <button type="button" disabled={!selectedRows.length} onClick={() => void copySelection()}>{t('bayanCopySelection')}</button>
      <label><input type="checkbox" checked={diacritics} onChange={event => setDiacritics(event.target.checked)} /> {t('bayanDiacritics')}</label>
      <label><input type="checkbox" checked={numbers} onChange={event => setNumbers(event.target.checked)} /> {t('bayanLineNumbers')}</label>
      {paired && <label><input type="checkbox" checked={justify} onChange={event => setJustify(event.target.checked)} /> {t('bayanJustify')}</label>}</div>} />
    {selection && <div role="toolbar" aria-label={t('bayanSelectVerse')} className="sticky top-0 z-10 flex flex-wrap gap-3 rounded-xl border border-subtle bg-surface p-3 shadow-lg">
      <button type="button" onClick={() => void copySelection()}>{t('bayanCopyVerse')}</button>
      <button type="button" onClick={() => void saveSelection('note')}>{t('bayanSaveNote')}</button>
      <button type="button" onClick={() => void saveSelection('quote')}>{t('bayanSaveQuote')}</button>
      <button type="button" onClick={() => void saveSelection('bookmark')}>{t('bayanSaveBookmark')}</button>
      <label className="w-full text-sm">{t('bayanPersonalNote')}<textarea rows={2} maxLength={50000} value={personalNote} onChange={event => setPersonalNote(event.target.value)} className="block w-full rounded border border-subtle bg-canvas p-2 text-start" dir="auto" /></label>
      {poem.language === 'en' && <EnglishPoetryNarration key={selection.join(':')} sentences={selectedRows.map(row => row.sadr)} />}
    </div>}
    {panelOpen && <IslamicReaderPanel active={readerTab} onTab={tab => { setReaderTab(tab); }} onClose={() => setPanelOpen(false)} t={t}>
      {readerTab === 'commentary' && <p dir="auto" className="whitespace-pre-wrap font-reading text-xl leading-[2.4]">{description || t('quranWordUnavailable')}</p>}
      {readerTab === 'notes' && <SavedPoetryNotes />}
      <PoetryNarrations key={poem.id} poem={poem} hidden={readerTab !== 'translation'} />
      {readerTab === 'related' && <PoetBiography poem={poem} onPoet={onPoet} onClose={() => setPanelOpen(false)} />}
    </IslamicReaderPanel>}
    <div ref={poemScroller} className="min-h-0 flex-1 overflow-y-auto py-5">
      <div data-poetry-header className="mx-auto mb-6 max-w-3xl text-center">
        <h1 dir="auto" className="mb-1 text-3xl font-semibold leading-[1.8]">{poem.title || poem.poet_name}</h1>
        <p dir="auto" className="mb-3 text-lg text-muted"><button type="button" className="rounded px-1 text-primary-text hover:underline focus-visible:outline-2 focus-visible:outline-pale-sky-500" onClick={() => { setPanelOpen(true); setReaderTab('related'); }}>{poem.poet_name}</button>{poem.poet_era && <> · {poem.poet_era}</>}</p>
        <dl className="flex flex-wrap justify-center gap-2 text-sm">
          {chips.map(item => item.value ? <div key={item.key} className="flex items-baseline gap-1.5 rounded-full border border-subtle bg-surface px-3 py-1"><dt className="text-xs text-muted">{t(item.key)}</dt><dd dir="auto" className="leading-relaxed">{item.value}</dd></div> : null)}
        </dl>
        <div className="mt-3 space-y-1">{sourceButton(poem.source_url, 'bayanPoemSource')}{sourceButton(poem.poet_url, 'bayanPoetSource')}</div>
      </div>
      {description && <details data-poetry-commentary className="mx-auto mb-6 max-w-3xl rounded-xl border border-subtle bg-surface p-3"><summary className="cursor-pointer font-semibold">{t('bayanDescription')}</summary><p dir="auto" className="mt-2 whitespace-pre-wrap break-words leading-loose">{description}</p></details>}
      <div ref={listElement} data-poetry-poem dir={poem.language === 'ar' ? 'rtl' : 'ltr'} style={{ fontFamily: `"Baglib Poetry ${font}", serif`, fontSize: `${size}px` }} className="mx-auto w-full max-w-4xl font-serif leading-[2.4]" data-poetry-size={size}>
        {rows.slice(offset, offset + 100).map(row => {
          if (row.kind === 'single' && !row.sadr.trim()) return <div key={row.index} aria-hidden="true" className="h-6" />;
          const selected = !!selection && row.index >= selection[0] && row.index <= selection[1];
          const number = lineNumber(row);
          return <ContextMenu items={[
            ...POETRY_LINE_ACTIONS.map(action => ({ id: action.id, label: t(action.labelKey), icon: React.createElement(lineIcons[action.icon], { size: 14 }), shortcut: shortcutHint('poetry-' + action.id), onClick: () => runPoetryLineAction(action.id, row, lineHandlers) })),
            { id: 'copy-line', label: t('ctxCopyText'), onClick: () => copyRow({ sadr: row.sadr, ajuz: null }) },
            { id: 'srs', label: t('ctxAddSrs'), onClick: () => addPassageToSrs({ text: poetryCopyText([row], poem), sourceKind: 'poetry', sourceRef: 'poetry:ashaar:' + poem.id + ':' + row.sourceFrom + ':' + row.sourceTo, sourceLabel: [poem.poet_name, poem.title].filter(Boolean).join(' — '), language: poem.language }) },
          ]} key={row.index} data-poetry-row data-poetry-row-index={row.index} data-poetry-kind={row.kind} data-actions-open={actionsRow === row.index} data-card-kind="poetry" data-card-ref={`poetry:${poem.id}:${row.index}`} data-card-label={[poem.poet_name, poem.title].filter(Boolean).join(' · ')} data-poetry-source-index={row.sourceFrom} aria-selected={selected} ref={row.index === targetRow ? targetElement : undefined} tabIndex={row.index === activeRow ? 0 : -1}
            onFocus={() => setActiveRow(row.index)}
            onKeyDown={event => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(row.index + 1); return; }
              if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(row.index - 1); return; }
              const shortcut = shortcutForEvent(event, 'poetry-line');
              const action = POETRY_LINE_ACTIONS.find(entry => 'poetry-' + entry.id === shortcut?.id);
              if (action) { event.preventDefault(); runPoetryLineAction(action.id, row, lineHandlers); }
            }}
            className={`group relative rounded-xl px-9 py-1 outline-none max-sm:py-3 transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-pale-sky-500 sm:px-24 ${selected ? 'bg-primary/10 ring-1 ring-primary/50' : ''}`}>
            {number && <span aria-hidden="true" data-poetry-line-number className="pointer-events-none absolute start-2 top-1/2 -translate-y-1/2 text-xs leading-none text-muted/70 tabular-nums">{number}</span>}
            {poetryRowCount(noteCounts, poem.id, row.sourceFrom, row.sourceTo) > 0 && <NoteMarker className="absolute start-1 top-0 z-10" count={poetryRowCount(noteCounts, poem.id, row.sourceFrom, row.sourceTo)} t={t} onOpen={() => passageNote('poetry:ashaar:' + poem.id + ':' + row.sourceFrom + ':' + row.sourceTo, [poem.poet_name, poem.title].filter(Boolean).join(' — ') + (number ? ' · ' + number : ''), poetryCopyText([row], poem))} />}
            <div data-poetry-line className={poetryRowLineClass(row.kind, centred)}>
              <span data-poetry-hemistich="sadr" aria-label={row.kind === 'hemistichs' ? t('bayanSadr') : undefined} className="block min-w-0 whitespace-pre-wrap break-words px-1 py-0.5" style={halfStyle}>{poetryDisplayText(row.sadr, diacritics)}</span>
              {row.ajuz !== null && <span data-poetry-hemistich="ajuz" aria-label={t('bayanAjuz')} className="block min-w-0 whitespace-pre-wrap break-words px-1 py-0.5" style={halfStyle}>{poetryDisplayText(row.ajuz, diacritics)}</span>}
            </div>
            <div role="group" aria-label={t('bayanLineActions')} data-poetry-line-actions data-open={actionsRow === row.index} className="pointer-events-none absolute end-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-subtle bg-surface-raised p-0.5 text-base leading-none opacity-0 shadow-md transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 data-[open=true]:pointer-events-auto data-[open=true]:opacity-100 max-sm:flex-col">
              {POETRY_LINE_ACTIONS.map(action => { const Icon = lineIcons[action.icon]; return <button key={action.id} type="button" tabIndex={row.index === activeRow ? 0 : -1} title={t(action.labelKey)} aria-label={t(action.labelKey)} aria-pressed={action.id === 'select' ? selected : undefined} onClick={event => { if (action.id === 'select' && event.shiftKey) selectRow(row, true); else runPoetryLineAction(action.id, row, lineHandlers); setActionsRow(null); }} className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-primary-text focus-visible:outline-2 focus-visible:outline-pale-sky-500 aria-pressed:bg-primary/15 aria-pressed:text-primary-text"><Icon size={16} aria-hidden="true" /></button>; })}
            </div>
          </ContextMenu>;
        })}
      </div>
      <div className="mt-5 flex justify-between gap-3"><button type="button" disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 100))}>{t('bayanPrevious')}</button><button type="button" disabled={offset + 100 >= rows.length} onClick={() => setOffset(value => value + 100)}>{t('bayanNext')}</button></div>
      {copied && <p role="status">{t('bayanCopied')}</p>}{failed && <p role="alert">{t('bayanUnavailable')}</p>}
      {saved && <p role="status">{t('bayanSaved')}</p>}
    </div>
  </section>;
}
