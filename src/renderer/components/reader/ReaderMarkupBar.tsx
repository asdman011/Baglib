'use client';
import React from 'react';
import { Highlighter, Keyboard, Lock, LockOpen } from 'lucide-react';
import type { TranslationKey } from '../../translations';
import { HIGHLIGHT_COLORS } from '../../libs/reader/highlight-manager';

const colorKeys: Record<string, TranslationKey> = {
  amber: 'markupColorAmber', emerald: 'markupColorEmerald', rose: 'markupColorRose', sky: 'markupColorSky', violet: 'markupColorViolet',
};

/** Compact markup bar: highlight colour, keep-highlighter-on lock and the shortcut sheet. */
export function ReaderMarkupBar({ color, onColor, locked, onToggleLock, onShowShortcuts, t }: {
  color: string;
  onColor: (color: string) => void;
  locked: boolean;
  onToggleLock: () => void;
  onShowShortcuts: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  return <div role="toolbar" aria-label={t('markupBarLabel')} data-reader-markup-bar className="flex shrink-0 items-center gap-1 rounded-lg border border-subtle bg-surface px-1.5 py-1">
    <Highlighter size={14} aria-hidden="true" className="text-muted" />
    <span className="hidden md:contents">{HIGHLIGHT_COLORS.map((swatch, index) => <button
      key={swatch.id}
      type="button"
      data-markup-color={swatch.id}
      aria-pressed={color === swatch.id}
      aria-label={t('markupColorButton', { color: t(colorKeys[swatch.id]), key: index + 1 })}
      title={t('markupColorButton', { color: t(colorKeys[swatch.id]), key: index + 1 })}
      onClick={() => onColor(swatch.id)}
      className={`size-4 rounded-full border border-black/10 ${color === swatch.id ? 'ring-2 ring-offset-1 ring-emerald-500 ring-offset-transparent' : ''}`}
      style={{ backgroundColor: swatch.hex }}
    />)}</span>
    <span className="md:hidden size-4 rounded-full border border-black/10" aria-hidden="true" style={{ backgroundColor: HIGHLIGHT_COLORS.find(swatch => swatch.id === color)?.hex }} />
    <span className="mx-0.5 h-4 w-px bg-subtle" aria-hidden="true" />
    <button
      type="button"
      data-markup-lock
      aria-pressed={locked}
      aria-label={t(locked ? 'markupLockOn' : 'markupLockOff')}
      title={t(locked ? 'markupLockOn' : 'markupLockOff')}
      onClick={onToggleLock}
      className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${locked ? 'bg-emerald-600 text-white' : 'text-main hover:bg-canvas'}`}
    >
      {locked ? <Lock size={12} aria-hidden="true" /> : <LockOpen size={12} aria-hidden="true" />}
      <span className="hidden xl:inline">{t('markupKeepOn')}</span>
    </button>
    <button type="button" data-reader-shortcuts-button aria-label={t('readerShortcutsTitle')} title={t('readerShortcutsTitle')} onClick={onShowShortcuts} className="rounded-md p-1 text-muted hover:text-main hover:bg-canvas">
      <Keyboard size={13} aria-hidden="true" />
    </button>
  </div>;
}

const rows: { keys: string; label: TranslationKey }[] = [
  { keys: 'H', label: 'shortcutHighlighter' },
  { keys: '1 – 5', label: 'shortcutColors' },
  { keys: 'Esc', label: 'shortcutStop' },
  { keys: 'Ctrl + F', label: 'shortcutFind' },
  { keys: 'Ctrl + S', label: 'shortcutSave' },
  { keys: 'F11', label: 'shortcutPageOnly' },
  { keys: '?', label: 'shortcutSheet' },
];

export function ReaderShortcutSheet({ onClose, t }: { onClose: () => void; t: (key: TranslationKey) => string }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby="reader-shortcuts-title" data-reader-shortcuts className="w-full max-w-sm rounded-2xl border border-subtle bg-surface p-4 text-main shadow-2xl" onClick={event => event.stopPropagation()}>
      <h2 id="reader-shortcuts-title" className="mb-3 text-sm font-bold">{t('readerShortcutsTitle')}</h2>
      <dl className="space-y-2 text-xs leading-relaxed">
        {rows.map(row => <div key={row.keys} className="flex items-center justify-between gap-3">
          <dt className="text-muted">{t(row.label)}</dt>
          <dd><kbd dir="ltr" className="rounded border border-subtle bg-canvas px-1.5 py-0.5 font-mono text-[11px]">{row.keys}</kbd></dd>
        </div>)}
      </dl>
      <button type="button" autoFocus onClick={onClose} className="mt-4 w-full rounded-lg border border-subtle py-1.5 text-xs font-semibold hover:bg-canvas">{t('close')}</button>
    </div>
  </div>;
}
