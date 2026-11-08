import fs from 'node:fs';
import path from 'node:path';
import { boardSummary, validateBoardInput, type Board, type BoardSummary } from '../../shared/boards';

/** Boards as JSON files, one per board, in `<user data>/boards` (decision S6; no database change). */
export class BoardStore {
  constructor(private readonly folder: string) {}
  private file(id: string) {
    if (!/^[A-Za-z0-9-]{1,64}$/u.test(id)) throw new Error('invalid-board');
    return path.join(this.folder, `${id}.json`);
  }
  private read(file: string): Board | null {
    try {
      const board = JSON.parse(fs.readFileSync(file, 'utf8')) as Board;
      return board && typeof board.id === 'string' && Array.isArray(board.items) && Array.isArray(board.edges) ? board : null;
    } catch { return null; }
  }
  list(): BoardSummary[] {
    if (!fs.existsSync(this.folder)) return [];
    return fs.readdirSync(this.folder).filter(name => name.endsWith('.json'))
      .map(name => this.read(path.join(this.folder, name))).filter((board): board is Board => Boolean(board))
      .map(boardSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  get(id: string): Board | null {
    const file = this.file(id);
    return fs.existsSync(file) ? this.read(file) : null;
  }
  /** Saves when `expectedRevision` matches the stored one (0 for a new board); another window's newer save wins. */
  save(raw: unknown, now = new Date()): Board {
    const input = validateBoardInput(raw);
    const file = this.file(input.id);
    const previous = fs.existsSync(file) ? this.read(file) : null;
    if ((previous?.revision ?? 0) !== input.expectedRevision) throw new Error('board-conflict');
    const board: Board = {
      id: input.id, title: input.title, preset: input.preset, items: input.items, edges: input.edges,
      createdAt: previous?.createdAt ?? now.toISOString(), updatedAt: now.toISOString(), revision: input.expectedRevision + 1,
    };
    fs.mkdirSync(this.folder, { recursive: true });
    // Write beside, then rename over: a crash mid-write never leaves half a board.
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(board), 'utf8');
    fs.renameSync(temporary, file);
    return board;
  }
  /** Deleting moves the file to `boards/deleted`, so a board removed by mistake can still be recovered by hand. */
  remove(id: string): void {
    const file = this.file(id);
    if (!fs.existsSync(file)) return;
    const bin = path.join(this.folder, 'deleted');
    fs.mkdirSync(bin, { recursive: true });
    fs.renameSync(file, path.join(bin, `${id}-${Date.now()}.json`));
  }
}
