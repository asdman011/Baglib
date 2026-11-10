'use client';
import { SHORTCUTS, matchesShortcut, shortcutHint } from '../actions/shortcuts';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Stamp, Ruler, ChevronDown, Circle, Palette, Highlighter, Keyboard, Lock, LockOpen, MessageSquarePlus, MousePointer2, MoveUpRight, Square, SquareDashed, Strikethrough, Type, Underline } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { isShapeTool, type MarkupTool } from '../../../shared/pdf-markup';
import type { TranslationKey } from '../../translations';
import { HIGHLIGHT_COLORS } from '../../libs/reader/highlight-manager';

export const colorKeys: Record<string, TranslationKey> = {
  amber: 'markupColorAmber', emerald: 'markupColorEmerald', rose: 'markupColorRose', sky: 'markupColorSky', violet: 'markupColorViolet',
};

const tools: { id: MarkupTool; icon: typeof Highlighter; label: TranslationKey }[] = [
  { id: 'select', icon: MousePointer2, label: 'markupToolSelect' },
  { id: 'highlight', icon: Highlighter, label: 'markupToolHighlight' },
  { id: 'underline', icon: Underline, label: 'markupToolUnderline' },
  { id: 'strike', icon: Strikethrough, label: 'markupToolStrike' },
  { id: 'comment', icon: MessageSquarePlus, label: 'markupToolComment' },
  { id: 'rect', icon: Square, label: 'markupToolRect' },
  { id: 'oval', icon: Circle, label: 'markupToolOval' },
  { id: 'arrow', icon: MoveUpRight, label: 'markupToolArrow' },
  { id: 'text', icon: Type, label: 'markupToolText' },
  { id: 'area', icon: SquareDashed, label: 'markupToolArea' },
  { id: 'stamp', icon: Stamp, label: 'markupToolStamp' },
  { id: 'measure', icon: Ruler, label: 'markupToolMeasure' },
];
const COMPACT: MarkupTool[] = ['select', 'highlight', 'underline', 'strike', 'comment'];

/**
 * True when the header around the bar has no room for it: the bar then shows only the current tool and a palette
 * button whose popover holds every tool, the colours, the lock and the shortcut sheet.
 */
export const MarkupBarCompact = createContext(false);

/**
 * The markup bar (Wave 8.3): tool modes in Acrobat's compact and expanded layouts, the colour, a lock that keeps
 * the tool armed after one use, and the shortcut sheet. The last drawing tool used stays visible when compact.
 */
export function ReaderMarkupBar({ color, onColor, locked, onToggleLock, onShowShortcuts, tool = 'select', onTool, allowedTools, t }: {
  color: string;
  onColor: (color: string) => void;
  locked: boolean;
  onToggleLock: () => void;
  onShowShortcuts: () => void;
  tool?: MarkupTool;
  onTool?: (tool: MarkupTool) => void;
  allowedTools?: readonly MarkupTool[];
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reveal = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, 'reader-toolbar', 'reader')) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      event.preventDefault();
      barRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    };
    window.addEventListener('keydown', reveal);
    return () => window.removeEventListener('keydown', reveal);
  }, []);
  const [expanded, setExpanded] = useState(false);
  const [lastShape, setLastShape] = useState<MarkupTool>('rect');
  const availableTools = allowedTools ? tools.filter(entry => allowedTools.includes(entry.id)) : tools;
  const shown = availableTools.filter(entry => expanded || COMPACT.includes(entry.id) || entry.id === (isShapeTool(tool) && tool !== 'comment' ? tool : lastShape));
  const choose = (id: MarkupTool) => { if (isShapeTool(id) && id !== 'comment') setLastShape(id); onTool?.(id); };
  const compact = useContext(MarkupBarCompact);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    if (!paletteOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPaletteOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [paletteOpen]);
  const swatches = HIGHLIGHT_COLORS.map((swatch, index) => <button
    key={swatch.id}
    type="button"
    data-markup-color={swatch.id}
    aria-pressed={color === swatch.id}
    aria-label={t('markupColorButton', { color: t(colorKeys[swatch.id]), key: index + 1 })}
    title={t('markupColorButton', { color: t(colorKeys[swatch.id]), key: index + 1 })}
    onClick={() => onColor(swatch.id)}
    className={`size-4 shrink-0 rounded-full border border-black/10 ${color === swatch.id ? 'ring-2 ring-offset-1 ring-emerald-500 ring-offset-transparent' : ''}`}
    style={{ backgroundColor: swatch.hex }}
  />);
  const lockButton = <button
    type="button"
    data-markup-lock
    aria-pressed={locked}
    aria-label={t(locked ? 'markupLockOn' : 'markupLockOff')}
    title={t(locked ? 'markupLockOn' : 'markupLockOff')}
    onClick={onToggleLock}
    className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${locked ? 'bg-emerald-600 text-white' : 'text-main hover:bg-canvas'}`}
  >
    {locked ? <Lock size={12} aria-hidden="true" /> : <LockOpen size={12} aria-hidden="true" />}
    <span className={compact ? undefined : 'hidden xl:inline'}>{t('markupKeepOn')}</span>
  </button>;
  const shortcutsButton = <button type="button" data-reader-shortcuts-button aria-label={t('readerShortcutsTitle')} title={t('readerShortcutsTitle')} onClick={() => { setPaletteOpen(false); onShowShortcuts(); }} className="flex items-center gap-1 rounded-md p-1 text-muted hover:text-main hover:bg-canvas">
    <Keyboard size={13} aria-hidden="true" />{compact && <span className="text-[11px]">{t('readerShortcutsTitle')}</span>}
  </button>;
  const toolButton = (entry: typeof tools[number], withLabel = false) => {
    const Icon = entry.icon;
    const properties = {
      'data-markup-tool-button': entry.id,
      'aria-pressed': tool === entry.id,
      onClick: () => { choose(entry.id); setPaletteOpen(false); },
      className: tool === entry.id ? 'bg-primary/15 text-primary-text' : 'text-text hover:bg-canvas',
    };
    const icon = <Icon size={14} aria-hidden="true" className={entry.id === 'arrow' ? 'shrink-0 rtl:-scale-x-100' : 'shrink-0'} />;
    return withLabel
      ? <Button key={entry.id} {...properties} variant="ghost" size="sm" aria-label={t(entry.label)} title={t(entry.label)} className={properties.className + ' w-full h-auto min-h-8 justify-start px-2 py-1.5 text-start'} icon={icon}>{t(entry.label)}</Button>
      : <IconButton key={entry.id} {...properties} size="sm" label={t(entry.label)}>{icon}</IconButton>;
  };
  if (compact && onTool) {
    const current = availableTools.find(entry => entry.id === tool) ?? availableTools[0];
    return <div ref={barRef} role="toolbar" aria-keyshortcuts="Alt+M" aria-label={t('markupBarLabel')} data-reader-markup-bar data-markup-compact data-markup-tool={tool} className="relative flex shrink-0 items-center gap-1 rounded-lg border border-subtle bg-surface px-1 py-1">
      {toolButton(current)}
      <button type="button" data-markup-palette aria-haspopup="dialog" aria-expanded={paletteOpen} aria-label={t('markupPalette')} title={t('markupPalette')} onClick={() => setPaletteOpen(value => !value)} className="flex items-center gap-0.5 rounded-md p-0.5 text-main hover:bg-canvas">
        <span className="size-3.5 rounded-full border border-black/10" aria-hidden="true" style={{ backgroundColor: HIGHLIGHT_COLORS.find(swatch => swatch.id === color)?.hex }} />
        <Palette size={13} aria-hidden="true" />
      </button>
      {paletteOpen && <>
        <div className="fixed inset-0 z-40" onClick={() => setPaletteOpen(false)} />
        <div role="dialog" aria-label={t('markupPalette')} data-markup-palette-panel className="absolute start-0 top-full z-[70] mt-2 w-72 max-w-[calc(100vw-1rem)] space-y-2 rounded-xl border border-subtle bg-surface p-2 text-main shadow-2xl">
          <div className="grid grid-cols-2 gap-0.5">{availableTools.map(entry => toolButton(entry, true))}</div>
          <div className="flex items-center gap-2 border-t border-subtle px-1 pt-2">{swatches}</div>
          <div className="flex items-center justify-between gap-1 border-t border-subtle pt-2">{lockButton}{shortcutsButton}</div>
        </div>
      </>}
    </div>;
  }
  return <div ref={barRef} role="toolbar" aria-keyshortcuts="Alt+M" aria-label={t('markupBarLabel')} data-reader-markup-bar data-markup-tool={tool} className="flex shrink-0 items-center gap-1 rounded-lg border border-subtle bg-surface px-1.5 py-1">
    {onTool ? <span className="flex items-center gap-0.5">
      {shown.map(entry => toolButton(entry))}
      {availableTools.length > COMPACT.length && <button type="button" data-markup-more aria-expanded={expanded} aria-label={t('markupMoreTools')} title={t('markupMoreTools')} onClick={() => setExpanded(value => !value)} className="rounded-md p-0.5 text-muted hover:bg-canvas"><ChevronDown size={12} className={expanded ? 'rotate-180' : undefined} /></button>}
      <span className="mx-0.5 h-4 w-px bg-subtle" aria-hidden="true" />
    </span> : <Highlighter size={14} aria-hidden="true" className="text-muted" />}
    <span className="contents">{swatches}</span>
    <span className="mx-0.5 h-4 w-px bg-subtle" aria-hidden="true" />
    {lockButton}
    {shortcutsButton}
  </div>;
}

const rows = SHORTCUTS.map(shortcut => ({ id: shortcut.id, keys: shortcutHint(shortcut.id), label: shortcut.labelKey }));

export function ReaderShortcutSheet({ onClose, t }: { onClose: () => void; t: (key: TranslationKey) => string }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby="reader-shortcuts-title" data-reader-shortcuts className="w-full max-w-sm rounded-2xl border border-subtle bg-surface p-4 text-main shadow-2xl" onClick={event => event.stopPropagation()}>
      <h2 id="reader-shortcuts-title" className="mb-3 text-sm font-bold">{t('readerShortcutsTitle')}</h2>
      <dl className="space-y-2 text-xs leading-relaxed">
        {rows.map(row => <div key={row.id} className="flex items-center justify-between gap-3">
          <dt className="text-muted">{t(row.label)}</dt>
          <dd><kbd dir="ltr" className="rounded border border-subtle bg-canvas px-1.5 py-0.5 font-mono text-[11px]">{row.keys}</kbd></dd>
        </div>)}
      </dl>
      <button type="button" autoFocus onClick={onClose} className="mt-4 w-full rounded-lg border border-subtle py-1.5 text-xs font-semibold hover:bg-canvas">{t('close')}</button>
    </div>
  </div>;
}
