import type { ManuscriptDocument, ManuscriptsAPI } from '../../../shared/manuscripts';
import type { ResearchEditorAppearance, ResearchEditorBridge, ResearchEditorAssets, ResearchEditorSession } from '../../../shared/research-editor';
import { shortcutForEvent, type ShortcutEvent } from '../actions/shortcuts';
import { createManuscriptPersistence } from './manuscript-persistence';

export function shouldForwardEditorShortcut(event: ShortcutEvent): boolean {
  // Plain typing, slash menus, formatting and undo remain local to BlockSuite.
  if (!(event.ctrlKey || event.metaKey || event.altKey || event.key.startsWith('F') || event.key === 'ContextMenu')) return false;
  return Boolean(shortcutForEvent({ key: event.key, code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey, defaultPrevented: event.defaultPrevented, repeat: event.repeat, isComposing: event.isComposing }, 'global'));
}
export function createResearchEditorHost(api: ManuscriptsAPI, blobs: ResearchEditorAssets, initial: ResearchEditorAppearance, onError: (error: unknown) => void) {
  let appearance = initial;
  const listeners = new Set<(value: ResearchEditorAppearance) => void>();
  let session: ResearchEditorSession | undefined;
  let controller: ReturnType<typeof createManuscriptPersistence> | undefined;
  let document: ManuscriptDocument | undefined;
  let operations: Promise<unknown> = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operations.then(operation);
    operations = result.catch(() => undefined);
    return result;
  };
  const bridge: ResearchEditorBridge = {
    appearance: () => appearance,
    subscribeAppearance(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connect(value) { return serialize(async () => { session = value; if (document) await session.load(document); }); },
    change(id, snapshot, mode) { if (document?.id === id) controller?.change(snapshot, mode); },
    async explicitSave() { await session?.flush(); await controller?.explicitSave(); },
    error: onError,
    blobs,
  };
  return {
    bridge,
    activeDocument: () => document,
    renameDocument(id: string, title: string) {
      return serialize(async () => {
        if (document?.id !== id) { await api.renameDocument(id, title); return; }
        session?.setReadonly?.(true);
        try {
          await session?.flush();
          await controller?.explicitSave();
          await api.renameDocument(id, title);
          const latest = await api.document(id);
          await session?.load(latest);
          document = latest;
        } finally { session?.setReadonly?.(false); }
      });
    },
    appearance(value: ResearchEditorAppearance) { appearance = value; listeners.forEach(listener => listener(value)); },
    open(value: ManuscriptDocument) {
      return serialize(async () => {
        session?.setReadonly?.(true);
        const previous = document;
        let closedPrevious = false;
        try {
          await session?.flush();
          await controller?.documentSwitch();
          closedPrevious = true;
          // Read after the pending save, including reopening the current document.
          const latest = await api.document(value.id);
          document = undefined;
          controller = undefined;
          await session?.load(latest);
          document = latest;
          controller = createManuscriptPersistence(api, latest.id, onError);
        } catch (error) {
          document = previous;
          if (previous && closedPrevious) controller = createManuscriptPersistence(api, previous.id, onError);
          throw error;
        } finally { session?.setReadonly?.(false); }
      });
    },
    close() {
      return serialize(async () => {
        session?.setReadonly?.(true);
        try {
          await session?.flush();
          await controller?.close();
          controller = undefined;
          document = undefined;
        } catch (error) { session?.setReadonly?.(false); throw error; }
      });
    },
    dispose() { session?.dispose(); listeners.clear(); },
  };
}
