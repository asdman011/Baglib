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
