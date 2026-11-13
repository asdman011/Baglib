import type { Board } from './boards';
import { studyLinkText } from './study-notes';

/** Translated words for a board export, passed by the caller so this module holds no user-facing strings. */
export interface BoardNoteWords { untitled: string; connections: string }

type BoardNoteItem = Board['items'][number];
type BoardNoteEdge = Board['edges'][number];

/** A box's text on one line: every run of newlines becomes one space, then the ends are trimmed. */
const oneLine = (item: BoardNoteItem): string => item.text.replace(/[\r\n]+/gu, ' ').trim();

/** Reading order on the board: top to bottom, then left to right, then by id. */
const byPlace = (a: BoardNoteItem, b: BoardNoteItem): number => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A bullet's text, with the note link when the box points at a study target. */
const bulletText = (item: BoardNoteItem): string => {
  const text = oneLine(item);
  const link = item.target ? studyLinkText(item.target, item.label || text || item.target) : '';
  return [text, link].filter(Boolean).join(' ') || '—';
};

/**
 * Turns a board (or the selected boxes) into a Markdown note: a title, an outline of nested bullets
 * following the arrows as if they were undirected, and a list of the labelled arrows.
 */
export function boardToNoteMarkdown(board: Pick<Board, 'title' | 'items' | 'edges'>, words: BoardNoteWords, selection?: Iterable<string>): string {
  const chosen = selection === undefined ? undefined : new Set(selection);
  const items = board.items.filter(item => !chosen || chosen.has(item.id));
  const byId = new Map(items.map(item => [item.id, item] as const));
  const edges = board.edges.filter(edge => edge.from !== edge.to && byId.has(edge.from) && byId.has(edge.to));

  const neighbours = new Map<string, Set<string>>(items.map(item => [item.id, new Set<string>()] as const));
  for (const edge of edges) {
    neighbours.get(edge.from)?.add(edge.to);
    neighbours.get(edge.to)?.add(edge.from);
  }
  const connections = (id: string): number => neighbours.get(id)?.size ?? 0;

  // Roots: the best-connected box first, then the same for whatever the first outline did not reach.
  const rootOrder = [...items].sort((a, b) => connections(b.id) - connections(a.id) || byPlace(a, b));
  const lines: string[] = [];
  const listed = new Set<string>();
  for (const root of rootOrder) {
    if (listed.has(root.id)) continue;
    listed.add(root.id);
    const stack: { id: string; depth: number }[] = [{ id: root.id, depth: 0 }];
    while (stack.length) {
      const current = stack.pop();
      if (!current) break;
      const item = byId.get(current.id);
      if (!item) continue;
      lines.push(`${'  '.repeat(current.depth)}- ${bulletText(item)}`);
      const children = [...(neighbours.get(current.id) ?? [])]
        .filter(id => !listed.has(id))
        .map(id => byId.get(id))
        .filter((child): child is BoardNoteItem => !!child)
        .sort(byPlace);
      for (let index = children.length - 1; index >= 0; index--) {
        listed.add(children[index].id);
        stack.push({ id: children[index].id, depth: current.depth + 1 });
      }
    }
  }

  const labelled: BoardNoteEdge[] = edges.filter(edge => edge.label.trim() !== '');
  if (labelled.length) {
    const plain = (id: string): string => {
      const item = byId.get(id);
      return (item ? oneLine(item) : '') || '—';
    };
    lines.push('', `## ${words.connections}`, '');
    for (const edge of labelled) lines.push(`- ${plain(edge.from)} → ${edge.label.trim()} → ${plain(edge.to)}`);
  }

  const title = board.title.trim() || words.untitled;
  return `${[`# ${title}`, '', ...lines].join('\n').replace(/\n+$/u, '')}\n`;
}
