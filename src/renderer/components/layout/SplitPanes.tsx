'use client';

/**
 * KEY-425 (WS-9): two tabs side by side with a resizable divider.
 *
 * - The first pane holds the focused tab and the second the split tab. In Arabic the first pane is on the right.
 * - Drag the divider, or focus it and use the arrow keys (Shift for bigger steps, Home/End for the limits);
 *   a double-click puts it back in the middle.
 * - The pane the user clicks or tabs into becomes the focused pane, which receives keyboard shortcuts and open
 *   requests; the workspace learns about it through `onFocusPane`.
 * - Presentational: it gets the two screens and reports what the user does. When `second` is absent it renders
 *   the first pane alone.
 */
import React from 'react';
import { X } from 'lucide-react';
import type { TranslationKey } from '../../translations';
import { DEFAULT_SPLIT_RATIO, clampRatio, ratioFromKey, ratioFromPointer } from './split-model';

export type PaneId = 'first' | 'second';

export interface SplitPanesProps {
  dir: 'rtl' | 'ltr';
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
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
  const [dragging, setDragging] = React.useState(false);

  const setRatio = (next: number) => {
    const value = clampRatio(next);
    if (ratio === undefined) setOwnRatio(value);
    onRatioChange?.(value);
  };

  const fromPointer = (x: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (rect) setRatio(ratioFromPointer(x, { left: rect.left, width: rect.width }, dir));
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
      {id === 'second' && (
        <button
          type="button"
          data-split-close
          onClick={onCloseSplit}
          aria-label={t('workspaceSplitClose')}
          title={t('workspaceSplitClose')}
          className="absolute top-1 z-10 rounded-md p-1 text-muted transition-colors hover:bg-canvas hover:text-main focus-visible:outline-2 focus-visible:outline-focus [inset-inline-end:0.25rem]"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      {content}
    </section>
  );

  const percent = Math.round(current * 100);

  return (
    <div ref={boxRef} dir={dir} data-split-panes="two" className={`flex min-h-0 min-w-0 flex-1 gap-0 ${dragging ? 'select-none' : ''}`}>
      {pane('first', first, current)}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('workspaceSplitDivider')}
        aria-valuemin={20}
        aria-valuemax={80}
        aria-valuenow={percent}
        tabIndex={0}
        data-split-divider
        data-dragging={dragging ? '' : undefined}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          setDragging(true);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={event => { if (dragging) fromPointer(event.clientX); }}
        onPointerUp={event => { setDragging(false); event.currentTarget.releasePointerCapture?.(event.pointerId); }}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => setRatio(DEFAULT_SPLIT_RATIO)}
        onKeyDown={event => {
          const next = ratioFromKey(current, event.key, dir, event.shiftKey);
          if (next === null) return;
          event.preventDefault();
          setRatio(next);
        }}
        className="group relative w-2 shrink-0 cursor-col-resize touch-none focus-visible:outline-none"
      >
        <span className={`absolute inset-x-0 inset-y-2 mx-auto w-px rounded-full transition-colors ${dragging ? 'bg-primary' : 'bg-subtle group-hover:bg-primary/60 group-focus-visible:bg-primary'}`} />
      </div>
      {pane('second', second, 1 - current)}
    </div>
  );
};
