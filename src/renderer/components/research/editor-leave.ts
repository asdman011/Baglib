let leave: (() => Promise<boolean>) | undefined;
export function registerEditorLeave(handler: () => Promise<boolean>): () => void {
  leave = handler;
  return () => { if (leave === handler) leave = undefined; };
}
export function editorLeaveGuard(): (() => Promise<boolean>) | undefined { return leave; }
