'use client';
import React, { useMemo, useRef, useState } from 'react';
import { Network, X } from 'lucide-react';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { useWorkspace } from '../context/WorkspaceContext';
import { buildKnowledgeGraph, connectionCount, filterByRelations, graphRelations, localGraph, type GraphNode, type GraphNodeKind, type KnowledgeGraph } from '../../../shared/knowledge-graph';
import type { StudyNote } from '../../../shared/study-notes';
import type { TranslationKey } from '../../translations';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import { relationLabel } from '../../utils/relation-labels';
import { Modal } from '../ui/Modal';

type Placed = GraphNode & SimulationNodeDatum & { x: number; y: number };
type PlacedEdge = SimulationLinkDatum<Placed> & { source: Placed; target: Placed; kind: string; relation?: string };

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
  const edges = graph.edges.map(edge => ({ source: byId.get(edge.source)!, target: byId.get(edge.target)!, kind: edge.kind, relation: edge.relation })).filter(edge => edge.source && edge.target);
  const simulation = forceSimulation<Placed>(nodes)
    .force('link', forceLink<Placed, PlacedEdge>(edges).distance(edge => (edge.kind === 'tag' ? 60 : 90)).strength(0.6))
    .force('charge', forceManyBody().strength(nodes.length > 150 ? -60 : -220))
    .force('collide', forceCollide(26))
    // A gentle pull to the middle keeps loose notes near; a centring force would drag every dot onto the pinned centre note.
    .force('x', forceX(0).strength(0.04))
    .force('y', forceY(0).strength(0.04))
    .stop();
  const ticks = Math.min(400, 120 + nodes.length * 2);
  for (let tick = 0; tick < ticks; tick++) simulation.tick();
  const xs = nodes.map(node => node.x), ys = nodes.map(node => node.y);
  const pad = 80;
  let minX = Math.min(...xs, 0) - pad, minY = Math.min(...ys, 0) - pad;
  let width = Math.max(...xs, 0) + pad - minX, height = Math.max(...ys, 0) + pad - minY;
  // A small graph is not blown up: keep at least a 560 × 380 view around it, so dots and labels keep their size.
  if (width < 560) { minX -= (560 - width) / 2; width = 560; }
  if (height < 380) { minY -= (380 - height) / 2; height = 380; }
  return { nodes, edges, box: [minX, minY, width, height] };
}

function GraphDialog({ noteId, graph, onClose }: { noteId: string; graph: KnowledgeGraph; onClose: () => void }) {
  const { t, books, openBookForReading } = useWorkspace();
  const [whole, setWhole] = useState(false);
  const center = `note:${noteId}`;
  const scoped = useMemo(() => (whole ? graph : localGraph(graph, center)), [whole, graph, center]);
  // Relationship filter: pick one or more relationships to see only those lines (none picked shows everything).
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const available = useMemo(() => graphRelations(scoped), [scoped]);
  const active = useMemo(() => new Set([...picked].filter(relation => available.some(entry => entry.relation === relation))), [picked, available]);
  const shown = useMemo(() => filterByRelations(scoped, active, center), [scoped, active, center]);
  const toggle = (relation: string) => { setPicked(current => { const next = new Set(current); if (next.has(relation)) next.delete(relation); else next.add(relation); return next; }); setView(null); };
  const placed = useMemo(() => layout(shown, center), [shown, center]);
  const [view, setView] = useState<[number, number, number, number] | null>(null);
  const box = view ?? placed.box;
  const drag = useRef<{ x: number; y: number; box: [number, number, number, number] } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const dense = placed.nodes.length > 120;
  const [hovered, setHovered] = useState<string | null>(null);
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
  const neighbours = shown.edges.filter(edge => edge.source === center || edge.target === center)
    .map(edge => ({ node: shown.nodes.find(node => node.id === (edge.source === center ? edge.target : edge.source))!, relation: edge.relation, incoming: edge.target === center }))
    .filter(entry => entry.node);
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
    <Modal asChild open={true} onClose={onClose} label={t(whole ? 'graphWholeTitle' : 'graphLocalTitle')}><div role="dialog" aria-modal="true" aria-labelledby="graph-title" data-knowledge-graph className="flex h-[min(720px,92vh)] w-[min(1000px,96vw)] flex-col overflow-hidden rounded-2xl border border-subtle bg-surface text-main shadow-2xl" onClick={event => event.stopPropagation()}>
      <header className="flex flex-wrap items-center gap-3 border-b border-subtle px-4 py-2">
        <Network size={16} aria-hidden="true" />
        <h2 id="graph-title" className="text-sm font-bold">{t(whole ? 'graphWholeTitle' : 'graphLocalTitle')}</h2>
        <span data-graph-counts className="text-xs text-muted">{t('graphCounts', { nodes: placed.nodes.length, links: placed.edges.length })}</span>
        <label className="ms-auto flex items-center gap-2 text-xs"><input type="checkbox" data-graph-whole checked={whole} onChange={event => { setWhole(event.target.checked); setView(null); }} />{t('graphWholeLibrary')}</label>
        <button type="button" autoFocus aria-label={t('close')} title={t('close')} onClick={onClose} className="rounded p-1 hover:bg-canvas"><X size={16} /></button>
      </header>
      {available.length > 0 && <div data-graph-filter role="group" aria-label={t('graphFilterLabel')} className="flex flex-wrap items-center gap-1.5 border-b border-subtle px-4 py-1.5 text-xs">
        <span className="text-muted">{t('graphFilterLabel')}</span>
        <button type="button" data-graph-filter-all aria-pressed={!active.size} onClick={() => { setPicked(new Set()); setView(null); }} className={`rounded-full border px-2 py-0.5 ${!active.size ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'border-subtle'}`}>{t('graphFilterAll')}</button>
        {available.map(({ relation, count }) => <button key={relation} type="button" data-graph-filter-relation={relation} aria-pressed={active.has(relation)} onClick={() => toggle(relation)} dir="auto"
          className={`rounded-full border px-2 py-0.5 ${active.has(relation) ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'border-subtle'}`}>{relationLabel(t, relation)} ({count})</button>)}
      </div>}
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
          <defs><marker id="graph-relation-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#10b981" /></marker></defs>
          <g stroke="currentColor" strokeOpacity={0.25}>
            {placed.edges.filter(edge => !edge.relation).map((edge, index) => <line key={index} x1={edge.source.x} y1={edge.source.y} x2={edge.target.x} y2={edge.target.y} strokeWidth={edge.kind === 'tag' ? 1 : 1.6} strokeDasharray={edge.kind === 'tag' ? '3 3' : undefined} />)}
          </g>
          {/* Typed relationships: a green arrow from the note to what it supports, refutes, explains … with its name. */}
          {placed.edges.filter(edge => edge.relation).map(edge => {
            const dx = edge.target.x - edge.source.x, dy = edge.target.y - edge.source.y, length = Math.hypot(dx, dy) || 1;
            const radius = edge.target.id === center ? 15 : 11;
            const x2 = edge.target.x - (dx / length) * radius, y2 = edge.target.y - (dy / length) * radius;
            return <g key={`${edge.source.id}>${edge.target.id}`} data-graph-relation={edge.relation}>
              <line x1={edge.source.x} y1={edge.source.y} x2={x2} y2={y2} stroke="#10b981" strokeOpacity={0.8} strokeWidth={1.8} markerEnd="url(#graph-relation-arrow)" />
              {(!dense || hovered === edge.source.id || hovered === edge.target.id) && <text x={(edge.source.x + edge.target.x) / 2} y={(edge.source.y + edge.target.y) / 2 - 4} textAnchor="middle" fontSize={10} fill="#10b981" stroke="var(--color-canvas, #000)" strokeWidth={3} paintOrder="stroke" style={{ unicodeBidi: 'plaintext' }}>{relationLabel(t, edge.relation!)}</text>}
            </g>;
          })}
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
        <ul data-graph-list className="mt-1 max-h-28 space-y-1 overflow-auto">{neighbours.map(({ node, relation, incoming }) => <li key={node.id} className="flex flex-wrap items-center gap-1">
          {relation && <span data-graph-list-relation={relation} className="rounded bg-emerald-500/15 px-1.5 font-semibold text-emerald-700 dark:text-emerald-300" dir="auto">{incoming ? t('graphRelationIncoming', { relation: relationLabel(t, relation) }) : relationLabel(t, relation)}</span>}
          <button type="button" disabled={!node.target} onClick={() => open(node)} className="underline disabled:no-underline" dir="auto">{t(kindKeys[node.kind])}: {node.label}</button>
        </li>)}</ul>
      </details>
    </div></Modal>
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
