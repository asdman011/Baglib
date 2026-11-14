import type { Board } from '../../../shared/boards';
import type { AlignMode } from '../../../shared/board-selection';
import { boardToSvg, BOARD_SVG_LIGHT } from '../../../shared/board-svg';
import { boardEdgeGeometry, parallelEdgeBends, type EdgeShape } from '../../../shared/board-edge-path';

export function alignmentForDirection(mode: AlignMode, direction: 'rtl' | 'ltr'): AlignMode {
  if (direction === 'rtl' && mode === 'start') return 'end';
  if (direction === 'rtl' && mode === 'end') return 'start';
  return mode;
}

export function boardLayoutRoot(board: Pick<Board, 'items' | 'edges'>, selected: readonly string[]): string {
  const selectedRoot = selected.find(id => board.items.some(item => item.id === id));
  if (selectedRoot) return selectedRoot;
  const degree = new Map(board.items.map(item => [item.id, 0]));
  for (const edge of board.edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  return [...board.items].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))[0]?.id ?? '';
}

export function readBoardPreference<T extends boolean | EdgeShape>(key: string, fallback: T): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`baglib.board.${key}`) ?? 'null');
    if (typeof fallback === 'boolean' && typeof value === 'boolean') return value as T;
    if (typeof fallback === 'string' && (value === 'straight' || value === 'curved')) return value as T;
  } catch { /* Unavailable storage leaves the viewer usable. */ }
  return fallback;
}

export function writeBoardPreference(key: string, value: boolean | EdgeShape): void {
  try { localStorage.setItem(`baglib.board.${key}`, JSON.stringify(value)); } catch { /* Convenience preference only. */ }
}

/** Single arrows curve visibly, while a parallel group's centre keeps the shared zero bend. */
export function boardViewBends(edges: Board['edges']): Map<string, number> {
  const bends = parallelEdgeBends(edges);
  const counts = new Map<string, number>();
  const pairKey = (edge: Board['edges'][number]) => [edge.from, edge.to].sort().join('\u0000');
  for (const edge of edges) counts.set(pairKey(edge), (counts.get(pairKey(edge)) ?? 0) + 1);
  for (const edge of edges) {
    if (edge.from !== edge.to && counts.get(pairKey(edge)) === 1) bends.set(edge.id, 40);
  }
  return bends;
}

/** Preserve the shared SVG card/text renderer, applying the viewer's curve geometry to its arrows. */
export function boardImageSvg(board: Board, selection?: string[], shape: EdgeShape = 'straight') {
  const wanted = selection ? new Set(selection) : null;
  const items = board.items.filter(item => !wanted || wanted.has(item.id));
  const byId = new Map(items.map(item => [item.id, item]));
  const edges = board.edges.filter(edge => byId.has(edge.from) && byId.has(edge.to));
  const bends = boardViewBends(edges);
  const padding = shape === 'curved' ? 32 + Math.max(40, ...Array.from(bends.values(), Math.abs)) : 32;
  const result = boardToSvg(board, BOARD_SVG_LIGHT, { padding, selection });
  if (shape === 'straight' || !items.length) return result;
  const shiftX = padding - Math.min(...items.map(item => item.x));
  const shiftY = padding - Math.min(...items.map(item => item.y));
  let index = 0;
  const svg = result.svg.replace(/<line [^>]+\/>(<text [^>]*>[\s\S]*?<\/text>)?/gu, (_line, label: string | undefined) => {
    const edge = edges[index++];
    const from = byId.get(edge.from)!;
    const to = byId.get(edge.to)!;
    const geometry = boardEdgeGeometry(
      { ...from, x: from.x + shiftX, y: from.y + shiftY },
      { ...to, x: to.x + shiftX, y: to.y + shiftY },
      shape,
      bends.get(edge.id) ?? 40,
    );
    const text = label?.replace(/x="[^"]*" y="[^"]*"/u, `x="${geometry.labelX}" y="${geometry.labelY}"`) ?? '';
    return `<path d="${geometry.d}" fill="none" stroke="${BOARD_SVG_LIGHT.edge}" stroke-width="2" marker-end="url(#board-arrow)"/>${text}`;
  });
  return { ...result, svg };
}

export async function exportBoardImage(board: Board, format: 'svg' | 'png', selection?: string[], shape: EdgeShape = 'straight'): Promise<void> {
  await document.fonts.ready;
  const result = boardImageSvg(board, selection, shape);
  let blob = new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' });
  if (format === 'png') {
    const url = URL.createObjectURL(blob);
    try {
      if (result.width * result.height > 16_000_000 || Math.max(result.width, result.height) > 16_000) {
        throw new Error('board-image-too-large');
      }
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = result.width * 2;
      canvas.height = result.height * 2;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('board-image-context');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(value => {
          if (value) resolve(value);
          else reject(new Error('board-image-encode'));
        }, 'image/png');
      });
    } finally { URL.revokeObjectURL(url); }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(board.title || board.id).replace(/[<>:"/\\|?*\x00-\x1f]/gu, '_')}.${format}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
