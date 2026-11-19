export interface QuranNavigationTarget { script: string; surah: number; ayah: number; tabId?: string; }
export interface QuranPageTarget { script: string; layout: string; page: number; khatmah?: string; tabId?: string; }
export type QuranTarget = QuranNavigationTarget | QuranPageTarget;
let pending: QuranTarget | null = null;
export const QURAN_OPEN_EVENT = 'baglib:quran-open';

export function openQuranAyah(target: QuranNavigationTarget): void {
  if (typeof target.script !== 'string' || !Number.isInteger(target.surah) || target.surah < 1 || target.surah > 114 || !Number.isInteger(target.ayah) || target.ayah < 1 || target.ayah > 300) return;
  pending = { ...target };
  window.dispatchEvent(new CustomEvent(QURAN_OPEN_EVENT, { detail: { tabId: target.tabId } }));
}

export function openQuranPage(target: QuranPageTarget): void {
  if (typeof target.script !== 'string' || !target.script || typeof target.layout !== 'string' || !target.layout || !Number.isInteger(target.page) || target.page < 1 || target.page > 604) return;
  pending = { ...target };
  window.dispatchEvent(new CustomEvent(QURAN_OPEN_EVENT, { detail: { tabId: target.tabId } }));
}

export function consumeQuranAyah(tab?: string | { id: string; isFocused: boolean } | null): QuranTarget | null {
  if (!pending) return null;
  if (tab) {
    if (typeof tab === 'string') {
      if (pending.tabId && pending.tabId !== tab) return null;
    } else if (pending.tabId) {
      if (pending.tabId !== tab.id) return null;
    } else if (!tab.isFocused) {
      return null;
    }
  }
  const target = pending;
  pending = null;
  return target;
}
