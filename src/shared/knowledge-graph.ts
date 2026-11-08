import { parseBookTarget, parseNoteTarget, parseQuranTarget, studyLinks, type StudyNote } from './study-notes';

export type GraphNodeKind = 'note' | 'book' | 'quran' | 'hadith' | 'poem' | 'lecture' | 'tag';
export interface GraphNode { id: string; kind: GraphNodeKind; label: string; target?: string }
/** `relation` is the typed relationship written in the link (decision S4); it reads from `source` to `target`. */
export interface GraphEdge { source: string; target: string; kind: 'link' | 'embed' | 'tag'; relation?: string }
export interface KnowledgeGraph { nodes: GraphNode[]; edges: GraphEdge[] }

/**
 * The node a study link points to. Book pages fold into their book and note paragraphs into their note, so the
 * graph shows how notes, books, ayahs, hadith, poems and lectures connect rather than every page.
 */
export function graphNodeFor(target: string, label: string): GraphNode | null {
  const note = parseNoteTarget(target);
  if (note) return { id: `note:${note.id}`, kind: 'note', label, target: `note:${note.id}` };
  const book = parseBookTarget(target);
  if (book) return { id: `book:${book.id}`, kind: 'book', label: label.replace(/\s*\(\d+\)$/u, ''), target: `book:${book.id}` };
  const quran = parseQuranTarget(target);
  if (quran) return { id: `quran:${quran.surah}:${quran.from}${quran.to !== quran.from ? `-${quran.to}` : ''}`, kind: 'quran', label, target };
  if (target.startsWith('sunnah:')) return { id: target, kind: 'hadith', label, target };
  if (target.startsWith('poetry:')) {
    const [, , poem] = target.split(':');
    return { id: `poetry:${poem}`, kind: 'poem', label, target };
  }
  if (target.startsWith('media:')) {
    const [, lecture] = target.split(':');
    return { id: `media:${lecture}`, kind: 'lecture', label: label.replace(/\s*·\s*[\d:]+$/u, ''), target };
  }
  return null;
}

/** The whole library as a graph: every note, everything its links point to, and its tags. */
export function buildKnowledgeGraph(notes: Pick<StudyNote, 'id' | 'title' | 'content' | 'tags'>[], titles: { books?: Map<string, string> } = {}): KnowledgeGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  // Notes go in first with their own titles; a link never renames a node that already exists.
  for (const note of notes) nodes.set(`note:${note.id}`, { id: `note:${note.id}`, kind: 'note', label: note.title || note.content.slice(0, 40), target: `note:${note.id}` });
  for (const note of notes) {
    const source = `note:${note.id}`;
    for (const link of studyLinks(note.content)) {
      const node = graphNodeFor(link.target, link.label);
      if (!node || node.id === source) continue;
      if (node.kind === 'book') node.label = titles.books?.get(node.id.slice(5)) ?? node.label;
      if (!nodes.has(node.id)) nodes.set(node.id, node);
      const key = [source, node.id].sort().join('|');
      const existing = edges.get(key);
      // One line per pair; a typed relationship on any of their links names it (the first one written wins).
      if (!existing) edges.set(key, { source, target: node.id, kind: link.embed ? 'embed' : 'link', ...(link.relation ? { relation: link.relation } : {}) });
      else if (!existing.relation && link.relation) edges.set(key, { source, target: node.id, kind: existing.kind, relation: link.relation });
    }
    for (const tag of note.tags) {
      const id = `tag:${tag}`;
      if (!nodes.has(id)) nodes.set(id, { id, kind: 'tag', label: `#${tag}` });
      edges.set(`${source}|${id}`, { source, target: id, kind: 'tag' });
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** The part of the graph around one node: it, its neighbours, and the links among them. */
export function localGraph(graph: KnowledgeGraph, center: string, depth = 1): KnowledgeGraph {
  const keep = new Set([center]);
  let frontier = new Set([center]);
  for (let step = 0; step < depth; step++) {
    const next = new Set<string>();
    for (const edge of graph.edges) {
      if (frontier.has(edge.source) && !keep.has(edge.target)) next.add(edge.target);
      if (frontier.has(edge.target) && !keep.has(edge.source)) next.add(edge.source);
    }
    for (const id of next) keep.add(id);
    frontier = next;
  }
  return { nodes: graph.nodes.filter(node => keep.has(node.id)), edges: graph.edges.filter(edge => keep.has(edge.source) && keep.has(edge.target)) };
}

/** Relationships present in a graph, with how many lines each has, most common first. */
export function graphRelations(graph: KnowledgeGraph): { relation: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const edge of graph.edges) if (edge.relation) counts.set(edge.relation, (counts.get(edge.relation) ?? 0) + 1);
  return [...counts].map(([relation, count]) => ({ relation, count })).sort((a, b) => b.count - a.count || a.relation.localeCompare(b.relation));
}

/**
 * Only the lines with the chosen relationships, and the dots they join. `keep` (the note the map is about)
 * always stays, so the map never goes empty around it. An empty choice means no filter.
 */
export function filterByRelations(graph: KnowledgeGraph, relations: ReadonlySet<string>, keep?: string): KnowledgeGraph {
  if (!relations.size) return graph;
  const edges = graph.edges.filter(edge => edge.relation && relations.has(edge.relation));
  const ids = new Set(edges.flatMap(edge => [edge.source, edge.target]));
  if (keep) ids.add(keep);
  return { nodes: graph.nodes.filter(node => ids.has(node.id)), edges };
}

/** How many connections a node has; the local button is greyed out at zero. */
export function connectionCount(graph: KnowledgeGraph, id: string): number {
  return graph.edges.filter(edge => edge.source === id || edge.target === id).length;
}
