export type ReaderOverlay = 'hub' | 'quick-tools' | 'versions' | null;

export function setReaderOverlay(current: ReaderOverlay, target: Exclude<ReaderOverlay, null>, open: boolean): ReaderOverlay {
  return open ? target : current === target ? null : current;
}
