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
    setMode(mode: import('../../../shared/manuscripts').ManuscriptMode) {
      return serialize(async () => {
        if (!session?.setMode) return;
        await session.setMode(mode);
        if (document) {
          controller?.change(document.snapshot, mode);
        }
      });
    },
    arrangeSources(options?: { lang?: 'ar' | 'en' }) {
      return serialize(async () => {
        if (!session?.arrangeSources) return { arranged: false, counts: {}, frameIds: [] };
        const res = await session.arrangeSources({ lang: appearance.lang, ...options });
        if (document && res.arranged) {
          controller?.change(document.snapshot, 'edgeless');
        }
        return res;
      });
    },
    undoArrange() {
      return serialize(async () => {
        if (!session?.undoArrange) return false;
        const res = await session.undoArrange();
        if (document && res) {
          controller?.change(document.snapshot, 'page');
        }
        return res;
      });
    },
    insertSource(kind: string, props: Record<string, unknown>) {
      return serialize(async () => {
        if (!session?.insertSource) throw new Error('insert-unavailable');
        return session.insertSource(kind, props);
      });
    },
    selectedText() {
      return session?.selectedText?.() ?? '';
    },
    insertParagraphs(text: string) {
      return serialize(async () => {
        if (!session?.insertParagraphs) throw new Error('insert-unavailable');
        return session.insertParagraphs(text);
      });
    },
    insertKanban(title?: string) {
      return serialize(async () => {
        if (!session?.insertKanban) return '';
        return session.insertKanban(title);
      });
    },
    fitToScreen() {
      return serialize(async () => {
        session?.fitToScreen?.();
      });
    },
    exportSources() {
      return serialize(async () => {
        if (!session?.exportSources) return { markdown: '', html: '' };
        return session.exportSources();
      });
    },
    scrollToBlock(blockId: string) {
      return serialize(async () => {
        session?.scrollToBlock?.(blockId);
      });
    },
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
