/**
 * The manuscript editor's "leave with unsaved changes?" guard. KEY-423 review: with several tabs kept alive, each
 * manuscript tab registers its own guard under its tab id, so a second editor tab can't overwrite the first one's
 * guard, and closing a background tab can still ask its own editor. Outside a tab the key is 'default'.
 */
type LeaveGuard = () => Promise<boolean>;
const guards = new Map<string, LeaveGuard>();

export function registerEditorLeave(handler: LeaveGuard, key: string = 'default'): () => void {
  guards.set(key, handler);
  return () => { if (guards.get(key) === handler) guards.delete(key); };
}

/**
 * The guard for a tab's editor. Without a key, the most recently registered guard (the old single-editor
 * behaviour, for callers outside a tab).
 */
export function editorLeaveGuard(key?: string): LeaveGuard | undefined {
  if (key !== undefined) return guards.get(key) ?? guards.get('default');
  return [...guards.values()].at(-1);
}
