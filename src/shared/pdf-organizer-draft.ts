export const ORGANIZER_DRAFT_KEY_PREFIX = 'pdf.organizerDraft.v1:';
export const MAX_ORGANIZER_DRAFT_PAGES = 2000;

export interface OrganizerDraftPageEntry {
  page?: number;
  blank?: boolean;
  rotation: number;
  splitAfter?: boolean;
}

export interface OrganizerDraftV1 {
  version: 1;
  sourceId: string;
  sha256: string;
  totalPages: number;
  updatedAt: number;
  pages: OrganizerDraftPageEntry[];
}

export interface OrganizerDraftItemInput {
  id: string;
  page?: number;
  sessionId?: string;
  filename?: string;
  blank?: boolean;
  rotation?: number;
  splitAfter?: boolean;
}

export interface OrganizerRestoredPageItem {
  id: string;
  page?: number;
  sessionId?: string;
  filename?: string;
  blank?: boolean;
  rotation?: number;
  splitAfter?: boolean;
}

export function organizerDraftKey(sourceId: string | null | undefined): string | null {
  if (typeof sourceId !== 'string') return null;
  const trimmed = sourceId.trim();
  if (!trimmed || trimmed.length > 200) return null;
  return `${ORGANIZER_DRAFT_KEY_PREFIX}${trimmed}`;
}

export function normalizeRotation(degrees: number | undefined): number {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return 0;
  const snapped = Math.round(degrees / 90) * 90;
  return ((snapped % 360) + 360) % 360;
}

export function isDefaultOrganizerPlan(
  items: readonly OrganizerDraftItemInput[],
  splitBoundaries: ReadonlySet<string>,
  totalPages: number,
  currentSessionId?: string,
): boolean {
  if (!Number.isSafeInteger(totalPages) || totalPages < 1) return false;
  if (items.length !== totalPages || splitBoundaries.size > 0) return false;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || item.blank === true || item.splitAfter === true) return false;
    if (item.page !== i + 1) return false;
    if (normalizeRotation(item.rotation) !== 0) return false;
    if (currentSessionId && item.sessionId && item.sessionId !== 'current' && item.sessionId !== currentSessionId) {
      return false;
    }
  }
  return true;
}

export function buildOrganizerDraft(input: {
  sourceId: string | null | undefined;
  sha256: string | null | undefined;
  totalPages: number;
  items: readonly OrganizerDraftItemInput[];
  splitBoundaries: ReadonlySet<string>;
  currentSessionId?: string;
  now?: number;
}): OrganizerDraftV1 | null {
  const key = organizerDraftKey(input.sourceId);
  const sha256 = typeof input.sha256 === 'string' ? input.sha256.trim().toLowerCase() : '';
  if (!key || !/^[a-f0-9]{64}$/u.test(sha256)) return null;
  if (!Number.isSafeInteger(input.totalPages) || input.totalPages < 1 || input.totalPages > MAX_ORGANIZER_DRAFT_PAGES) {
    return null;
  }
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > MAX_ORGANIZER_DRAFT_PAGES) {
    return null;
  }
  if (isDefaultOrganizerPlan(input.items, input.splitBoundaries, input.totalPages, input.currentSessionId)) {
    return null;
  }

  const pages: OrganizerDraftPageEntry[] = [];
  for (let index = 0; index < input.items.length; index++) {
    const item = input.items[index];
    if (!item || typeof item !== 'object') return null;
    if (
      input.currentSessionId &&
      item.sessionId &&
      item.sessionId !== 'current' &&
      item.sessionId !== input.currentSessionId
    ) {
      // External merged pages from another temporary session cannot be serialized without their session handle.
      return null;
    }
    const rotation = normalizeRotation(item.rotation);
    const isLast = index === input.items.length - 1;
    const splitAfter = !isLast && (item.splitAfter === true || input.splitBoundaries.has(item.id));
    if (item.blank === true) {
      pages.push({
        blank: true,
        rotation,
        ...(splitAfter ? { splitAfter: true } : {}),
      });
    } else {
      const page = item.page;
      if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1 || page > input.totalPages) {
        return null;
      }
      pages.push({
        page,
        rotation,
        ...(splitAfter ? { splitAfter: true } : {}),
      });
    }
  }

  return {
    version: 1,
    sourceId: input.sourceId!.trim(),
    sha256,
    totalPages: input.totalPages,
    updatedAt: typeof input.now === 'number' && Number.isFinite(input.now) ? input.now : Date.now(),
    pages,
  };
}

export function parseOrganizerDraft(raw: unknown): OrganizerDraftV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  if (candidate.version !== 1) return null;
  if (typeof candidate.sourceId !== 'string' || !candidate.sourceId.trim() || candidate.sourceId.length > 200) {
    return null;
  }
  if (typeof candidate.sha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(candidate.sha256.trim())) {
    return null;
  }
  const totalPages = candidate.totalPages;
  if (typeof totalPages !== 'number' || !Number.isSafeInteger(totalPages) || totalPages < 1 || totalPages > MAX_ORGANIZER_DRAFT_PAGES) {
    return null;
  }
  const updatedAt = typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : 0;
  if (!Array.isArray(candidate.pages) || candidate.pages.length === 0 || candidate.pages.length > MAX_ORGANIZER_DRAFT_PAGES) {
    return null;
  }

  const pages: OrganizerDraftPageEntry[] = [];
  for (let i = 0; i < candidate.pages.length; i++) {
    const entry = candidate.pages[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const item = entry as Record<string, unknown>;
    const rotation = normalizeRotation(typeof item.rotation === 'number' ? item.rotation : 0);
    const splitAfter = i < candidate.pages.length - 1 && item.splitAfter === true;
    if (item.blank === true) {
      pages.push({
        blank: true,
        rotation,
        ...(splitAfter ? { splitAfter: true } : {}),
      });
    } else {
      const page = item.page;
      if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1 || page > totalPages) {
        return null;
      }
      pages.push({
        page,
        rotation,
        ...(splitAfter ? { splitAfter: true } : {}),
      });
    }
  }

  return {
    version: 1,
    sourceId: candidate.sourceId.trim(),
    sha256: candidate.sha256.trim().toLowerCase(),
    totalPages,
    updatedAt,
    pages,
  };
}

export function toPagePlanItems(
  draft: OrganizerDraftV1,
  session: { id: string; filename: string },
): { items: OrganizerRestoredPageItem[]; splitBoundaries: Set<string> } {
  const splitBoundaries = new Set<string>();
  const seenPages = new Map<number, number>();
  let blankCount = 0;
  const items: OrganizerRestoredPageItem[] = draft.pages.map((entry, index) => {
    let id: string;
    if (entry.blank) {
      blankCount += 1;
      id = `${session.id}-blank-${blankCount}-${index + 1}`;
    } else {
      const page = entry.page!;
      const occurrence = (seenPages.get(page) ?? 0) + 1;
      seenPages.set(page, occurrence);
      id = occurrence === 1 ? `${session.id}-p-${page}` : `${session.id}-p-${page}-${occurrence}`;
    }
    if (entry.splitAfter && index < draft.pages.length - 1) {
      splitBoundaries.add(id);
    }
    return entry.blank
      ? {
          id,
          blank: true,
          rotation: entry.rotation,
        }
      : {
          id,
          page: entry.page,
          sessionId: session.id,
          filename: session.filename,
          rotation: entry.rotation,
        };
  });
  return { items, splitBoundaries };
}

export type OrganizerDraftResolution =
  | { status: 'none' }
  | { status: 'discarded-changed' }
  | { status: 'restored'; draft: OrganizerDraftV1; items: OrganizerRestoredPageItem[]; splitBoundaries: Set<string> };

export function resolveOrganizerDraftForSession(
  raw: unknown,
  session: { id: string; sourceId: string | null | undefined; filename: string; sha256: string; totalPages: number },
): OrganizerDraftResolution {
  if (raw === null || raw === undefined) return { status: 'none' };
  const parsed = parseOrganizerDraft(raw);
  if (!parsed) {
    // If there is an object with a mismatched sha256, treat as discarded-changed; otherwise treat as none.
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const candidateSha = (raw as { sha256?: unknown }).sha256;
      if (typeof candidateSha === 'string' && session.sha256 && candidateSha.toLowerCase() !== session.sha256.toLowerCase()) {
        return { status: 'discarded-changed' };
      }
    }
    return { status: 'none' };
  }
  const currentSha = (session.sha256 || '').trim().toLowerCase();
  if (!currentSha || parsed.sha256 !== currentSha || parsed.totalPages !== session.totalPages) {
    return { status: 'discarded-changed' };
  }
  const { items, splitBoundaries } = toPagePlanItems(parsed, session);
  if (isDefaultOrganizerPlan(items, splitBoundaries, session.totalPages, session.id)) {
    return { status: 'none' };
  }
  return {
    status: 'restored',
    draft: parsed,
    items,
    splitBoundaries,
  };
}
