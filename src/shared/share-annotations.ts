/**
 * KEY-429: Pure formatter for sharing and copying passages, tabs, and lists with the user's own
 * comments, highlights, notes, and connections. Kept free of DOM/IPC so Node unit tests can
 * verify every case directly.
 */
import { studyLinks, type StudyNote } from './study-notes';

export interface ShareHighlightItem {
  quotedText?: string;
  colorLabel?: string;
  noteContent?: string;
  comments: string[];
}

export interface ShareNoteItem {
  title: string;
  excerpt?: string;
}

export interface ShareConnectionItem {
  relationLabel?: string;
  targetLabel: string;
}

export interface ShareAnnotations {
  highlights: ShareHighlightItem[];
  comments: string[];
  notes: ShareNoteItem[];
  connections: ShareConnectionItem[];
}

export interface ShareAnnotationLabels {
  myNotesHeading: string;
  highlightsLabel: string;
  commentsLabel: string;
  notesLabel: string;
  connectionsLabel: string;
}

export const EMPTY_SHARE_ANNOTATIONS: ShareAnnotations = {
  highlights: [],
  comments: [],
  notes: [],
  connections: [],
};

export function hasShareAnnotations(annotations: ShareAnnotations): boolean {
  return (
    annotations.highlights.length > 0 ||
    annotations.comments.length > 0 ||
    annotations.notes.length > 0 ||
    annotations.connections.length > 0
  );
}

/**
 * Formats a readable reference for a study target (never exposing raw internal UUIDs/IDs when a
 * human-readable form can be derived).
 */
export function formatReadableTarget(
  target: string,
  options: {
    label?: string;
    noteTitles?: ReadonlyMap<string, string>;
    surahName?: (surah: number) => string;
    collectionName?: (collection: string) => string;
    pageLabel?: string;
  } = {},
): string {
  if (options.label && options.label.trim() && options.label.trim() !== target) {
    return options.label.trim();
  }
  const quran = /^quran:(?:(?:hafs|warsh):)?(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?/u.exec(target);
  if (quran) {
    const surah = Number(quran[1]);
    const from = Number(quran[2]);
    const to = quran[3] ? Number(quran[3]) : undefined;
    const name = options.surahName?.(surah) || `${surah}`;
    return to && to !== from ? `${name} ${surah}:${from}-${to}` : `${name} ${surah}:${from}`;
  }
  const sunnah = /^sunnah:([a-z0-9_-]+):(\d+):([^#]+)/iu.exec(target);
  if (sunnah) {
    const col = options.collectionName?.(sunnah[1]) || sunnah[1];
    return `${col} ${sunnah[3]}`;
  }
  const hadith = /^hadith:(\d+)/u.exec(target);
  if (hadith) {
    return `Hadith ${hadith[1]}`;
  }
  const note = /^note:([^#]+)/u.exec(target);
  if (note) {
    return options.noteTitles?.get(note[1]) || note[1];
  }
  const book = /^book:([^#]+)(?:#p=(\d+))?/u.exec(target);
  if (book) {
    const pagePrefix = options.pageLabel || 'p.';
    return book[2] ? `${pagePrefix} ${book[2]}` : book[1];
  }
  return target;
}

/**
 * Normalizes a Quran target so `quran:hafs:2:153` and `quran:2:153` match consistently.
 */
export function normalizeTargetForMatch(target: string): string {
  const quranWord = /^quran:(?:hafs|warsh):(\d{1,3}:\d{1,3}):\d+-\d+:\d+:\d+$/u.exec(target);
  if (quranWord) return `quran:${quranWord[1]}`;
  return target.replace(/^quran:(?:hafs|warsh):(\d)/u, 'quran:$1').split('#')[0];
}

/**
 * Collects notes and connections touching any of `matchTargets` from the user's `StudyNote`s.
 */
export function collectNotesAndConnections(
  notes: readonly StudyNote[],
  matchTargets: readonly string[],
  options: {
    relationLabel?: (relation: string) => string;
    surahName?: (surah: number) => string;
    collectionName?: (collection: string) => string;
    pageLabel?: string;
  } = {},
): { notes: ShareNoteItem[]; connections: ShareConnectionItem[] } {
  const normalizedSet = new Set(matchTargets.map(normalizeTargetForMatch));
  const exactSet = new Set(matchTargets);
  const noteTitles = new Map(notes.map(n => [n.id, n.title || n.id]));
  const matchedNotes: ShareNoteItem[] = [];
  const connections: ShareConnectionItem[] = [];
  const seenConnections = new Set<string>();

  const matches = (target: string): boolean => {
    if (exactSet.has(target)) return true;
    const norm = normalizeTargetForMatch(target);
    return normalizedSet.has(norm);
  };

  for (const note of notes) {
    const links = studyLinks(note.content || '');
    const touches = links.some(link => matches(link.target));
    if (!touches) continue;

    const cleanContent = (note.content || '')
      .replace(/!?\[\[[^\]]+\]\]/gu, '')
      .replace(/\s+/gu, ' ')
      .trim();
    matchedNotes.push({
      title: note.title || '',
      excerpt: cleanContent ? cleanContent.slice(0, 220) : undefined,
    });

    for (const link of links) {
      if (matches(link.target)) {
        const rel = link.relation ? (options.relationLabel?.(link.relation) || link.relation) : undefined;
        // Include the note itself as a connected item if it has a relation, and any sibling links in the same note.
        if (rel) {
          const noteTitle = note.title || '';
          if (noteTitle) {
            const key = `${rel}::note:${note.id}`;
            if (!seenConnections.has(key)) {
              seenConnections.add(key);
              connections.push({ relationLabel: rel, targetLabel: noteTitle });
            }
          }
        }
      } else {
        const rel = link.relation ? (options.relationLabel?.(link.relation) || link.relation) : undefined;
        const targetLabel = formatReadableTarget(link.target, {
          label: link.label,
          noteTitles,
          surahName: options.surahName,
          collectionName: options.collectionName,
          pageLabel: options.pageLabel,
        });
        const key = `${rel || ''}::${targetLabel}`;
        if (!seenConnections.has(key)) {
          seenConnections.add(key);
          connections.push({ ...(rel ? { relationLabel: rel } : {}), targetLabel });
        }
      }
    }
  }

  return { notes: matchedNotes, connections };
}

/**
 * Formats a single source passage/item with its annotations.
 * When `sourceOnly` is true or there are no annotations, returns `sourceText` unchanged.
 */
export function formatWithAnnotations(
  sourceText: string,
  annotations: ShareAnnotations,
  labels: ShareAnnotationLabels,
  sourceOnly: boolean,
): string {
  if (sourceOnly || !hasShareAnnotations(annotations)) {
    return sourceText;
  }

  const lines: string[] = [];
  const highlightLines: string[] = [];
  for (const h of annotations.highlights) {
    const quote = h.quotedText ? `"${h.quotedText.trim()}"` : '';
    const prefix = h.colorLabel ? `[${h.colorLabel}] ` : '';
    const summary = `${prefix}${quote}`.trim();
    if (summary) highlightLines.push(`- ${summary}`);
    if (h.noteContent && h.noteContent.trim()) {
      highlightLines.push(`  • ${h.noteContent.trim()}`);
    }
    for (const c of h.comments) {
      if (c.trim()) highlightLines.push(`  • ${c.trim()}`);
    }
  }
  if (highlightLines.length > 0) {
    lines.push(`${labels.highlightsLabel}:`, ...highlightLines);
  }

  const commentLines = annotations.comments.map(c => c.trim()).filter(Boolean).map(c => `- ${c}`);
  if (commentLines.length > 0) {
    lines.push(`${labels.commentsLabel}:`, ...commentLines);
  }

  const noteLines = annotations.notes
    .map(n => (n.excerpt ? `${n.title}: ${n.excerpt}` : n.title).trim())
    .filter(Boolean)
    .map(entry => `- ${entry}`);
  if (noteLines.length > 0) {
    lines.push(`${labels.notesLabel}:`, ...noteLines);
  }

  const connectionLines = annotations.connections
    .map(conn => `↔ ${conn.relationLabel ? `${conn.relationLabel} ` : ''}${conn.targetLabel}`.trim())
    .filter(line => line.length > 1);
  if (connectionLines.length > 0) {
    lines.push(`${labels.connectionsLabel}:`, ...connectionLines);
  }

  if (lines.length === 0) return sourceText;
  return `${sourceText}\n\n${labels.myNotesHeading}\n${lines.join('\n')}`;
}
