'use client';

/**
 * Baglib — image occlusion editor (KEY-391).
 *
 * Draw masks over an image: rectangles, ellipses, polygons and text labels. Shapes that share a
 * number are one group and are asked on one card. The result is written to the note's Occlusion
 * and Image fields in Anki's exact format (see shared/revision/image-occlusion.ts).
 *
 * Keyboard (when the canvas has focus): V select, R rectangle, E ellipse, P polygon, T text;
 * arrows move the selection (Shift = larger steps), Ctrl+arrows resize it; Delete removes it;
 * Ctrl+G groups, Ctrl+Shift+G ungroups; Ctrl+A selects all; Enter closes a polygon; Escape cancels.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Hexagon, ImagePlus, MousePointer2, Square, Trash2, Type, Ungroup } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  TEXT_FONT_SIZE,
  imageFieldFor,
  mediaNameFromImageField,
  occlusionFieldToShapes,
  occlusionOrdinals,
  shapesToOcclusionField,
  type OcclusionPoint,
  type OcclusionShape,
} from '../../../shared/revision/image-occlusion';

type Tool = 'select' | 'rect' | 'ellipse' | 'polygon' | 'text';
interface EditorShape extends OcclusionShape {
  id: string;
}

export interface ImageOcclusionEditorProps {
  occlusion: string;
  image: string;
  onChange: (fields: { Occlusion: string; Image: string }) => void;
}

const MIN_SIZE = 0.01;
let nextId = 1;
const newId = () => `io-${Date.now().toString(36)}-${nextId++}`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const plainShape = (shape: EditorShape): OcclusionShape => {
  const out: Partial<EditorShape> = { ...shape };
  delete out.id;
  return out as OcclusionShape;
};

/** Anki's rule for a new shape: the first unused number in 1..max, else max + 1. */
export function nextOrdinal(shapes: OcclusionShape[]): number {
  const used = new Set(shapes.map(s => s.ordinal).filter(n => n > 0));
  const max = Math.max(0, ...used);
  for (let i = 1; i <= max; i++) if (!used.has(i)) return i;
  return max + 1;
}

function bounds(shape: OcclusionShape): { x: number; y: number; w: number; h: number } {
  if (shape.kind === 'rect') return { x: shape.left, y: shape.top, w: shape.width ?? 0, h: shape.height ?? 0 };
  if (shape.kind === 'ellipse') return { x: shape.left, y: shape.top, w: (shape.rx ?? 0) * 2, h: (shape.ry ?? 0) * 2 };
  if (shape.kind === 'polygon') {
    const xs = (shape.points ?? []).map(p => p.x);
    const ys = (shape.points ?? []).map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  return { x: shape.left, y: shape.top, w: 0.1, h: shape.fontSize ?? 0.04 };
}

function moveShape(shape: EditorShape, dx: number, dy: number): EditorShape {
  const out = { ...shape, left: shape.left + dx, top: shape.top + dy };
  if (shape.points) out.points = shape.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
  return out;
}

function resizeShape(shape: EditorShape, dw: number, dh: number): EditorShape {
  if (shape.kind === 'rect') return { ...shape, width: Math.max(MIN_SIZE, (shape.width ?? 0) + dw), height: Math.max(MIN_SIZE, (shape.height ?? 0) + dh) };
  if (shape.kind === 'ellipse') return { ...shape, rx: Math.max(MIN_SIZE / 2, (shape.rx ?? 0) + dw / 2), ry: Math.max(MIN_SIZE / 2, (shape.ry ?? 0) + dh / 2) };
  if (shape.kind === 'text') return { ...shape, scale: Math.max(0.2, (shape.scale ?? 1) * (1 + (dw + dh) * 5)) };
  return shape;
}

export const ImageOcclusionEditor: React.FC<ImageOcclusionEditorProps> = ({ occlusion, image, onChange }) => {
  const { t } = useWorkspace();
  const parsed = useMemo(() => occlusionFieldToShapes(occlusion), [occlusion]);
  const [shapes, setShapes] = useState<EditorShape[]>(() => parsed.shapes.map(s => ({ ...s, id: newId() })));
  const [occludeInactive, setOccludeInactive] = useState<boolean>(() => (occlusion ? parsed.occludeInactive : true));
  const [mediaName, setMediaName] = useState<string | null>(() => mediaNameFromImageField(image));
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [tool, setTool] = useState<Tool>('rect');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<EditorShape | null>(null);
  const [polygon, setPolygon] = useState<OcclusionPoint[]>([]);
  const [labelText, setLabelText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: 'create' | 'move'; start: OcclusionPoint; last: OcclusionPoint } | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Load the stored image for an existing note.
  useEffect(() => {
    if (!mediaName || dataUrl) return;
    let active = true;
    void window.electronAPI?.cardMedia?.read(mediaName).then(stored => {
      if (active && stored) setDataUrl(stored.dataUrl);
    });
    return () => {
      active = false;
    };
  }, [mediaName, dataUrl]);

  // Write the fields whenever the drawing changes.
  useEffect(() => {
    const plain = shapes.map(plainShape);
    onChangeRef.current({
      Occlusion: shapesToOcclusionField(plain, occludeInactive),
      Image: mediaName ? imageFieldFor(mediaName) : '',
    });
  }, [shapes, occludeInactive, mediaName]);

  const adopt = useCallback((stored: { name: string; dataUrl: string } | null) => {
    if (!stored) return;
    setMediaName(stored.name);
    setDataUrl(stored.dataUrl);
    setNatural(null);
    setError(null);
  }, []);

  const pickImage = useCallback(async () => {
    try {
      adopt(await window.electronAPI.cardMedia.pickImage());
    } catch {
      setError(t('ioImageFailed'));
    }
  }, [adopt, t]);

  const takeFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file || !file.type.startsWith('image/')) return;
      try {
        adopt(await window.electronAPI.cardMedia.saveBytes(new Uint8Array(await file.arrayBuffer())));
      } catch {
        setError(t('ioImageFailed'));
      }
    },
    [adopt, t]
  );

  const toPoint = (event: { clientX: number; clientY: number }): OcclusionPoint | null => {
    const svg = svgRef.current;
    if (!svg || !natural) return null;
    const rect = svg.getBoundingClientRect();
    return { x: clamp01((event.clientX - rect.left) / rect.width), y: clamp01((event.clientY - rect.top) / rect.height) };
  };

  const addShape = (shape: Omit<EditorShape, 'id' | 'ordinal'> & { ordinal?: number }) => {
    const ordinal = shape.kind === 'text' ? 0 : shape.ordinal || nextOrdinal(shapes);
    const created = { ...shape, ordinal, id: newId() } as EditorShape;
    setShapes(prev => [...prev, created]);
    setSelected(new Set([created.id]));
    setStatus(shape.kind === 'text' ? t('ioLabelAdded') : t('ioShapeAdded', { n: ordinal }));
  };

  const finishPolygon = () => {
    if (polygon.length >= 3) {
      const xs = polygon.map(p => p.x);
      const ys = polygon.map(p => p.y);
      addShape({ kind: 'polygon', left: Math.min(...xs), top: Math.min(...ys), points: polygon });
    }
    setPolygon([]);
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const p = toPoint(event);
    if (!p) return;
    svgRef.current?.focus();
    const hitId = (event.target as Element).getAttribute?.('data-shape-id');
    if (tool === 'select') {
      if (hitId) {
        setSelected(prev => {
          if (event.shiftKey) {
            const next = new Set(prev);
            if (next.has(hitId)) next.delete(hitId);
            else next.add(hitId);
            return next;
          }
          return prev.has(hitId) ? prev : new Set([hitId]);
        });
        drag.current = { kind: 'move', start: p, last: p };
        svgRef.current?.setPointerCapture(event.pointerId);
      } else setSelected(new Set());
      return;
    }
    if (tool === 'polygon') {
      setPolygon(prev => [...prev, p]);
      return;
    }
    if (tool === 'text') {
      const text = labelText.trim();
      if (!text) {
        setError(t('ioLabelEmpty'));
        return;
      }
      const height = natural ? TEXT_FONT_SIZE / natural.h : 0.04;
      addShape({ kind: 'text', left: p.x, top: p.y, text, scale: 1, fontSize: Math.min(0.2, height) });
      return;
    }
    drag.current = { kind: 'create', start: p, last: p };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    const p = toPoint(event);
    if (!d || !p) return;
    if (d.kind === 'move') {
      const dx = p.x - d.last.x;
      const dy = p.y - d.last.y;
      d.last = p;
      setShapes(prev => prev.map(s => (selected.has(s.id) ? moveShape(s, dx, dy) : s)));
      return;
    }
    d.last = p;
    const x = Math.min(d.start.x, p.x);
    const y = Math.min(d.start.y, p.y);
    const w = Math.abs(p.x - d.start.x);
    const h = Math.abs(p.y - d.start.y);
    setDraft(
      tool === 'ellipse'
        ? { id: 'draft', kind: 'ellipse', ordinal: 0, left: x, top: y, rx: w / 2, ry: h / 2 }
        : { id: 'draft', kind: 'rect', ordinal: 0, left: x, top: y, width: w, height: h }
    );
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
    if (!d || d.kind !== 'create' || !draft) {
      setDraft(null);
      return;
    }
    const b = bounds(draft);
    if (b.w >= MIN_SIZE && b.h >= MIN_SIZE) {
      addShape(plainShape(draft));
    }
    setDraft(null);
  };

  const group = () => {
    const chosen = shapes.filter(s => selected.has(s.id) && s.kind !== 'text');
    if (chosen.length < 2) return;
    const ordinal = Math.min(...chosen.map(s => s.ordinal));
    setShapes(prev => prev.map(s => (selected.has(s.id) && s.kind !== 'text' ? { ...s, ordinal } : s)));
    setStatus(t('ioGrouped', { n: ordinal }));
  };

  const ungroup = () => {
    setShapes(prev => {
      let next = [...prev];
      const seen = new Set<number>();
      next = next.map(s => {
        if (!selected.has(s.id) || s.kind === 'text') return s;
        if (!seen.has(s.ordinal)) {
          seen.add(s.ordinal);
          return s;
        }
        const ordinal = nextOrdinal(next);
        const updated = { ...s, ordinal };
        next = next.map(o => (o.id === s.id ? updated : o));
        return updated;
      });
      return next;
    });
  };

  const removeSelected = () => {
    setShapes(prev => prev.filter(s => !selected.has(s.id)));
    setSelected(new Set());
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key;
    if (key === 'Escape') {
      setPolygon([]);
      setDraft(null);
      setSelected(new Set());
      return;
    }
    if (key === 'Enter' && tool === 'polygon') {
      event.preventDefault();
      finishPolygon();
      return;
    }
    if (ctrl && key.toLowerCase() === 'g') {
      event.preventDefault();
      if (event.shiftKey) ungroup();
      else group();
      return;
    }
    if (ctrl && key.toLowerCase() === 'a') {
      event.preventDefault();
      setSelected(new Set(shapes.map(s => s.id)));
      return;
    }
    if ((key === 'Delete' || key === 'Backspace') && selected.size) {
      event.preventDefault();
      removeSelected();
      return;
    }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[key] && selected.size) {
      event.preventDefault();
      const step = event.shiftKey ? 0.02 : 0.005;
      const [ax, ay] = arrows[key];
      setShapes(prev => prev.map(s => (selected.has(s.id) ? (ctrl ? resizeShape(s, ax * step, ay * step) : moveShape(s, ax * step, ay * step)) : s)));
      return;
    }
    if (!ctrl && !event.altKey) {
      const tools: Record<string, Tool> = { v: 'select', r: 'rect', e: 'ellipse', p: 'polygon', t: 'text' };
      const next = tools[key.toLowerCase()];
      if (next) {
        setTool(next);
        setPolygon([]);
      }
    }
  };

  const groups = occlusionOrdinals(shapes);
  const w = natural?.w ?? 1000;
  const h = natural?.h ?? 1000;
  const strokeFor = (s: EditorShape) => (selected.has(s.id) ? '#2563eb' : '#212121');

  const renderShape = (s: EditorShape, isDraft = false) => {
    const common = {
      'data-shape-id': isDraft ? undefined : s.id,
      'data-io-ordinal': isDraft ? undefined : s.ordinal,
      'data-io-kind': isDraft ? undefined : s.kind,
      fill: s.kind === 'text' ? '#ffffff' : '#ffeba2',
      fillOpacity: isDraft ? 0.5 : 0.85,
      stroke: isDraft ? '#2563eb' : strokeFor(s),
      strokeWidth: selected.has(s.id) ? 3 : 1.5,
      vectorEffect: 'non-scaling-stroke' as const,
      style: { cursor: tool === 'select' ? 'move' : 'crosshair' },
    };
    const b = bounds(s);
    let body: React.ReactNode;
    if (s.kind === 'rect') body = <rect {...common} x={s.left * w} y={s.top * h} width={(s.width ?? 0) * w} height={(s.height ?? 0) * h} />;
    else if (s.kind === 'ellipse') body = <ellipse {...common} cx={(s.left + (s.rx ?? 0)) * w} cy={(s.top + (s.ry ?? 0)) * h} rx={(s.rx ?? 0) * w} ry={(s.ry ?? 0) * h} />;
    else if (s.kind === 'polygon') body = <polygon {...common} points={(s.points ?? []).map(p => `${p.x * w},${p.y * h}`).join(' ')} />;
    else {
      const size = (s.fontSize ?? TEXT_FONT_SIZE / h) * h * (s.scale ?? 1);
      body = (
        <text {...common} x={s.left * w} y={s.top * h + size} fontSize={size} fontFamily="Arial" fill="#000000" stroke="none">
          {s.text}
        </text>
      );
    }
    if (isDraft || s.kind === 'text') return <g key={s.id}>{body}</g>;
    const badge = Math.max(14, Math.min(w, h) * 0.035);
    return (
      <g key={s.id}>
        {body}
        <text x={b.x * w + 4} y={b.y * h + badge} fontSize={badge} fontWeight={700} fill="#7c2d12" pointerEvents="none">
          {s.ordinal}
        </text>
      </g>
    );
  };

  const toolButton = (value: Tool, label: string, icon: React.ReactNode, shortcut: string) => (
    <button
      key={value}
      type="button"
      data-io-tool={value}
      aria-pressed={tool === value}
      title={`${label} (${shortcut})`}
      onClick={() => {
        setTool(value);
        setPolygon([]);
        svgRef.current?.focus();
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
        tool === value ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-subtle bg-surface text-muted hover:text-main'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <section data-io-editor className="space-y-3" aria-label={t('ioEditorTitle')}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-io-pick-image
          onClick={() => void pickImage()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
        >
          <ImagePlus className="size-4" />
          {dataUrl ? t('ioChangeImage') : t('ioChooseImage')}
        </button>
        <span className="text-xs text-muted">{t('ioDropHint')}</span>
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      {dataUrl && (
        <>
          <div role="toolbar" aria-label={t('ioToolbar')} className="flex flex-wrap items-center gap-1.5">
            {toolButton('select', t('ioToolSelect'), <MousePointer2 className="size-3.5" />, 'V')}
            {toolButton('rect', t('ioToolRect'), <Square className="size-3.5" />, 'R')}
            {toolButton('ellipse', t('ioToolEllipse'), <Circle className="size-3.5" />, 'E')}
            {toolButton('polygon', t('ioToolPolygon'), <Hexagon className="size-3.5" />, 'P')}
            {toolButton('text', t('ioToolText'), <Type className="size-3.5" />, 'T')}
            <span className="mx-1 h-5 w-px bg-subtle" aria-hidden />
            <button type="button" data-io-group disabled={selected.size < 2} onClick={group} title="Ctrl+G" className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1.5 text-xs text-muted hover:text-main disabled:opacity-40">
              <Group className="size-3.5" />
              {t('ioGroup')}
            </button>
            <button type="button" data-io-ungroup disabled={!selected.size} onClick={ungroup} title="Ctrl+Shift+G" className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1.5 text-xs text-muted hover:text-main disabled:opacity-40">
              <Ungroup className="size-3.5" />
              {t('ioUngroup')}
            </button>
            <button type="button" data-io-delete disabled={!selected.size} onClick={removeSelected} title="Delete" className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1.5 text-xs text-muted hover:text-danger disabled:opacity-40">
              <Trash2 className="size-3.5" />
              {t('ioDelete')}
            </button>
          </div>

          {tool === 'text' && (
            <input
              data-io-label-text
              value={labelText}
              onChange={e => setLabelText(e.target.value)}
              dir="auto"
              placeholder={t('ioLabelPlaceholder')}
              className="w-full rounded-lg border border-subtle bg-canvas px-3 py-1.5 text-sm text-main outline-none focus:border-primary"
            />
          )}
          {tool === 'polygon' && <p className="text-xs text-muted">{t('ioPolygonHint')}</p>}

          <div
            dir="ltr"
            className="relative w-full overflow-hidden rounded-xl border border-subtle bg-canvas"
            style={natural ? { aspectRatio: `${natural.w} / ${natural.h}` } : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL, not a remote image */}
            <img
              src={dataUrl}
              alt=""
              data-io-image
              draggable={false}
              onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="absolute inset-0 h-full w-full select-none"
            />
            {natural && (
              <svg
                ref={svgRef}
                data-io-canvas
                tabIndex={0}
                role="application"
                aria-label={t('ioCanvasLabel')}
                aria-describedby="io-shortcuts"
                viewBox={`0 0 ${w} ${h}`}
                className="absolute inset-0 h-full w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onDoubleClick={() => tool === 'polygon' && finishPolygon()}
                onKeyDown={onKeyDown}
              >
                {shapes.map(s => renderShape(s))}
                {draft && renderShape(draft, true)}
                {polygon.length > 0 && (
                  <polyline
                    points={polygon.map(p => `${p.x * w},${p.y * h}`).join(' ')}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    strokeDasharray="6 4"
                  />
                )}
              </svg>
            )}
          </div>

          <p id="io-shortcuts" className="text-[11px] leading-relaxed text-muted">
            {t('ioShortcuts')}
          </p>

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-semibold text-muted">{t('ioModeLabel')}</legend>
            <label className="flex items-center gap-2 text-sm text-main">
              <input type="radio" name="io-mode" data-io-mode="hide-all" checked={occludeInactive} onChange={() => setOccludeInactive(true)} />
              {t('ioModeHideAll')}
            </label>
            <label className="flex items-center gap-2 text-sm text-main">
              <input type="radio" name="io-mode" data-io-mode="hide-one" checked={!occludeInactive} onChange={() => setOccludeInactive(false)} />
              {t('ioModeHideOne')}
            </label>
          </fieldset>

          <p data-io-summary className="text-xs text-muted" aria-live="polite">
            {t('ioSummary', { shapes: shapes.length, cards: groups.length })}
            {status ? ` · ${status}` : ''}
          </p>
        </>
      )}

      {!dataUrl && (
        <div
          data-io-dropzone
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            void takeFile(e.dataTransfer.files?.[0]);
          }}
          onPaste={e => void takeFile(e.clipboardData.files?.[0])}
          tabIndex={0}
          className="flex min-h-[160px] items-center justify-center rounded-xl border-2 border-dashed border-subtle p-6 text-center text-sm text-muted"
        >
          {t('ioDropzone')}
        </div>
      )}
    </section>
  );
};
