'use client';
import React, { useMemo, useState } from 'react';
import type { PoetryDetail } from '../../../shared/types/poetry';
import { poetryBayts, poetryDisplayText, poetryDescriptionText, togglePoetryPanel, type PoetryPanel } from '../../../shared/poetry';
import { useWorkspace } from '../context/WorkspaceContext';
import { EnglishPoetryNarration } from './EnglishPoetryNarration';
import { PoetryNarrations } from './PoetryNarrations';
import { SavedPoetryNotes } from './SavedPoetryNotes';
import { PoetBiography } from './PoetBiography';

export function PoetryReader({ poem, onBack, onPoet, initialVerse, initialTo }: { poem: PoetryDetail; onBack: () => void; onPoet?: (id: number) => void; initialVerse?: number; initialTo?: number }) {
  const { t, dir, lang } = useWorkspace();
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
  const saveNote = async (index: number, _sadr: string, ajuz: string | null) => {
    const from = paired ? index * 2 : index;
    await saveNative(from, from + (ajuz === null ? 0 : 1), 'note');
  };
  const [panel, setPanel] = useState<PoetryPanel>(null);
  const biographyControl = React.useRef<HTMLButtonElement>(null);
  const [font, setFont] = useState(poem.language === 'ar' ? 'Amiri' : 'EB Garamond');
  const fonts = poem.language === 'ar' ? ([['Amiri', 'bayanFontAmiri'], ['Scheherazade New', 'bayanFontScheherazade'], ['Noto Naskh Arabic', 'bayanFontNaskh']] as const) : ([['EB Garamond', 'bayanFontGaramond'], ['Lora', 'bayanFontLora']] as const);
  const description = useMemo(() => {
    try { return poetryDescriptionText(JSON.parse(poem.description_json || 'null')); } catch { return ''; }
  }, [poem.description_json]);
  const sourceButton = (url: string | null, label: 'bayanPoemSource' | 'bayanPoetSource') => url && /^https?:\/\//u.test(url) ? <button type="button" className="block max-w-full break-all text-start text-sm underline" onClick={() => { void window.electronAPI.openExternal(url).catch(() => setFailed(true)); }}>{t(label)}: {url}</button> : null;
  const rows = paired ? poetryBayts(verses) : verses.map((line, index) => ({ index, sadr: line, ajuz: null }));
  const selectedRows = selection ? rows.slice(selection[0], selection[1] + 1) : [];
  const selectedText = selectedRows.map(row => `${row.sadr}${row.ajuz === null ? '' : ` *** ${row.ajuz}`}`).join('\n');
  const saveSelection = async (type: 'note' | 'quote' | 'bookmark') => {
    if (!selection || !selectedRows.length) return;
    const from = paired ? selection[0] * 2 : selection[0];
    const to = Math.min(verses.length - 1, paired ? selection[1] * 2 + 1 : selection[1]);
    await saveNative(from, to, type);
  };
  const copy = async (sadr: string, ajuz: string | null) => {
    try {
      await navigator.clipboard.writeText(`${sadr}${ajuz === null ? '' : ` *** ${ajuz}`}\n${[poem.poet_name, poem.title, poem.meter].filter(Boolean).join(' — ')}`);
      setCopied(true); setFailed(false);
    } catch { setFailed(true); }
  };
  return <section data-poetry-id={poem.id} data-poetry-reference={initialVerse === undefined ? '' : `${initialVerse}:${initialTo ?? initialVerse}`} dir={dir} className="relative flex h-full min-h-0 flex-col bg-canvas p-4">
    <header className="flex flex-wrap items-center gap-4 border-b border-subtle pb-4">
      <button onClick={onBack} type="button">{t('bayanBack')}</button>
      <button type="button" aria-expanded={panel === 'typography'} onClick={() => setPanel(current => togglePoetryPanel(current, 'typography'))}>{t('bayanTypography')}</button>
      <button ref={biographyControl} type="button" aria-expanded={panel === 'poet'} onClick={() => setPanel(current => togglePoetryPanel(current, 'poet'))}>{t('bayanBiography')}</button>
      <button type="button" aria-expanded={panel === 'saved'} onClick={() => setPanel(current => togglePoetryPanel(current, 'saved'))}>{t('bayanSavedVerses')}</button>
      <button type="button" data-poetry-narrations-toggle aria-expanded={panel === 'narration'} onClick={() => setPanel(current => togglePoetryPanel(current, 'narration'))}>{t('bayanNarrations')}</button>
      <label><input type="checkbox" checked={diacritics} onChange={event => setDiacritics(event.target.checked)} /> {t('bayanDiacritics')}</label>
      {paired && <label><input type="checkbox" checked={justify} onChange={event => setJustify(event.target.checked)} /> {t('bayanJustify')}</label>}
    </header>
    {selection && <div role="toolbar" aria-label={t('bayanSelectVerse')} className="sticky top-0 z-10 flex flex-wrap gap-3 rounded-xl border border-subtle bg-surface p-3 shadow-lg">
      <button type="button" onClick={() => void copy(selectedText, null)}>{t('bayanCopyVerse')}</button>
      <button type="button" onClick={() => void saveSelection('note')}>{t('bayanSaveNote')}</button>
      <button type="button" onClick={() => void saveSelection('quote')}>{t('bayanSaveQuote')}</button>
      <button type="button" onClick={() => void saveSelection('bookmark')}>{t('bayanSaveBookmark')}</button>
      <label className="w-full text-sm">{t('bayanPersonalNote')}<textarea rows={2} maxLength={50000} value={personalNote} onChange={event => setPersonalNote(event.target.value)} className="block w-full rounded border border-subtle bg-canvas p-2 text-start" dir="auto" /></label>
      {poem.language === 'en' && <EnglishPoetryNarration key={selection.join(':')} sentences={selectedRows.map(row => row.sadr)} />}
    </div>}
    {panel === 'saved' && <SavedPoetryNotes />}
    <PoetryNarrations key={poem.id} poem={poem} hidden={panel !== 'narration'} />
    {panel === 'typography' && <aside aria-label={t('bayanTypography')} className="rounded-xl border border-subtle bg-surface p-4"><label>{t('bayanFont')}<select value={font} onChange={event => setFont(event.target.value)} className="mx-3 rounded border border-subtle bg-canvas p-2">{fonts.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label></aside>}
    {panel === 'poet' && <PoetBiography poem={poem} onPoet={onPoet} onClose={() => { setPanel(null); biographyControl.current?.focus(); }} />}
    <div className="min-h-0 flex-1 overflow-y-auto py-5">
      <h1 dir="auto" className="mb-2 text-center text-2xl leading-loose">{poem.title || poem.poet_name}</h1>
      <dl className="mx-auto mb-4 max-w-5xl space-y-2 rounded-xl border border-subtle p-3 text-sm">
        {([{ key: 'bayanEra', value: poem.poet_era }, { key: 'bayanMeter', value: poem.meter }, { key: 'bayanTheme', value: poem.theme }, { key: 'bayanLanguageType', value: poem.language_variant === '-' ? null : poem.language_variant }, { key: 'bayanVerseCount', value: String(poem.verse_count ?? verses.length) }] as const).map(item => item.value ? <div key={item.key} className="flex flex-wrap gap-2"><dt className="text-muted">{t(item.key)}</dt><dd dir="auto">{item.value}</dd></div> : null)}
        {poem.poet_location && <div className="flex flex-wrap gap-2"><dt className="text-muted">{t('bayanLocation')}</dt><dd dir="auto">{poem.poet_location}</dd></div>}
      </dl>
      <div className="mx-auto mb-4 max-w-5xl space-y-2">{sourceButton(poem.source_url, 'bayanPoemSource')}{sourceButton(poem.poet_url, 'bayanPoetSource')}</div>
      {description && <section className="mx-auto mb-5 max-w-5xl rounded-xl border border-subtle p-4"><h2 className="font-semibold">{t('bayanDescription')}</h2><p dir="auto" className="whitespace-pre-wrap break-words leading-loose">{description}</p></section>}
      <p dir="auto" className="mb-6 text-center text-muted"><button type="button" onClick={() => setPanel(current => togglePoetryPanel(current, 'poet'))}>{poem.poet_name}</button>{poem.meter && <> · {poem.meter}</>}</p>
      <div dir={poem.language === 'ar' ? 'rtl' : 'ltr'} style={{ fontFamily: `"Baglib Poetry ${font}", serif` }} className="mx-auto max-w-5xl space-y-4 font-serif text-xl leading-[2.5]">
        {rows.slice(offset, offset + 100).map(row => <div key={row.index} data-card-kind="poetry" data-card-ref={`poetry:${poem.id}:${row.index}`} data-card-label={[poem.poet_name, poem.title].filter(Boolean).join(' · ')} data-poetry-source-index={paired ? row.index * 2 : row.index} ref={row.index === targetRow ? targetElement : undefined} tabIndex={-1} className={`rounded-xl border bg-surface p-3 ${selection && row.index >= selection[0] && row.index <= selection[1] ? 'border-pale-sky-500 ring-1 ring-pale-sky-500/50' : 'border-subtle'}`}>
          <button type="button" aria-label={t('bayanSelectVerse')} aria-pressed={!!selection && row.index >= selection[0] && row.index <= selection[1]} onClick={event => { if (event.shiftKey) setSelection([Math.min(anchor.current, row.index), Math.max(anchor.current, row.index)]); else { anchor.current = row.index; setSelection(selection?.[0] === row.index && selection[1] === row.index ? null : [row.index, row.index]); } }} className="text-sm text-muted">{t('bayanSelectVerse')} {(row.index + 1).toLocaleString(lang)}</button>
          <div className={paired && row.ajuz !== null ? 'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3' : 'text-start'} style={justify ? { textAlign: 'justify', textAlignLast: 'justify' } : undefined}>
            <span className="min-w-0 whitespace-pre-wrap break-words" style={paired && row.ajuz === null ? { display: 'block', textAlign: 'center' } : undefined}>{poetryDisplayText(row.sadr, diacritics)}</span>
            {poem.language === 'en' && (row.index + 1) % 5 === 0 && <span className="ms-3 text-xs text-muted">{row.index + 1}</span>}
            {paired && row.ajuz !== null && <><span aria-hidden="true" className="text-xs text-muted">{(row.index + 1).toLocaleString(lang)}</span><span className="min-w-0 whitespace-pre-wrap break-words">{poetryDisplayText(row.ajuz, diacritics)}</span></>}
          </div>
          <button type="button" className="text-sm text-muted" onClick={() => void copy(row.sadr, row.ajuz)}>{t('bayanCopyVerse')}</button>
          <button type="button" className="ms-3 text-sm text-muted" onClick={() => void saveNote(row.index, row.sadr, row.ajuz)}>{t('bayanSaveNote')}</button>
        </div>)}
      </div>
      <div className="mt-5 flex justify-between gap-3"><button type="button" disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 100))}>{t('bayanPrevious')}</button><button type="button" disabled={offset + 100 >= rows.length} onClick={() => setOffset(value => value + 100)}>{t('bayanNext')}</button></div>
      {copied && <p role="status">{t('bayanCopied')}</p>}{failed && <p role="alert">{t('bayanUnavailable')}</p>}
      {saved && <p role="status">{t('bayanSaved')}</p>}
    </div>
  </section>;
}
