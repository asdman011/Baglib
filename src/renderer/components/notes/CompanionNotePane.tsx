'use client';
import { matchesShortcut } from '../actions/shortcuts';
import React, { useEffect, useId, useRef, useState } from 'react';
import { Clock, Link2, NotebookPen, Quote, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { QuickNoteScratchpad } from '../dashboard/QuickNoteScratchpad';
import { companionContext, insertIntoCompanion, onCompanionContextChange, type CompanionContext } from '../../utils/companion-context';
import { studyLinkText } from '../../../shared/study-notes';
import { clockTime } from '../../../shared/lectures';

export const STORAGE = 'baglib.companion.v1';
const PANE_WIDTH = 'min(380px, 45vw)';

export const COMPANION_MIN_TOP_PERCENT = 16;
export const COMPANION_MAX_TOP_PERCENT = 82;
export const COMPANION_DEFAULT_TOP_PERCENT = 50;
export const COMPANION_REST_WIDTH_PX = 10;
export const COMPANION_EXPANDED_WIDTH_PX = 32;

export type CompanionEdge = 'end' | 'start';

export interface Saved {
  open: boolean;
  noteId: string | null;
  stamp: boolean;
  topPercent: number;
  edge: CompanionEdge;
}

export function clampCompanionTopPercent(value: number): number {
  if (!Number.isFinite(value)) return COMPANION_DEFAULT_TOP_PERCENT;
  return Math.min(COMPANION_MAX_TOP_PERCENT, Math.max(COMPANION_MIN_TOP_PERCENT, Math.round(value)));
}

/**
 * Resolves the side-note tab edge so it never collides with the start-side navigation rail
 * or the KEY-310 nav peek trigger edge (`[data-nav-peek-trigger-edge]`).
 */
export function resolveCompanionEdge(preferredEdge: CompanionEdge, hasStartNavEdge = true): CompanionEdge {
  if (hasStartNavEdge && preferredEdge === 'start') {
    return 'end';
  }
  return preferredEdge === 'start' ? 'start' : 'end';
}

export interface BoxRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Finds a vertical position (in percentage of viewport height) where the side-note edge tip
 * does not overlap any interactive control near the active window edge.
 */
export function findNonCollidingTopPercent(
  preferredTopPercent: number,
  viewportHeight: number,
  controlBoxes: BoxRect[],
  tipHorizontalRange: { left: number; right: number },
  tipHeightPx = 32
): number {
  const base = clampCompanionTopPercent(preferredTopPercent);
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0 || controlBoxes.length === 0) {
    return base;
  }

  const candidates = [
    base,
    58,
    66,
    42,
    74,
    34,
    26,
    80,
    18,
  ].map(clampCompanionTopPercent);

  const uniqueCandidates = [...new Set(candidates)];
  const halfHeight = tipHeightPx / 2 + 4;

  const collidesAt = (percent: number): boolean => {
    const centerY = (percent / 100) * viewportHeight;
    const tipTop = centerY - halfHeight;
    const tipBottom = centerY + halfHeight;
    return controlBoxes.some(
      (box) =>
        box.right > tipHorizontalRange.left &&
        box.left < tipHorizontalRange.right &&
        box.bottom > tipTop &&
        box.top < tipBottom
    );
  };

  for (const candidate of uniqueCandidates) {
    if (!collidesAt(candidate)) {
      return candidate;
    }
  }
  return base;
}

/**
 * Checks whether a keyboard event matches the Companion Side-Note shortcut (`Ctrl+Shift+M` / `Cmd+Shift+M`).
 * Checked against all BagLib shortcuts (`Ctrl+K`, `Ctrl+B`, `Ctrl+Shift+N`, `Alt+M`, `Ctrl+F`, `Ctrl+S`, `F11`): zero collisions.
 */
export function isCompanionShortcut(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'defaultPrevented' | 'repeat'>
): boolean {
  return matchesShortcut(event, 'companion', 'reader');
}

export function readCompanionSavedState(): Saved {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) || '{}') as Partial<Saved>;
    return {
      open: value.open === true,
      noteId: typeof value.noteId === 'string' ? value.noteId : null,
      stamp: value.stamp !== false,
      topPercent: clampCompanionTopPercent(
        typeof value.topPercent === 'number' ? value.topPercent : COMPANION_DEFAULT_TOP_PERCENT
      ),
      edge: value.edge === 'start' ? 'start' : 'end',
    };
  } catch {
    return {
      open: false,
      noteId: null,
      stamp: true,
      topPercent: COMPANION_DEFAULT_TOP_PERCENT,
      edge: 'end',
    };
  }
}

export function writeCompanionSavedState(patch: Partial<Saved>): Saved {
  const current = readCompanionSavedState();
  const next: Saved = {
    open: typeof patch.open === 'boolean' ? patch.open : current.open,
    noteId: patch.noteId !== undefined ? patch.noteId : current.noteId,
    stamp: typeof patch.stamp === 'boolean' ? patch.stamp : current.stamp,
    topPercent: clampCompanionTopPercent(
      typeof patch.topPercent === 'number' ? patch.topPercent : current.topPercent
    ),
    edge: patch.edge !== undefined ? (patch.edge === 'start' ? 'start' : 'end') : current.edge,
  };
  try {
    localStorage.setItem(STORAGE, JSON.stringify(next));
    if (typeof window !== 'undefined' && typeof window.Event === 'function') {
      window.dispatchEvent(new window.Event('baglib:companion-position'));
    }
  } catch {
    /* a convenience only */
  }
  return next;
}

/** The selected text inside the main view, if any (not text selected inside the pane itself). */
function mainSelection(): string {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return '';
  const node = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
  if (node?.closest('[data-companion-pane]')) return '';
  return selection.toString().trim();
}

export interface CompanionToggleProps {
  open: boolean;
  onToggle: () => void;
  /** Whether the start edge is occupied by the navigation rail or KEY-310 nav peek strip. Defaults to true. */
  hasStartNavEdge?: boolean;
}

/**
 * Collapsible edge-tip trigger for the companion side-note pane (KEY-315 / U21).
 * - At rest: a small 10px (8–12px) edge tip with only an icon and no text.
 * - On hover or keyboard focus: slides out into a compact icon button with a tooltip.
 * - Placement: opposite the start-side navigation/peek edge (`end-0`), avoiding control collisions.
 * - Memory: remembers its vertical position (`topPercent`) and edge in `baglib.companion.v1`.
 */
export function CompanionToggle({ open, onToggle, hasStartNavEdge = true }: CompanionToggleProps) {
  const { t, dir } = useWorkspace();
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragMovedRef = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [position, setPosition] = useState<{ topPercent: number; edge: CompanionEdge }>(() => {
    const initial = readCompanionSavedState();
    return { topPercent: initial.topPercent, edge: initial.edge };
  });
  const [safeTopPercent, setSafeTopPercent] = useState<number | null>(null);

  const effectiveEdge = resolveCompanionEdge(position.edge, hasStartNavEdge);
  const effectiveTopPercent = safeTopPercent ?? clampCompanionTopPercent(position.topPercent);
  const expanded = hovered || focused;

  useEffect(() => {
    const sync = () => {
      const synced = readCompanionSavedState();
      setPosition({ topPercent: synced.topPercent, edge: synced.edge });
    };
    window.addEventListener('baglib:companion-position', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('baglib:companion-position', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Listen for keyboard shortcut when mounted standalone or if not already handled by AppLayout
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isCompanionShortcut(event)) {
        event.preventDefault();
        onToggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onToggle]);

  // Check for interactive control collisions at the window edge on mount and resize
  useEffect(() => {
    if (open || typeof window === 'undefined' || typeof document === 'undefined') return;

    const checkCollision = () => {
      const vh = window.innerHeight || 800;
      const vw = window.innerWidth || 1280;
      const isEndOnLeft = (dir === 'rtl' && effectiveEdge === 'end') || (dir !== 'rtl' && effectiveEdge === 'start');
      const edgeCheckWidth = COMPANION_EXPANDED_WIDTH_PX + 12;
      const tipRange = isEndOnLeft
        ? { left: 0, right: edgeCheckWidth }
        : { left: Math.max(0, vw - edgeCheckWidth), right: vw };

      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          'button, a, input, select, textarea, [role="button"], [role="tab"], [role="dialog"]'
        )
      ).filter(
        (el) =>
          el !== buttonRef.current &&
          !el.hasAttribute('data-companion-toggle') &&
          !el.hasAttribute('data-nav-peek-trigger-edge')
      );

      const boxes: BoxRect[] = [];
      for (const el of controls) {
        if (typeof el.getBoundingClientRect !== 'function') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (el.getAttribute('role') === 'dialog' && rect.top <= 64 && rect.bottom >= vh - 32) continue;
        boxes.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
      }

      const resolved = findNonCollidingTopPercent(position.topPercent, vh, boxes, tipRange, 32);
      setSafeTopPercent(resolved === position.topPercent ? null : resolved);
    };

    checkCollision();
    const timer = setTimeout(checkCollision, 120);
    let rafId = 0;
    const scheduleCheck = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(checkCollision);
    };
    window.addEventListener('resize', scheduleCheck);
    const observer =
      typeof MutationObserver === 'function'
        ? new MutationObserver(scheduleCheck)
        : null;
    observer?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open'] });
    return () => {
      clearTimeout(timer);
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleCheck);
      observer?.disconnect();
    };
  }, [open, dir, effectiveEdge, position.topPercent]);

  if (open) return null;

  const updatePosition = (patch: Partial<{ topPercent: number; edge: CompanionEdge }>) => {
    const saved = writeCompanionSavedState(patch);
    setPosition({ topPercent: saved.topPercent, edge: saved.edge });
    setSafeTopPercent(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && expanded) {
      event.stopPropagation();
      setHovered(false);
      setFocused(false);
      event.currentTarget.blur();
      return;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const delta = event.key === 'ArrowUp' ? -5 : 5;
      updatePosition({ topPercent: clampCompanionTopPercent(effectiveTopPercent + delta) });
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const startY = event.clientY;
    dragMovedRef.current = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (Math.abs(moveEvent.clientY - startY) > 6) {
        dragMovedRef.current = true;
        const vh = window.innerHeight || 800;
        const nextPercent = clampCompanionTopPercent((moveEvent.clientY / vh) * 100);
        updatePosition({ topPercent: nextPercent });
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleClick = () => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    onToggle();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-companion-toggle
        data-state={expanded ? 'expanded' : 'rest'}
        data-edge={effectiveEdge}
        data-top-percent={effectiveTopPercent}
        aria-label={t('companionOpen')}
        aria-expanded={open}
        aria-describedby={expanded ? tooltipId : undefined}
        aria-keyshortcuts="Control+Shift+M Meta+Shift+M"
        title={t('companionOpen')}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        style={{
          top: `${effectiveTopPercent}%`,
          width: expanded ? `${COMPANION_EXPANDED_WIDTH_PX}px` : `${COMPANION_REST_WIDTH_PX}px`,
          height: expanded ? '34px' : '32px',
        }}
        className={`fixed ${
          effectiveEdge === 'end'
            ? 'end-0 rounded-s-lg border-e-0'
            : 'start-0 rounded-e-lg border-s-0'
        } z-[60] -translate-y-1/2 flex items-center justify-center overflow-hidden border border-border bg-surface/95 text-primary-text shadow-sm transition-[width,height,background-color,box-shadow] duration-150 ease-out motion-reduce:transition-none hover:bg-surface-raised hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
      >
        <NotebookPen
          size={expanded ? 14 : 10}
          data-companion-tip-icon
          aria-hidden="true"
          className="shrink-0 text-primary-text pointer-events-none"
        />
      </button>
      {expanded && (
        <span
          id={tooltipId}
          role="tooltip"
          data-companion-tooltip
          style={{ top: `${effectiveTopPercent}%` }}
          className={`fixed ${
            effectiveEdge === 'end' ? 'end-9' : 'start-9'
          } z-[60] -translate-y-1/2 pointer-events-none rounded-md border border-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-main shadow-md whitespace-nowrap`}
        >
          {t('companionOpen')}
        </span>
      )}
    </>
  );
}

/**
 * A note that stays open beside the reader, Quran, Sunnah, poetry and lectures while you move between them
 * (decision S10). It can take the selected text with a link back to where it was read, a link to the current
 * place, and, during a lecture, start each new line with the playback time.
 */
export function CompanionNotePane({ onClose, overlay = false }: { onClose: () => void; overlay?: boolean }) {
  const { t, viewMode } = useWorkspace();
  const { notes } = useStudyNotes();
  const [state, setState] = useState<Saved>(readCompanionSavedState);
  const [context, setContext] = useState<CompanionContext | null>(() => companionContext(viewMode));
  useEffect(() => {
    const refresh = () => setContext(companionContext(viewMode));
    // The view on screen may have registered before this pane subscribed; read it once, after this render.
    const frame = requestAnimationFrame(refresh);
    const off = onCompanionContextChange(refresh);
    return () => { cancelAnimationFrame(frame); off(); };
  }, [viewMode]);
  // A lecture's place moves with playback; keep the shown time current.
  useEffect(() => {
    if (context?.kind !== 'lecture') return;
    const timer = setInterval(() => setContext(companionContext(viewMode)), 1000);
    return () => clearInterval(timer);
  }, [context?.kind, viewMode]);
  const update = (next: Partial<Saved>) => setState(previous => writeCompanionSavedState({ ...previous, ...next }));
  const note = state.noteId ? notes.find(item => item.id === state.noteId) : undefined;
  // Read the place at the moment of use, from the view on screen: a lecture's time moves on while the pane stays open.
  const here = () => companionContext(viewMode);
  const linkHere = () => { const place = here(); if (place) insertIntoCompanion(`${studyLinkText(place.target, place.label)} `); };
  const sendSelection = () => {
    const text = mainSelection();
    const place = here();
    if (!text) return;
    const quote = text.split(/\r?\n/u).map(line => `> ${line}`).join('\n');
    insertIntoCompanion(`${quote}${place ? ` ${studyLinkText(place.target, place.label)}` : ''}\n\n`);
  };
  const lecture = context?.kind === 'lecture';
  const lineStamp = () => {
    if (!state.stamp) return null;
    const place = companionContext(viewMode);
    if (!place || place.kind !== 'lecture') return null;
    const seconds = Number(place.target.split(':')[2]) || 0;
    return `${studyLinkText(place.target, clockTime(seconds))} `;
  };
  // Over the full-window book reader the pane is fixed at the end edge, and the reader narrows by its width.
  useEffect(() => {
    if (!overlay) return;
    document.documentElement.style.setProperty('--companion-width', PANE_WIDTH);
    return () => { document.documentElement.style.removeProperty('--companion-width'); };
  }, [overlay]);
  return <aside data-companion-pane aria-label={t('companionTitle')} style={{ width: PANE_WIDTH }} className={`shrink-0 border-s border-subtle bg-canvas flex flex-col min-h-0 ${overlay ? 'fixed inset-y-0 end-0 z-[60] shadow-2xl' : ''}`}>
    <header className="flex items-center gap-2 border-b border-subtle px-3 py-2">
      <NotebookPen size={16} aria-hidden="true" className="text-primary-text" />
      <h2 className="text-sm font-bold">{t('companionTitle')}</h2>
      <button type="button" aria-label={t('companionClose')} title={t('companionClose')} onClick={onClose} className="ms-auto rounded p-1 hover:bg-surface"><X size={16} /></button>
    </header>
    <div className="space-y-2 border-b border-subtle px-3 py-2 text-xs">
      <label className="flex items-center gap-2">
        <span className="shrink-0 text-muted">{t('companionNote')}</span>
        <select data-companion-note aria-label={t('companionNote')} value={state.noteId ?? ''} onChange={event => update({ noteId: event.target.value || null })} className="min-w-0 flex-1 rounded border border-subtle bg-surface px-2 py-1">
          <option value="">{t('companionNewNote')}</option>
          {notes.map(item => <option key={item.id} value={item.id}>{item.title || item.content.slice(0, 60)}</option>)}
        </select>
      </label>
      <p data-companion-place className="truncate text-muted" dir="auto">{context ? `${t('companionHere')}: ${context.label}` : t('companionNoPlace')}</p>
      <div className="flex flex-wrap gap-2">
        {/* mousedown is prevented so the selection in the reader is still there when the click arrives */}
        <button type="button" data-companion-quote onMouseDown={event => event.preventDefault()} onClick={sendSelection} className="inline-flex items-center gap-1 rounded border border-subtle px-2 py-1 hover:bg-surface"><Quote size={12} aria-hidden="true" />{t('companionQuote')}</button>
        <button type="button" data-companion-link disabled={!context} onMouseDown={event => event.preventDefault()} onClick={linkHere} className="inline-flex items-center gap-1 rounded border border-subtle px-2 py-1 hover:bg-surface disabled:opacity-40"><Link2 size={12} aria-hidden="true" />{t('companionLinkHere')}</button>
      </div>
      {lecture && <label className="flex items-center gap-2"><input type="checkbox" data-companion-stamp checked={state.stamp} onChange={event => update({ stamp: event.target.checked })} /><Clock size={12} aria-hidden="true" />{t('companionStamp')}</label>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <QuickNoteScratchpad
        // Remount when the note or its revision changes, so the next save uses the current revision.
        key={`${state.noteId ?? 'draft'}:${note?.revision ?? 'none'}`}
        initialNote={note}
        draftKey="companion.draft.v1"
        companion
        lineStamp={lecture ? lineStamp : undefined}
        onSaved={saved => { if (saved) update({ noteId: saved.id }); }}
      />
    </div>
  </aside>;
}

export function useCompanionPane() {
  const [open, setOpen] = useState(() => readCompanionSavedState().open);
  const set = (value: boolean) => { setOpen(value); writeCompanionSavedState({ open: value }); };
  return { open, toggle: () => set(!open), close: () => set(false) };
}
