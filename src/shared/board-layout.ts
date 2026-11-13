import type { BoardEdge, BoardItem } from './boards';

/**
 * Auto-layout for mind-map boards: the cards of a tree are placed in columns that grow with the
 * reading direction, so an Arabic board flows right-to-left and an English one left-to-right.
 * The work is pure maths on coordinates; it never touches the DOM, so the renderer can call it
 * before it draws and the main process can reuse it.
 */

/** Gaps between columns (levelGap) and between stacked siblings (siblingGap), in board pixels. */
export const TREE_LAYOUT_DEFAULTS = { levelGap: 80, siblingGap: 24 } as const;

export interface TreeLayoutOptions {
  /** Id of the card the tree grows from. Cards that cannot be reached from it are left alone. */
  rootId: string;
  /** 'ltr' grows to the right of the root, 'rtl' grows to the left. */
  direction: 'ltr' | 'rtl';
  /** Space between two columns. Defaults to 80. */
  levelGap?: number;
  /** Space between two stacked siblings. Defaults to 24. */
  siblingGap?: number;
}

interface TreeNode {
  item: BoardItem;
  children: TreeNode[];
}

const gap = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Siblings keep the order they had on the board: top to bottom, then left to right, then by id. */
const byOriginalPosition = (a: BoardItem, b: BoardItem): number =>
  a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Lays a board out as a tree. The tree is grown from `rootId` by following arrows in both
 * directions, so an arrow drawn from a child to its parent still works; each card joins the tree
 * once, which keeps loops (a → b → c → a) harmless. Every card of the tree moves to its own
 * column and to a row that leaves room for its children, and the cards that are not part of the
 * tree are returned untouched. Inputs are never modified.
 */
export function layoutBoardTree(items: BoardItem[], edges: BoardEdge[], options: TreeLayoutOptions): BoardItem[] {
  const levelGap = gap(options.levelGap, TREE_LAYOUT_DEFAULTS.levelGap);
  const siblingGap = gap(options.siblingGap, TREE_LAYOUT_DEFAULTS.siblingGap);

  const byId = new Map<string, BoardItem>();
  for (const item of items) if (!byId.has(item.id)) byId.set(item.id, item);
  const root = byId.get(options.rootId);
  if (!root) return items.map(item => ({ ...item }));

  // Arrows point either way; the tree is grown on the undirected graph.
  const neighbours = new Map<string, string[]>();
  const link = (from: string, to: string): void => {
    if (!byId.has(from) || !byId.has(to)) return;
    const list = neighbours.get(from);
    if (list) list.push(to);
    else neighbours.set(from, [to]);
  };
  for (const edge of edges) {
    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }

  const rootNode: TreeNode = { item: root, children: [] };
  const depth = new Map<string, number>([[root.id, 0]]);
  const visited = new Set<string>([root.id]);
  const levels: TreeNode[][] = [[rootNode]];
  let level: TreeNode[] = [rootNode];
  while (level.length) {
    const next: TreeNode[] = [];
    for (const node of level) {
      const candidates = [...new Set(neighbours.get(node.item.id) ?? [])]
        .filter(id => !visited.has(id))
        .map(id => byId.get(id) as BoardItem)
        .sort(byOriginalPosition);
      for (const candidate of candidates) {
        visited.add(candidate.id);
        depth.set(candidate.id, (depth.get(node.item.id) as number) + 1);
        const child: TreeNode = { item: candidate, children: [] };
        node.children.push(child);
        next.push(child);
      }
    }
    if (!next.length) break;
    levels.push(next);
    level = next;
  }

  // A card needs room for its children: its own height, or the stack of the children, whichever is larger.
  const flat: TreeNode[] = [];
  for (const levelNodes of levels) flat.push(...levelNodes);
  const blockHeight = new Map<string, number>();
  for (let index = flat.length - 1; index >= 0; index -= 1) {
    const node = flat[index];
    let height = node.item.h;
    if (node.children.length) {
      let childrenHeight = siblingGap * (node.children.length - 1);
      for (const child of node.children) childrenHeight += blockHeight.get(child.item.id) as number;
      height = Math.max(node.item.h, childrenHeight);
    }
    blockHeight.set(node.item.id, height);
  }

  // Column d holds the cards of depth d; the next column starts after the widest card of this one.
  const widths = levels.map(levelNodes => levelNodes.reduce((widest, node) => Math.max(widest, node.item.w), 0));
  const columnLeft: number[] = [];
  const columnRight: number[] = [];
  if (options.direction === 'rtl') {
    let right = root.x + root.w;
    columnRight.push(right);
    for (let index = 1; index < widths.length; index += 1) {
      right -= widths[index - 1] + levelGap;
      columnRight.push(right);
    }
  } else {
    let left = root.x;
    columnLeft.push(left);
    for (let index = 1; index < widths.length; index += 1) {
      left += widths[index - 1] + levelGap;
      columnLeft.push(left);
    }
  }
  const columnX = (node: TreeNode): number => {
    const index = depth.get(node.item.id) as number;
    return options.direction === 'rtl' ? (columnRight[index] as number) - node.item.w : (columnLeft[index] as number);
  };

  // The root keeps the vertical centre it had; the children hang under their parent's centre.
  const positions = new Map<string, { x: number; y: number }>();
  const stack: Array<{ node: TreeNode; top: number }> = [
    { node: rootNode, top: root.y + root.h / 2 - (blockHeight.get(root.id) as number) / 2 },
  ];
  while (stack.length) {
    const { node, top } = stack.pop() as { node: TreeNode; top: number };
    const centre = top + (blockHeight.get(node.item.id) as number) / 2;
    positions.set(node.item.id, { x: columnX(node), y: centre - node.item.h / 2 });
    if (!node.children.length) continue;
    let childrenHeight = siblingGap * (node.children.length - 1);
    for (const child of node.children) childrenHeight += blockHeight.get(child.item.id) as number;
    let offset = 0;
    for (const child of node.children) {
      stack.push({ node: child, top: centre - childrenHeight / 2 + offset });
      offset += (blockHeight.get(child.item.id) as number) + siblingGap;
    }
  }

  return items.map(item => {
    const position = positions.get(item.id);
    if (!position) return { ...item };
    return { ...item, x: Math.round(position.x), y: Math.round(position.y) };
  });
}
