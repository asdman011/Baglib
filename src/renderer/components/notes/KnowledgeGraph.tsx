'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Network, X } from 'lucide-react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { useWorkspace } from '../context/WorkspaceContext';
import { buildKnowledgeGraph, connectionCount, localGraph, type GraphNode, type GraphNodeKind, type KnowledgeGraph } from '../../../shared/knowledge-graph';
import type { StudyNote } from '../../../shared/study-notes';
import type { TranslationKey } from '../../translations';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';

type Placed = GraphNode & SimulationNodeDatum & { x: number; y: number };
type PlacedEdge = SimulationLinkDatum<Placed> & { source: Placed; target: Placed; kind: string };

const kindColors: Record<GraphNodeKind, string> = {
  note: '#f59e0b', book: '#0ea5e9', quran: '#10b981', hadith: '#8b5cf6', poem: '#f43f5e', lecture: '#64748b', tag: '#a3a3a3',
};
const kindKeys: Record<GraphNodeKind, TranslationKey> = {
  note: 'studyLinkKindNote', book: 'studyLinkKindBook', quran: 'studyLinkKindAyah', hadith: 'studyLinkKindHadith', poem: 'studyLinkKindPoem', lecture: 'graphKindLecture', tag: 'graphKindTag',
};

/** Force layout computed once (d3-force), then drawn still: the same graph always settles the same way. */
function layout(graph: KnowledgeGraph, center: string | null): { nodes: Placed[]; edges: PlacedEdge[]; box: [number, number, number, number] } {
  const nodes: Placed[] = graph.nodes.map((node, index) => ({ ...node, x: Math.cos(index) * 50, y: Math.sin(index) * 50, ...(node.id === center ? { fx: 0, fy: 0 } : {}) }));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = graph.edges.map(edge => ({ source: byId.get(edge.source)!, target: byId.get(edge.target)!, kind: edge.kind })).filter(edge => edge.source && edge.target);
  const simulation = forceSimulation<Placed>(nodes)
    .force('link', forceLink<Placed, PlacedEdge>(edges).distance(edge => (edge.kind === 'tag' ? 60 : 90)).strength(0.6))
    .force('charge', forceManyBody().strength(nodes.length > 150 ? -60 : -220))
    .force('collide', forceCollide(26))
    .force('center', forceCenter(0, 0))
    .stop();
  const ticks = Math.min(400, 120 + nodes.length * 2);
  for (let tick = 0; tick < ticks; tick++) simulation.tick();
  const xs = nodes.map(node => node.x), ys = nodes.map(node => node.y);
  const pad = 80;
  const minX = Math.min(...xs, 0) - pad, minY = Math.min(...ys, 0) - pad;
  return { nodes, edges, box: [minX, minY, Math.max(...xs, 0) + pad - minX, Math.max(...ys, 0) + pad - minY] };
}

function GraphDialog({ noteId, graph, onClose }: { noteId: string; graph: KnowledgeGraph; onClose: () => void }) {
  const { t, books, openBookForReading } = useWorkspace();
  const [whole, setWhole] = useState(false);
  const center = `note:${noteId}`;
  const shown = useMemo(() => (whole ? graph : localGraph(graph, center)), [whole, graph, center]);
  const placed = useMemo(() => layout(shown, center), [shown, center]);
  const [view, setView] = useState<[number, number, number, number] | null>(null);
  const box = view ?? placed.box;
  const drag = useRef<{ x: number; y: number; box: [number, number, number, number] } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const dense = placed.nodes.length > 120;
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const open = (node: GraphNode) => {
    if (!node.target) return;
    onClose();
    void navigateStudyReference(node.target, books, openBookForReading, (id, anchor) => openStudyNote({ id, anchor })).catch(() => {});
  };
  const zoom = (event: React.WheelEvent) => {
    const factor = event.deltaY > 0 ? 1.15 : 1 / 1.15;
    const [x, y, w, h] = box;
    setView([x + (w - w * factor) / 2, y + (h - h * factor) / 2, w * factor, h * factor]);
  };
  const neighbours = shown.edges.filter(edge => edge.source === center || edge.target === center).map(edge => shown.nodes.find(node => node.id === (edge.source === center ? edge.target : edge.source))!).filter(Boolean);
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby="graph-title" data-knowledge-graph className="flex h-[min(720px,92vh)] w-[min(1000px,96vw)] flex-col overflow-hidden rounded-2xl border border-subtle bg-surface text-main shadow-2xl" onClick={event => event.stopPropagation()}>
      <header className="flex flex-wrap items-center gap-3 border-b border-subtle px-4 py-2">
        <Network size={16} aria-hidden="true" />
        <h2 id="graph-title" className="text-sm font-bold">{t(whole ? 'graphWholeTitle' : 'graphLocalTitle')}</h2>
        <span data-graph-counts className="text-xs text-muted">{t('graphCounts', { nodes: placed.nodes.length, links: placed.edges.length })}</span>
        <label className="ms-auto flex items-center gap-2 text-xs"><input type="checkbox" data-graph-whole checked={whole} onChange={event => { setWhole(event.target.checked); setView(null); }} />{t('graphWholeLibrary')}</label>
        <button type="button" autoFocus aria-label={t('close')} title={t('close')} onClick={onClose} className="rounded p-1 hover:bg-canvas"><X size={16} /></button>
      </header>
      <div className="relative min-h-0 flex-1 bg-canvas">
        <svg ref={svg} data-graph-svg role="img" aria-label={t(whole ? 'graphWholeTitle' : 'graphLocalTitle')} viewBox={box.join(' ')} className="h-full w-full cursor-grab touch-none select-none"
          onWheel={zoom}
          onPointerDown={event => { drag.current = { x: event.clientX, y: event.clientY, box }; (event.target as Element).setPointerCapture?.(event.pointerId); }}
          onPointerMove={event => {
            if (!drag.current || !svg.current) return;
            const scale = drag.current.box[2] / svg.current.clientWidth;
            const [x, y, w, h] = drag.current.box;
            setView([x - (event.clientX - drag.current.x) * scale, y - (event.clientY - drag.current.y) * scale, w, h]);
          }}
          onPointerUp={() => { drag.current = null; }}>
          <g stroke="currentColor" strokeOpacity={0.25}>
            {placed.edges.map((edge, index) => <line key={index} x1={edge.source.x} y1={edge.source.y} x2={edge.target.x} y2={edge.target.y} strokeWidth={edge.kind === 'tag' ? 1 : 1.6} strokeDasharray={edge.kind === 'tag' ? '3 3' : undefined} />)}
          </g>
          {placed.nodes.map(node => {
            const isCenter = node.id === center;
            const showLabel = !dense || isCenter || hovered === node.id;
            return <g key={node.id} data-graph-node={node.id} transform={`translate(${node.x},${node.y})`} className={node.target ? 'cursor-pointer' : undefined}
              onPointerDown={event => event.stopPropagation()} onClick={() => open(node)} onMouseEnter={() => setHovered(node.id)} onMouseLeave={() => setHovered(null)}>
              <title>{`${t(kindKeys[node.kind])}: ${node.label}`}</title>
              <circle r={isCenter ? 13 : node.kind === 'tag' ? 6 : 9} fill={kindColors[node.kind]} stroke={isCenter ? 'currentColor' : 'none'} strokeWidth={2} />
              {showLabel && <text y={isCenter ? 28 : 22} textAnchor="middle" fontSize={isCenter ? 13 : 11} fill="currentColor" style={{ unicodeBidi: 'plaintext' }}>{node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label}</text>}
            </g>;
          })}
        </svg>
        <ul className="absolute bottom-2 start-2 flex flex-wrap gap-2 rounded-lg bg-surface/90 px-2 py-1 text-[11px]">
          {(Object.keys(kindColors) as GraphNodeKind[]).map(kind => <li key={kind} className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: kindColors[kind] }} />{t(kindKeys[kind])}</li>)}
        </ul>
      </div>
      {/* The same connections as text, for keyboards and screen readers. */}
      <details className="border-t border-subtle px-4 py-2 text-xs">
        <summary>{t('graphListTitle', { count: neighbours.length })}</summary>
        <ul data-graph-list className="mt-1 max-h-28 space-y-1 overflow-auto">{neighbours.map(node => <li key={node.id}><button type="button" disabled={!node.target} onClick={() => open(node)} className="underline disabled:no-underline" dir="auto">{t(kindKeys[node.kind])}: {node.label}</button></li>)}</ul>
      </details>
    </div>
  </div>;
}

/** The local-graph button on a note: greyed out when the note has no links, tags or backlinks. */
export function KnowledgeGraphButton({ noteId, notes }: { noteId: string; notes: StudyNote[] }) {
  const { t, books } = useWorkspace();
  const [open, setOpen] = useState(false);
  const graph = useMemo(() => buildKnowledgeGraph(notes, { books: new Map(books.map(book => [book.id, book.title])) }), [notes, books]);
  const count = connectionCount(graph, `note:${noteId}`);
  return <>
    <button type="button" data-graph-button disabled={count === 0} aria-label={t(count ? 'graphOpen' : 'graphNone')} title={t(count ? 'graphOpen' : 'graphNone')} onClick={() => setOpen(true)}
      className="rounded p-1 text-main hover:bg-canvas disabled:opacity-30 disabled:cursor-not-allowed"><Network size={16} /></button>
    {open && <GraphDialog noteId={noteId} graph={graph} onClose={() => setOpen(false)} />}
  </>;
}
