import type { ManuscriptsAPI, ManuscriptSave } from '../../../shared/manuscripts';

/** One controller per open document. RE-2 awaits documentSwitch/close before leaving. */
export function createManuscriptPersistence(
  api: Pick<ManuscriptsAPI, 'save' | 'checkpoint'>,
  documentId: string,
  onError: (error: unknown) => void,
) {
  let draft: ManuscriptSave | undefined;
  let saved: ManuscriptSave | undefined;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let closing = false;
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  };
  const saveLatest = async () => {
    const value = draft;
    if (value && value !== saved) {
      await api.save(value);
      saved = value;
    }
  };
  const flush = () => {
    clearTimeout(pending);
    return enqueue(saveLatest);
  };
  const checkpoint = () => {
    clearTimeout(pending);
    return enqueue(async () => { await saveLatest(); await api.checkpoint(documentId); });
  };
  const timerTick = () => { void checkpoint().catch(onError); };
  let interval = setInterval(timerTick, 10 * 60 * 1000);
  const close = async () => {
    if (closed) return;
    closing = true;
    clearInterval(interval);
    try { await checkpoint(); closed = true; }
    catch (error) { closing = false; interval = setInterval(timerTick, 10 * 60 * 1000); throw error; }
  };
  return {
    change(snapshot: string, primary_mode?: ManuscriptSave['primary_mode']) {
      if (closed || closing) throw new Error('manuscript-controller-closed');
      draft = { id: documentId, snapshot, primary_mode };
      clearTimeout(pending);
      pending = setTimeout(() => { void flush().catch(onError); }, 1500);
    },
    flush,
    explicitSave: checkpoint,
    documentSwitch: close,
    close,
  };
}
