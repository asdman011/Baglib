import React from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import type { AlignMode } from '../../../shared/board-selection';
import type { EdgeShape } from '../../../shared/board-edge-path';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button, IconButton } from '../ui/Button';

const alignmentKeys = {
  start: 'boardsAlignStart', centre: 'boardsAlignCentre', end: 'boardsAlignEnd',
  top: 'boardsAlignTop', middle: 'boardsAlignMiddle', bottom: 'boardsAlignBottom',
} as const;

export function BoardTools({
  undoAvailable, redoAvailable, snapping, mindMap, empty, edgeShape, busy, selectedCount,
  onUndo, onRedo, onToggleSnap, onLayout, onShape, onExport, onToNote, onAlign, onDuplicate,
}: {
  undoAvailable: boolean;
  redoAvailable: boolean;
  snapping: boolean;
  mindMap: boolean;
  empty: boolean;
  edgeShape: EdgeShape;
  busy: boolean;
  selectedCount: number;
  onUndo: () => void;
  onRedo: () => void;
  onToggleSnap: () => void;
  onLayout: () => void;
  onShape: (shape: EdgeShape) => void;
  onExport: (format: 'svg' | 'png') => void;
  onToNote: () => void;
  onAlign: (mode: AlignMode) => void;
  onDuplicate: () => void;
}) {
  const { t, dir } = useWorkspace();
  const selectClass = 'min-w-0 rounded border border-subtle bg-canvas p-1 text-xs';
  return (
    <div data-board-tools dir={dir} className="flex h-11 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-subtle bg-surface px-3 py-1.5 [&>*]:shrink-0">
      <IconButton size="sm" data-board-undo label={t('boardsUndo')} disabled={!undoAvailable} onClick={onUndo}>
        <Undo2 className="size-4 rtl:-scale-x-100" />
      </IconButton>
      <IconButton size="sm" data-board-redo label={t('boardsRedo')} disabled={!redoAvailable} onClick={onRedo}>
        <Redo2 className="size-4 rtl:-scale-x-100" />
      </IconButton>
      <Button size="sm" variant={snapping ? 'secondary' : 'ghost'} data-board-snap aria-pressed={snapping} title={t('boardsSnapHint')} onClick={onToggleSnap}>
        {t('boardsSnap')}
      </Button>
      {mindMap && (
        <Button size="sm" variant="ghost" data-board-layout disabled={empty} onClick={onLayout}>
          {t('boardsLayout')}
        </Button>
      )}
      <select data-board-shape aria-label={t('boardsArrowShape')} value={edgeShape} onChange={event => onShape(event.target.value as EdgeShape)} className={selectClass}>
        <option value="straight">{t('boardsStraight')}</option>
        <option value="curved">{t('boardsCurved')}</option>
      </select>
      <select data-board-export aria-label={t('boardsExport')} disabled={busy} value="" onChange={event => {
        if (event.target.value) onExport(event.target.value as 'svg' | 'png');
      }} className={selectClass}>
        <option value="">{t(selectedCount ? 'boardsExportSelection' : 'boardsExport')}</option>
        <option value="svg">{t('boardsExportSvg')}</option>
        <option value="png">{t('boardsExportPng')}</option>
      </select>
      <Button size="sm" variant="ghost" data-board-to-note disabled={busy || empty} onClick={onToNote}>
        {t(selectedCount ? 'boardsSelectionToNote' : 'boardsToNote')}
      </Button>
      {selectedCount > 1 && <>
        <span data-board-selection-count className="text-xs text-muted">{t('boardsSelected', { count: selectedCount })}</span>
        <select data-board-align aria-label={t('boardsAlign')} value="" onChange={event => {
          if (event.target.value) onAlign(event.target.value as AlignMode);
        }} className={selectClass}>
          <option value="">{t('boardsAlign')}</option>
          {(Object.keys(alignmentKeys) as AlignMode[]).map(mode => <option key={mode} value={mode}>{t(alignmentKeys[mode])}</option>)}
        </select>
        <Button size="sm" variant="ghost" data-board-duplicate onClick={onDuplicate}>{t('boardsDuplicate')}</Button>
      </>}
    </div>
  );
}
