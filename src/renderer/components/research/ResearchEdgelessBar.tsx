'use client';

import React, { useState } from 'react';
import { translations } from '../../translations';
import {
  MousePointer,
  Frame,
  Spline,
  Link2,
  StickyNote,
  PenTool,
  Eraser,
  Shapes,
  Workflow,
  LayoutGrid,
  Layers,
  Undo2,
  Maximize2,
  Minus,
  Plus,
  ExternalLink,
} from 'lucide-react';

interface Props {
  language: 'ar' | 'en';
  onFitScreen?: () => void;
  onInsertKanban?: () => void | Promise<unknown>;
  onArrangeSources?: () => void | Promise<unknown>;
  onUndoArrange?: () => void | Promise<unknown>;
  onLinkBoard?: () => void;
  zoomLevel?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onSelectTool?: (tool: string) => void;
  activeTool?: string;
}

export function ResearchEdgelessBar({
  language,
  onFitScreen,
  onInsertKanban,
  onArrangeSources,
  onUndoArrange,
  onLinkBoard,
  zoomLevel = 100,
  onZoomIn,
  onZoomOut,
  onSelectTool,
  activeTool = 'select',
}: Props) {
  const t = translations[language];
  const [currentTool, setCurrentTool] = useState(activeTool);

  const handleTool = (tool: string) => {
    setCurrentTool(tool);
    onSelectTool?.(tool);
  };

  return (
    <div className="research-edgeless-container pointer-events-none">
      {/* Bottom-left zoom controls (Screenshot 1.png & 2.png) */}
      <div className="research-zoom-controls pointer-events-auto" role="toolbar" aria-label={t.boardsZoomLevel || 'Zoom'}>
        <button
          type="button"
          onClick={onFitScreen}
          className="research-zoom-btn"
          title={t.researchZoomFit}
          aria-label={t.researchZoomFit}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          className="research-zoom-btn"
          title={t.researchZoomOut}
          aria-label={t.researchZoomOut}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="research-zoom-text" aria-live="polite">
          {Math.round(zoomLevel)}%
        </span>
        <button
          type="button"
          onClick={onZoomIn}
          className="research-zoom-btn"
          title={t.researchZoomIn}
          aria-label={t.researchZoomIn}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Bottom-center floating pill toolbar (Screenshot 2.png) */}
      <div className="research-toolbar-pill pointer-events-auto" role="toolbar" aria-label={t.researchEdgelessMode}>
        <button
          type="button"
          onClick={() => handleTool('select')}
          className={`research-toolbar-btn ${currentTool === 'select' ? 'active' : ''}`}
          title={t.researchToolSelect}
          aria-label={t.researchToolSelect}
        >
          <MousePointer className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => handleTool('frame')}
          className={`research-toolbar-btn ${currentTool === 'frame' ? 'active' : ''}`}
          title={t.researchToolFrame}
          aria-label={t.researchToolFrame}
        >
          <Frame className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => handleTool('connector')}
          className={`research-toolbar-btn ${currentTool === 'connector' ? 'active' : ''}`}
          title={t.researchToolConnector}
          aria-label={t.researchToolConnector}
        >
          <Spline className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => handleTool('link')}
          className={`research-toolbar-btn ${currentTool === 'link' ? 'active' : ''}`}
          title={t.researchToolLink}
          aria-label={t.researchToolLink}
        >
          <Link2 className="w-4 h-4" />
        </button>

        <div className="research-toolbar-divider" />

        <button
          type="button"
          onClick={() => handleTool('text')}
          className={`research-toolbar-btn ${currentTool === 'text' ? 'active' : ''}`}
          title={t.researchToolText}
          aria-label={t.researchToolText}
        >
          <StickyNote className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => handleTool('pen')}
          className={`research-toolbar-btn ${currentTool === 'pen' ? 'active' : ''}`}
          title={t.researchToolPen}
          aria-label={t.researchToolPen}
        >
          <PenTool className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => handleTool('eraser')}
          className={`research-toolbar-btn ${currentTool === 'eraser' ? 'active' : ''}`}
          title={t.researchToolEraser}
          aria-label={t.researchToolEraser}
        >
          <Eraser className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => handleTool('shapes')}
          className={`research-toolbar-btn ${currentTool === 'shapes' ? 'active' : ''}`}
          title={t.researchToolShapes}
          aria-label={t.researchToolShapes}
        >
          <Shapes className="w-4 h-4" />
        </button>

        <div className="research-toolbar-divider" />

        <button
          type="button"
          onClick={() => handleTool('mindmap')}
          className={`research-toolbar-btn ${currentTool === 'mindmap' ? 'active' : ''}`}
          title={t.researchToolMindMap}
          aria-label={t.researchToolMindMap}
        >
          <Workflow className="w-4 h-4" />
        </button>

        {onInsertKanban && (
          <button
            type="button"
            onClick={() => void onInsertKanban()}
            className="research-toolbar-btn"
            title={t.researchToolKanban}
            aria-label={t.researchToolKanban}
          >
            <LayoutGrid className="w-4 h-4 text-amber-500" />
          </button>
        )}

        {onArrangeSources && (
          <button
            type="button"
            onClick={() => void onArrangeSources()}
            className="research-toolbar-btn"
            title={t.editorArrangeSources}
            aria-label={t.editorArrangeSources}
          >
            <Layers className="w-4 h-4 text-emerald-500" />
          </button>
        )}

        {onUndoArrange && (
          <button
            type="button"
            onClick={() => void onUndoArrange()}
            className="research-toolbar-btn"
            title={t.editorUndoArrange}
            aria-label={t.editorUndoArrange}
          >
            <Undo2 className="w-4 h-4 text-rose-500" />
          </button>
        )}

        {onLinkBoard && (
          <button
            type="button"
            onClick={onLinkBoard}
            className="research-toolbar-btn"
            title={t.editorLinkBoard}
            aria-label={t.editorLinkBoard}
          >
            <ExternalLink className="w-4 h-4 text-primary" />
          </button>
        )}
      </div>
    </div>
  );
}
