import type { QuranAyahTheme } from '../../../shared/types/quran';

/** Combine labels for one verse range without repeating identical source rows. */
export function groupThemeLabels(themes: QuranAyahTheme[]): QuranAyahTheme[] {
  const groups = new Map<string, { first: QuranAyahTheme; labels: Map<string, string> }>();
  for (const theme of themes) {
    const key = `${theme.surahNumber}:${theme.ayahFrom}:${theme.ayahTo}`;
    const group = groups.get(key) ?? { first: theme, labels: new Map<string, string>() };
    // Compare whitespace only: keep Arabic diacritics and distinct spellings intact.
    const label = theme.theme.replace(/\s+/gu, ' ').trim();
    if (label && !group.labels.has(label)) group.labels.set(label, theme.theme.trim());
    groups.set(key, group);
  }
  return [...groups.values()].filter(group => group.labels.size).map(group => ({
    ...group.first, theme: [...group.labels.values()].join('\n'),
  }));
}
