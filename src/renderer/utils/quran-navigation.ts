export interface QuranNavigationTarget { script: string; surah: number; ayah: number; }
let pending: QuranNavigationTarget | null = null;
export const QURAN_OPEN_EVENT = 'baglib:quran-open';

export function openQuranAyah(target: QuranNavigationTarget): void {
  if (typeof target.script !== 'string' || !Number.isInteger(target.surah) || target.surah < 1 || target.surah > 114 || !Number.isInteger(target.ayah) || target.ayah < 1 || target.ayah > 300) return;
  pending = { ...target };
  window.dispatchEvent(new CustomEvent(QURAN_OPEN_EVENT));
}

export function consumeQuranAyah(): QuranNavigationTarget | null {
  const target = pending;
  pending = null;
  return target;
}
