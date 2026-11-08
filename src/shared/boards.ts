import { validStudyTarget } from './study-notes';

/**
 * BagLib's own simple board (decision S6): cards, sticky notes and labelled arrows on a pannable, zoomable
 * surface, with mind-map and argument-map presets. Each board is one JSON file in the user data folder
 * (`boards/<id>.json`), not in `baglib.db`, so no schema change. Cards may point at a note, book page, ayah,
 * hadith, poem or lecture moment with the same study targets notes use.
 */
export type BoardItemKind = 'card' | 'sticky';
export type BoardColor = 'amber' | 'sky' | 'emerald' | 'rose' | 'violet' | 'slate';
export const BOARD_COLORS: BoardColor[] = ['amber', 'sky', 'emerald', 'rose', 'violet', 'slate'];
export interface BoardItem { id: string; kind: BoardItemKind; x: number; y: number; w: number; h: number; text: string; color: BoardColor; target?: string; label?: string }
export interface BoardEdge { id: string; from: string; to: string; label: string }
export type BoardPreset = 'blank' | 'mind' | 'argument';
export interface Board { id: string; title: string; preset: BoardPreset; items: BoardItem[]; edges: BoardEdge[]; createdAt: string; updatedAt: string; revision: number }
export interface BoardSummary { id: string; title: string; preset: BoardPreset; items: number; updatedAt: string }
export type BoardInput = Pick<Board, 'id' | 'title' | 'preset' | 'items' | 'edges'> & { expectedRevision: number };

export const BOARD_LIMITS = { items: 2000, edges: 4000, text: 4000, title: 200, label: 200, coordinate: 1_000_000 } as const;
const ID = /^[A-Za-z0-9-]{1,64}$/u;

const fail = (): never => { throw new Error('invalid-board'); };
const str = (value: unknown, max: number): string => (typeof value === 'string' && value.length <= max ? value : fail());
const num = (value: unknown, min: number, max: number): number => (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? Math.round(value) : fail());

/** Checks a board from the renderer before it is written; unknown fields are dropped. */
export function validateBoardInput(input: unknown): BoardInput {
  if (!input || typeof input !== 'object') fail();
  const value = input as Record<string, unknown>;
  const id = str(value.id, 64);
  if (!ID.test(id)) fail();
  const preset = (['blank', 'mind', 'argument'] as const).find(name => name === value.preset) ?? fail();
  if (!Array.isArray(value.items) || value.items.length > BOARD_LIMITS.items) fail();
  if (!Array.isArray(value.edges) || value.edges.length > BOARD_LIMITS.edges) fail();
  const seen = new Set<string>();
  const items = (value.items as unknown[]).map(raw => {
    if (!raw || typeof raw !== 'object') fail();
    const item = raw as Record<string, unknown>;
    const itemId = str(item.id, 64);
    if (!ID.test(itemId) || seen.has(itemId)) fail();
    seen.add(itemId);
    const kind = (['card', 'sticky'] as const).find(name => name === item.kind) ?? fail();
    const color = BOARD_COLORS.find(name => name === item.color) ?? fail();
    const target = item.target === undefined ? undefined : str(item.target, 300);
    if (target !== undefined && !validStudyTarget(target)) fail();
    const label = item.label === undefined ? undefined : str(item.label, BOARD_LIMITS.label);
    const c = BOARD_LIMITS.coordinate;
    return { id: itemId, kind, x: num(item.x, -c, c), y: num(item.y, -c, c), w: num(item.w, 60, 2000), h: num(item.h, 40, 2000), text: str(item.text, BOARD_LIMITS.text), color, ...(target ? { target } : {}), ...(label ? { label } : {}) } satisfies BoardItem;
  });
  const edgeIds = new Set<string>();
  const edges = (value.edges as unknown[]).map(raw => {
    if (!raw || typeof raw !== 'object') fail();
    const edge = raw as Record<string, unknown>;
    const edgeId = str(edge.id, 64);
    if (!ID.test(edgeId) || edgeIds.has(edgeId)) fail();
    edgeIds.add(edgeId);
    const from = str(edge.from, 64), to = str(edge.to, 64);
    if (!seen.has(from) || !seen.has(to) || from === to) fail();
    return { id: edgeId, from, to, label: str(edge.label ?? '', BOARD_LIMITS.label) } satisfies BoardEdge;
  });
  const expectedRevision = num(value.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
  return { id, title: str(value.title, BOARD_LIMITS.title).trim(), preset, items, edges, expectedRevision };
}

export function boardSummary(board: Board): BoardSummary {
  return { id: board.id, title: board.title, preset: board.preset, items: board.items.length, updatedAt: board.updatedAt };
}

/** Words a preset starts with, in the user's language at the moment the board is made. */
export interface PresetWords { centre: string; branch: string; claim: string; reason: string; objection: string; supports: string; opposes: string }

/**
 * A new board's starting items. A mind map is a centre with four branches; an argument map is a claim with
 * a supporting reason and an objection, joined by labelled arrows.
 */
export function presetBoard(preset: BoardPreset, words: PresetWords, newId: () => string): Pick<Board, 'items' | 'edges'> {
  const card = (x: number, y: number, text: string, color: BoardColor, w = 200, h = 90): BoardItem => ({ id: newId(), kind: 'card', x, y, w, h, text, color });
  if (preset === 'mind') {
    const centre = card(0, 0, words.centre, 'amber', 220, 100);
    const branches = [[-320, -170], [320, -170], [-320, 170], [320, 170]].map(([x, y], index) => card(x, y, `${words.branch} ${index + 1}`, 'sky'));
    return { items: [centre, ...branches], edges: branches.map(branch => ({ id: newId(), from: centre.id, to: branch.id, label: '' })) };
  }
  if (preset === 'argument') {
    const claim = card(0, -170, words.claim, 'amber', 260, 100);
    const reason = card(-260, 120, words.reason, 'emerald');
    const objection = card(260, 120, words.objection, 'rose');
    return { items: [claim, reason, objection], edges: [{ id: newId(), from: reason.id, to: claim.id, label: words.supports }, { id: newId(), from: objection.id, to: claim.id, label: words.opposes }] };
  }
  return { items: [], edges: [] };
}

/** Removes an item and every arrow touching it. */
export function removeBoardItems(board: Pick<Board, 'items' | 'edges'>, ids: Set<string>): Pick<Board, 'items' | 'edges'> {
  return { items: board.items.filter(item => !ids.has(item.id)), edges: board.edges.filter(edge => !ids.has(edge.from) && !ids.has(edge.to) && !ids.has(edge.id)) };
}

/** Where an arrow between two boxes meets each box's edge, so the arrowhead is not hidden under the target. */
export function edgeEndpoints(from: BoardItem, to: BoardItem): { x1: number; y1: number; x2: number; y2: number } {
  const centre = (item: BoardItem) => ({ x: item.x + item.w / 2, y: item.y + item.h / 2 });
  const a = centre(from), b = centre(to);
  const clip = (item: BoardItem, start: { x: number; y: number }, end: { x: number; y: number }) => {
    const dx = end.x - start.x, dy = end.y - start.y;
    if (!dx && !dy) return start;
    const scale = Math.min(dx ? (item.w / 2) / Math.abs(dx) : Infinity, dy ? (item.h / 2) / Math.abs(dy) : Infinity);
    return { x: start.x + dx * Math.min(scale, 1), y: start.y + dy * Math.min(scale, 1) };
  };
  const p1 = clip(from, a, b), p2 = clip(to, b, a);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

/** A spot for a new box near `at` that does not cover an existing box: steps down and outward until free. */
export function freeSpot(items: Pick<BoardItem, 'x' | 'y' | 'w' | 'h'>[], at: { x: number; y: number }, size: { w: number; h: number }): { x: number; y: number } {
  const overlaps = (x: number, y: number) => items.some(item => x < item.x + item.w + 16 && x + size.w + 16 > item.x && y < item.y + item.h + 16 && y + size.h + 16 > item.y);
  for (let ring = 0; ring < 12; ring++) {
    const step = ring * 60;
    for (const [dx, dy] of ring ? [[0, step], [step, 0], [-step, 0], [0, -step], [step, step], [-step, step], [step, -step], [-step, -step]] : [[0, 0]]) {
      if (!overlaps(at.x + dx, at.y + dy)) return { x: Math.round(at.x + dx), y: Math.round(at.y + dy) };
    }
  }
  return { x: Math.round(at.x), y: Math.round(at.y) };
}
