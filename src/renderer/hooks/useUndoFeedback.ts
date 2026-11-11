'use client';

import { useWorkspace } from '../components/context/WorkspaceContext';
import { useToast } from '../components/ui/Toast';

/** Restore the persisted pre-action revision, guarded against intervening writes. */
export function useUndoFeedback() {
  const { t } = useWorkspace();
  const { showToast } = useToast();
  return async (id: string, operation: () => Promise<unknown>, refresh: () => Promise<unknown> | void) => {
    const history = window.electronAPI.knowledgeHistory;
    const previous = await history?.versions(id).catch(() => []) ?? [];
    await operation();
    const current = await history?.versions(id).catch(() => []) ?? [];
    const revision = previous[0]?.revision;
    const expected = current[0]?.revision;
    showToast({ message: t('feedbackRemoved'), duration: 8000,
      ...(revision && expected && revision !== expected ? { action: { label: t('undo'), onClick: async () => {
        await history.restore(id, revision, expected, true);
        await refresh();
        showToast({ message: t('feedbackRestored'), type: 'success' });
      } } } : {}),
    });
    await refresh();
  };
}
