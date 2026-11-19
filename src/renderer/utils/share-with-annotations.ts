/**
 * KEY-429: Collects the user's own comments, highlights, notes, and connections for a passage,
 * workspace tab, or personal list item, and formats them using `src/shared/share-annotations.ts`.
 */
import type { TranslationKey } from '../translations';
import { translations } from '../translations';
import { SURAH_NAMES_AR, SURAH_NAMES_EN } from '../../shared/quran-wird';
import { collectionKeys } from './sunnah-collections';
import { colorKeys } from '../components/reader/ReaderMarkupBar';
import {
  WORKSPACE_PREFS_SETTING,
  currentLocation,
  parsePrefs,
  type TabsState,
  type WorkspaceTab,
} from '../../shared/workspace-tabs';
import { inBarOrder } from '../../shared/workspace-tab-selection';
import { formatDeepLink } from '../../shared/deep-link';
import type { KnowledgeItemDTO } from '../../shared/types/knowledge';
import type { StudyNote } from '../../shared/study-notes';
import type { CommentaryEntry } from '../../shared/personal-commentary';
import {
  EMPTY_SHARE_ANNOTATIONS,
  collectNotesAndConnections,
  formatWithAnnotations,
  normalizeTargetForMatch,
  type ShareAnnotationLabels,
  type ShareAnnotations,
  type ShareHighlightItem,
} from '../../shared/share-annotations';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

const RELATION_KEYS: Record<string, TranslationKey> = {
  supports: 'relationSupports',
  refutes: 'relationRefutes',
  explains: 'relationExplains',
  answers: 'relationAnswers',
  example: 'relationExample',
  contrasts: 'relationContrasts',
  questions: 'relationQuestions',
};

export function annotationLabels(t: Translate): ShareAnnotationLabels {
  return {
    myNotesHeading: t('shareMyNotesHeading'),
    highlightsLabel: t('shareHighlightsLabel'),
    commentsLabel: t('shareCommentsLabel'),
    notesLabel: t('shareNotesLabel'),
    connectionsLabel: t('shareConnectionsLabel'),
  };
}

export async function getShareSourceOnlyPref(): Promise<boolean> {
  try {
    const raw = await window.electronAPI?.settings?.get(WORKSPACE_PREFS_SETTING);
    return parsePrefs(raw).shareSourceOnly;
  } catch {
    return false;
  }
}

function surahNameResolver(lang: string) {
  const names = lang === 'ar' ? SURAH_NAMES_AR : SURAH_NAMES_EN;
  return (surah: number) => names[surah - 1] || `${surah}`;
}

function collectionNameResolver(t: Translate) {
  return (collection: string) => {
    const key = collectionKeys[collection as keyof typeof collectionKeys];
    return key ? t(key) : collection;
  };
}

function relationLabelResolver(t: Translate) {
  return (relation: string) => {
    const key = RELATION_KEYS[relation];
    return key ? t(key) : relation;
  };
}

function colorLabelFor(color: string | undefined, t: Translate): string | undefined {
  if (!color) return undefined;
  const key = colorKeys[color];
  return key ? t(key) : color;
}

function knowledgeMatchesPage(item: KnowledgeItemDTO, page: number): boolean {
  const loc = (item.location || '').trim();
  if (!loc) return false;
  if (loc === String(page)) return true;
  if (loc.startsWith('{')) {
    try {
      const parsed = JSON.parse(loc) as { page?: number };
      return parsed.page === page;
    } catch {
      return false;
    }
  }
  return false;
}

function expandMatchTargets(target: string): string[] {
  const targets = [target];
  const quranRange = /^quran:(hafs|warsh):(\d{1,3}):(\d{1,3})-(\d{1,3})$/u.exec(target);
  if (quranRange) {
    const [, profile, surah, fromStr, toStr] = quranRange;
    const from = Number(fromStr);
    const to = Math.min(Number(toStr), from + 50);
    for (let a = from; a <= to; a++) {
      targets.push(`quran:${profile}:${surah}:${a}`, `quran:${surah}:${a}`);
    }
    return targets;
  }
  const quranSingle = /^quran:(hafs|warsh):(\d{1,3}):(\d{1,3})/u.exec(target);
  if (quranSingle) {
    targets.push(`quran:${quranSingle[2]}:${quranSingle[3]}`);
  }
  return targets;
}

async function loadCommentTexts(knowledgeId: string): Promise<string[]> {
  try {
    const threads = await window.electronAPI?.knowledgeHistory?.comments?.(knowledgeId);
    if (!Array.isArray(threads)) return [];
    const out: string[] = [];
    for (const thread of threads) {
      if (thread.content?.trim()) out.push(thread.content.trim());
      for (const reply of thread.replies ?? []) {
        if (reply.content?.trim()) out.push(reply.content.trim());
      }
    }
    return out;
  } catch {
    return [];
  }
}

export interface TargetAnnotationContext {
  target: string;
  workId?: string;
  page?: number;
  hadithId?: string;
  hadithResearchId?: number;
  extraTargets?: string[];
}

export async function collectAnnotationsForTarget(
  ctx: TargetAnnotationContext,
  lang: string,
  t: Translate,
  preloaded?: { allKnowledge?: KnowledgeItemDTO[]; notes?: StudyNote[] },
): Promise<ShareAnnotations> {
  const matchTargets = [...expandMatchTargets(ctx.target), ...(ctx.extraTargets ?? [])];
  const normalizedTargets = new Set(matchTargets.map(normalizeTargetForMatch));
  const highlights: ShareHighlightItem[] = [];
  const comments: string[] = [];

  // 1. Knowledge items (highlights, inline notes, quotes) + their comment threads
  try {
    let items: KnowledgeItemDTO[] = [];
    if (ctx.workId) {
      const res = await window.electronAPI?.knowledge?.getByWork?.(ctx.workId);
      if (Array.isArray(res)) {
        items = ctx.page !== undefined ? res.filter(item => knowledgeMatchesPage(item, ctx.page!)) : res;
      }
    } else {
      const all = (preloaded?.allKnowledge ?? (await window.electronAPI?.knowledge?.getAll?.()) ?? []) as KnowledgeItemDTO[];
      items = all.filter((item: KnowledgeItemDTO) => {
        const loc = item.location || '';
        return matchTargets.includes(loc) || normalizedTargets.has(normalizeTargetForMatch(loc));
      });
    }
    for (const item of items) {
      const itemComments = await loadCommentTexts(item.id);
      const kind = item.knowledgeType || item.type;
      if (kind === 'highlight' || item.quotedText) {
        highlights.push({
          quotedText: item.quotedText,
          colorLabel: colorLabelFor(item.color, t),
          noteContent: item.noteContent || item.contextNote,
          comments: itemComments,
        });
      } else {
        if (item.noteContent?.trim()) comments.push(item.noteContent.trim());
        else if (item.questionText?.trim()) comments.push(item.questionText.trim());
        comments.push(...itemComments);
      }
    }
  } catch {
    // Best-effort: keep sharing resilient even if an IPC store is unavailable.
  }

  // 2. Personal commentary entries (Quran ayahs / Sunnah hadiths)
  const commentaryRefs = new Set<string>();
  for (const mt of matchTargets) {
    if (/^quran:(?:(?:hafs|warsh):)?\d{1,3}:\d{1,3}$/u.test(mt)) {
      commentaryRefs.add(mt);
      commentaryRefs.add(mt.replace(/^quran:(?:hafs|warsh):/u, 'quran:'));
    }
  }
  if (ctx.hadithResearchId) {
    commentaryRefs.add(`hadith:${ctx.hadithResearchId}`);
  }
  for (const ref of commentaryRefs) {
    try {
      const entries = (await window.electronAPI?.commentary?.list?.(ref)) as CommentaryEntry[] | undefined;
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (entry.text?.trim()) comments.push(entry.text.trim());
        }
      }
    } catch {
      // Ignore unavailable commentary store
    }
  }

  // 3. Hadith local reflection (saved in HadithActions)
  if (ctx.hadithId && typeof localStorage !== 'undefined') {
    try {
      const reflection = localStorage.getItem(`baglib:sunnah:reflection:${ctx.hadithId}`);
      if (reflection && reflection.trim()) {
        comments.push(reflection.trim());
      }
    } catch {
      // Ignore storage errors
    }
  }

  // 4. Study notes & connections touching this target
  let notesList: StudyNote[] = preloaded?.notes ?? [];
  if (!preloaded?.notes) {
    try {
      const loaded = await window.electronAPI?.studyNotes?.list?.();
      if (Array.isArray(loaded)) notesList = loaded;
    } catch {
      notesList = [];
    }
  }
  const { notes, connections } = collectNotesAndConnections(notesList, matchTargets, {
    relationLabel: relationLabelResolver(t),
    surahName: surahNameResolver(lang),
    collectionName: collectionNameResolver(t),
    pageLabel: t('page'),
  });

  return { highlights, comments, notes, connections };
}

export async function formatPassageWithAnnotations(
  sourceText: string,
  ctx: TargetAnnotationContext,
  lang: string,
  t: Translate,
  sourceOnlyOverride?: boolean,
): Promise<string> {
  const sourceOnly = sourceOnlyOverride ?? (await getShareSourceOnlyPref());
  if (sourceOnly) return sourceText;
  const annotations = await collectAnnotationsForTarget(ctx, lang, t);
  return formatWithAnnotations(sourceText, annotations, annotationLabels(t), false);
}

export function targetContextFromStudyTarget(target: string): TargetAnnotationContext {
  const bookPage = /^book:([^#]+)#p=(\d+)/u.exec(target);
  if (bookPage) {
    return { target, workId: bookPage[1], page: Number(bookPage[2]) };
  }
  const bookOnly = /^book:([^#]+)/u.exec(target);
  if (bookOnly) {
    return { target, workId: bookOnly[1] };
  }
  const sunnah = /^sunnah:[^:]+:\d+:([^#]+)/u.exec(target);
  if (sunnah) {
    return { target, hadithId: sunnah[1] };
  }
  return { target };
}

export async function formatTabsLinksWithAnnotations(
  state: TabsState,
  targets: readonly string[],
  label: (tab: WorkspaceTab) => string,
  lang: string,
  t: Translate,
  sourceOnlyOverride?: boolean,
): Promise<string> {
  const sourceOnly = sourceOnlyOverride ?? (await getShareSourceOnlyPref());
  const ordered = inBarOrder(state, targets).map((id: string) => state.tabs.find((tab: WorkspaceTab) => tab.id === id)!);
  const plainLines = ordered.map((tab: WorkspaceTab) => {
    const target = currentLocation(tab).target;
    const title = label(tab);
    return target ? `${title} ${formatDeepLink(target)}` : title;
  });
  if (sourceOnly) return plainLines.join('\n');

  const [allKnowledge, notes] = await Promise.all([
    window.electronAPI?.knowledge?.getAll?.().catch(() => []) as Promise<KnowledgeItemDTO[]>,
    window.electronAPI?.studyNotes?.list?.().catch(() => []) as Promise<StudyNote[]>,
  ]);
  const labels = annotationLabels(t);
  const blocks: string[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const target = currentLocation(ordered[i]).target;
    const base = plainLines[i];
    if (!target) {
      blocks.push(base);
      continue;
    }
    const annotations = await collectAnnotationsForTarget(targetContextFromStudyTarget(target), lang, t, { allKnowledge, notes });
    blocks.push(formatWithAnnotations(base, annotations, labels, false));
  }
  return blocks.join('\n\n');
}

export async function formatListShareText(
  listTitle: string,
  items: ReadonlyArray<{ itemRef: string; label?: string }>,
  lang: string,
  t: Translate,
  sourceOnlyOverride?: boolean,
): Promise<string> {
  const sourceOnly = sourceOnlyOverride ?? (await getShareSourceOnlyPref());
  const plainItems = items.map(item => {
    const title = (item.label || item.itemRef).trim();
    return `${title} ${formatDeepLink(item.itemRef)}`;
  });
  if (sourceOnly) {
    return [listTitle, ...plainItems].join('\n');
  }
  const [allKnowledge, notes] = await Promise.all([
    window.electronAPI?.knowledge?.getAll?.().catch(() => []) as Promise<KnowledgeItemDTO[]>,
    window.electronAPI?.studyNotes?.list?.().catch(() => []) as Promise<StudyNote[]>,
  ]);
  const labels = annotationLabels(t);
  const blocks: string[] = [listTitle];
  for (let i = 0; i < items.length; i++) {
    const annotations = await collectAnnotationsForTarget(
      targetContextFromStudyTarget(items[i].itemRef),
      lang,
      t,
      { allKnowledge, notes },
    );
    blocks.push(formatWithAnnotations(plainItems[i], annotations, labels, false));
  }
  return blocks.join('\n\n');
}

export { EMPTY_SHARE_ANNOTATIONS };
