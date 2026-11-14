/** Cancellation belongs to one renderer request; normal corpus readers are never interrupted. */
const cancelled = new Set<string>();
const jobs = new Map<string, Set<() => void>>();
export function registerSlashJob(id: string, cancel: () => void): () => void {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('invalid-request');
  if (cancelled.has(id)) { cancel(); throw new Error('cancelled'); }
  const entries = jobs.get(id) ?? new Set<() => void>();
  entries.add(cancel); jobs.set(id, entries);
  return () => { entries.delete(cancel); if (!entries.size) jobs.delete(id); };
}
export function cancelSlashJobs(id: unknown): void {
  if (typeof id !== 'string') return;
  cancelled.add(id); if (cancelled.size > 256) cancelled.delete(cancelled.values().next().value!);
  const entries = jobs.get(id); jobs.delete(id);
  for (const cancel of entries ?? []) cancel();
}

/**
 * One slash search at a time per engine. A cancelled request is answered at once and dropped, but the engine is never
 * stopped: reopening a corpus costs seconds (the Sunnah corpus about 7 s), so stopping it on each keystroke made the
 * newest results wait for a cold start. A running stale search finishes in the background; a queued one is skipped.
 */
export function slashLane(): <T>(id: string, job: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(id: string, job: () => Promise<T>) => {
    let cancelled = false;
    let abort!: (error: Error) => void;
    const aborted = new Promise<never>((_, reject) => { abort = reject; });
    const release = registerSlashJob(id, () => { cancelled = true; abort(new Error('cancelled')); });
    const turn = tail.then(() => cancelled ? undefined as T : job());
    tail = turn.catch(() => undefined);
    return Promise.race([turn, aborted]).finally(release);
  };
}
