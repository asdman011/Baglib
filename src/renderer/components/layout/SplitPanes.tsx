'use client';

/**
 * KEY-425 (WS-9): two tabs side by side with a resizable divider.
 *
 * - `SplitDivider` is the divider the workspace uses between two kept-alive tab panels (TabKeepAlive). Drag it,
 *   or focus it and use the arrow keys (Shift for bigger steps, Home/End for the limits); a double-click puts it
 *   back in the middle. Its × ends side by side.
 * - `SplitPanes` lays out two given screens with that divider, for places that own both screens.
 * - In Arabic the first pane is on the right.
 */
import React from 'react';
import { X } from 'lucide-react';
import type { TranslationKey } from '../../translations';
import { DEFAULT_SPLIT_RATIO, clampRatio, ratioFromKey, ratioFromPointer } from './split-model';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

export interface SplitDividerProps {
  dir: 'rtl' | 'ltr';
  t: Translate;
  /** The first pane's share of the width. */
  ratio: number;
  /** The row the divider sits in, to turn the pointer position into a ratio. */
  boxRef: React.RefObject<HTMLElement | null>;
  onRatioChange: (ratio: number) => void;
  onClose: () => void;
  style?: React.CSSProperties;
}

export const SplitDivider: React.FC<SplitDividerProps> = ({ dir, t, ratio, boxRef, onRatioChange, onClose, style }) => {
  const [dragging, setDragging] = React.useState(false);
  const draggingRef = React.useRef(false);
  const current = clampRatio(ratio);
  const fromPointer = React.useCallback((x: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (rect) onRatioChange(ratioFromPointer(x, { left: rect.left, width: rect.width }, dir));
  }, [boxRef, dir, onRatioChange]);
  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => fromPointer(event.clientX);
    const onUp = () => { draggingRef.current = false; setDragging(false); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, fromPointer]);
  return (
    <div className="relative flex w-2 shrink-0 flex-col items-center" style={style} data-split-divider-wrap>
      <button
        type="button"
        data-split-close
        onClick={onClose}
        aria-label={t('workspaceSplitClose')}
        title={t('workspaceSplitClose')}
        className="absolute top-1 z-10 rounded-md bg-surface p-0.5 text-muted shadow-sm transition-colors hover:bg-canvas hover:text-main focus-visible:outline-2 focus-visible:outline-focus"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('workspaceSplitDivider')}
        aria-valuemin={20}
        aria-valuemax={80}
        aria-valuenow={Math.round(current * 100)}
        tabIndex={0}
        data-split-divider
        data-dragging={dragging ? '' : undefined}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          draggingRef.current = true;
          setDragging(true);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={event => { if (draggingRef.current) fromPointer(event.clientX); }}
        onPointerUp={event => { draggingRef.current = false; setDragging(false); event.currentTarget.releasePointerCapture?.(event.pointerId); }}
        onPointerCancel={() => { draggingRef.current = false; setDragging(false); }}
        onDoubleClick={() => onRatioChange(DEFAULT_SPLIT_RATIO)}
        onKeyDown={event => {
          const next = ratioFromKey(current, event.key, dir, event.shiftKey);
          if (next === null) return;
          event.preventDefault();
          onRatioChange(next);
        }}
        className="group relative w-2 flex-1 cursor-col-resize touch-none focus-visible:outline-none"
      >
        <span className={`absolute inset-x-0 inset-y-2 mx-auto w-px rounded-full transition-colors ${dragging ? 'bg-primary' : 'bg-subtle group-hover:bg-primary/60 group-focus-visible:bg-primary'}`} />
      </div>
    </div>
  );
};

export type PaneId = 'first' | 'second';

export interface SplitPanesProps {
  dir: 'rtl' | 'ltr';
  t: Translate;
  first: React.ReactNode;
  second?: React.ReactNode;
  /** The pane that receives shortcuts and open requests. */
  focusedPane: PaneId;
  onFocusPane: (pane: PaneId) => void;
  /** Ends side by side; the second tab stays open as a normal tab. */
  onCloseSplit: () => void;
  /** The first pane's share of the width; uncontrolled (starting at half) when omitted. */
  ratio?: number;
  onRatioChange?: (ratio: number) => void;
}

export const SplitPanes: React.FC<SplitPanesProps> = ({ dir, t, first, second, focusedPane, onFocusPane, onCloseSplit, ratio, onRatioChange }) => {
  const [ownRatio, setOwnRatio] = React.useState(DEFAULT_SPLIT_RATIO);
  const current = clampRatio(ratio ?? ownRatio);
  const boxRef = React.useRef<HTMLDivElement>(null);

  const setRatio = (next: number) => {
    const value = clampRatio(next);
    if (ratio === undefined) setOwnRatio(value);
    onRatioChange?.(value);
  };

  if (second === undefined) {
    return <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-split-panes="single">{first}</div>;
  }

  const pane = (id: PaneId, content: React.ReactNode, share: number) => (
    <section
      data-split-pane={id}
      data-focused={focusedPane === id ? '' : undefined}
      onPointerDownCapture={() => { if (focusedPane !== id) onFocusPane(id); }}
      onFocusCapture={() => { if (focusedPane !== id) onFocusPane(id); }}
      style={{ flexBasis: `${share * 100}%` }}
      className={[
        'relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg',
        focusedPane === id ? 'ring-1 ring-primary/40' : 'ring-1 ring-transparent',
      ].join(' ')}
    >
      {content}
    </section>
  );

  return (
    <div ref={boxRef} dir={dir} data-split-panes="two" className="flex min-h-0 min-w-0 flex-1 gap-0">
      {pane('first', first, current)}
      <SplitDivider dir={dir} t={t} ratio={current} boxRef={boxRef} onRatioChange={setRatio} onClose={onCloseSplit} />
      {pane('second', second, 1 - current)}
    </div>
  );
};
