/**
 * BagLib Study Workspace: Curriculum Prerequisites & "Revisit First" Hints (KEY-288)
 *
 * Implements:
 * 1. Validated and bounded storage format for curriculum prerequisites (ADR-009 precedent).
 * 2. Graph cycle detection with cycle path reconstruction for localized error messaging.
 * 3. Section rename and delete propagations.
 * 4. Deterministic weakest-prerequisite selection based on demonstrated mastery and lapses.
 * 5. Dismissal tracking that stays quiet until new failures occur.
 */

import type { MasteryLevel } from './study-progress';

export const PREREQUISITES_SETTINGS_PREFIX = 'pathways.prerequisites.v1:';
export const PREREQUISITES_DISMISSED_PREFIX = 'pathways.prerequisites.dismissed.v1:';

export const MAX_SECTION_NAME_LENGTH = 200;
export const MAX_PREREQUISITES_PER_SECTION = 50;
export const MAX_SECTIONS_PER_PATHWAY = 100;

export type PrerequisitesMap = Record<string, string[]>;

export interface DismissedHintRecord {
  pathwayId: string;
  failingSection: string;
  weakestPrerequisite: string;
  dismissedAt: string;
  failureCountAtDismissal: number;
}

export interface PrerequisiteHint {
  id: string;
  pathwayId: string;
  pathwayName: string;
  failingSection: string;
  weakestPrerequisite: string;
  prerequisiteCardsCount: number;
  prerequisiteLevel: MasteryLevel;
  failingSectionLapses: number;
  currentFailureCount: number;
  target?: string;
}

export interface SectionPrerequisiteAssessment {
  sectionName: string;
  level: MasteryLevel;
  totalCards: number;
  lapsesCount: number;
  correctAttempts: number;
  totalAttempts: number;
  accuracy: number;
  weaknessScore: number; // Lower score = weaker prerequisite
}

const MASTERY_LEVEL_WEIGHT: Record<MasteryLevel, number> = {
  not_started: 0,
  started: 1,
  familiar: 2,
  proficient: 3,
  mastered: 4,
};

/**
 * Validates and bounds a prerequisites map.
 * Rejects invalid types, overly long names, self-dependencies, or maps exceeding max size.
 */
export function validatePrerequisitesMap(
  input: unknown,
  availableSections?: string[]
): PrerequisitesMap {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const raw = input as Record<string, unknown>;
  const keys = Object.keys(raw);
  if (keys.length > MAX_SECTIONS_PER_PATHWAY) {
    throw new Error('invalid-request: too many sections in prerequisites map');
  }

  const availableSet = availableSections ? new Set(availableSections.map((s) => s.trim())) : null;
  const result: PrerequisitesMap = {};

  for (const [rawSection, rawDeps] of Object.entries(raw)) {
    const section = rawSection.trim();
    if (!section || section.length > MAX_SECTION_NAME_LENGTH) {
      continue;
    }

    if (availableSet && !availableSet.has(section)) {
      continue;
    }

    if (!Array.isArray(rawDeps)) {
      continue;
    }

    const cleanedDeps: string[] = [];
    const seen = new Set<string>();

    for (const dep of rawDeps) {
      if (typeof dep !== 'string') continue;
      const cleanDep = dep.trim();
      if (!cleanDep || cleanDep.length > MAX_SECTION_NAME_LENGTH) continue;
      if (cleanDep === section) {
        throw new Error(`invalid-request: self-dependency not allowed for section '${section}'`);
      }
      if (availableSet && !availableSet.has(cleanDep)) {
        continue;
      }
      if (!seen.has(cleanDep)) {
        seen.add(cleanDep);
        cleanedDeps.push(cleanDep);
      }
      if (cleanedDeps.length >= MAX_PREREQUISITES_PER_SECTION) break;
    }

    if (cleanedDeps.length > 0) {
      result[section] = cleanedDeps;
    }
  }

  return result;
}

/**
 * Detects cycles in the prerequisites dependency graph.
 * Returns the cycle path if found (e.g., ['A', 'B', 'C', 'A']), or null if acyclic.
 */
export function detectCycle(map: PrerequisitesMap): string[] | null {
  // Graph: section -> list of sections it depends on (edges: section -> dependency)
  // State: 0 = unvisited (white), 1 = visiting/in stack (gray), 2 = visited (black)
  const state = new Map<string, number>();
  const parent = new Map<string, string>();

  // Ensure all referenced nodes exist in graph keys
  const allNodes = new Set<string>(Object.keys(map));
  for (const deps of Object.values(map)) {
    for (const dep of deps) {
      allNodes.add(dep);
    }
  }

  for (const node of allNodes) {
    state.set(node, 0);
  }

  function dfs(curr: string, path: string[]): string[] | null {
    state.set(curr, 1);
    path.push(curr);

    const neighbors = map[curr] || [];
    for (const next of neighbors) {
      const nextState = state.get(next) ?? 0;
      if (nextState === 1) {
        // Found back-edge! Reconstruct cycle from next to curr
        const cycleStartIndex = path.indexOf(next);
        if (cycleStartIndex !== -1) {
          return [...path.slice(cycleStartIndex), next];
        }
        return [next, curr, next];
      }
      if (nextState === 0) {
        parent.set(next, curr);
        const cycle = dfs(next, path);
        if (cycle) return cycle;
      }
    }

    path.pop();
    state.set(curr, 2);
    return null;
  }

  for (const node of allNodes) {
    if ((state.get(node) ?? 0) === 0) {
      const cycle = dfs(node, []);
      if (cycle) return cycle;
    }
  }

  return null;
}

/**
 * Formats a cycle path into a human-readable string.
 * Example in English: "Variance -> Covariance -> Regression -> Variance"
 * Example in Arabic: "التباين ← التغاير ← الانحدار ← التباين"
 */
export function formatCyclePath(cycle: string[], lang: 'ar' | 'en' = 'en'): string {
  const arrow = lang === 'ar' ? ' ← ' : ' → ';
  return cycle.join(arrow);
}

/**
 * Updates prerequisites map when a section is renamed.
 * All keys and dependency references matching `oldName` are replaced with `newName`.
 */
export function renameSectionInPrerequisites(
  map: PrerequisitesMap,
  oldName: string,
  newName: string
): PrerequisitesMap {
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return { ...map };

  const updated: PrerequisitesMap = {};

  for (const [section, deps] of Object.entries(map)) {
    const targetKey = section === cleanOld ? cleanNew : section;
    const targetDeps = deps.map((d) => (d === cleanOld ? cleanNew : d));
    // Deduplicate and avoid self-dependency
    const deduped = Array.from(new Set(targetDeps)).filter((d) => d !== targetKey);
    if (deduped.length > 0) {
      updated[targetKey] = deduped;
    }
  }

  return updated;
}

/**
 * Updates prerequisites map when a section is deleted.
 * Removes the section key and removes the section from all dependency lists.
 */
export function deleteSectionInPrerequisites(
  map: PrerequisitesMap,
  deletedName: string
): PrerequisitesMap {
  const clean = deletedName.trim();
  if (!clean) return { ...map };

  const updated: PrerequisitesMap = {};

  for (const [section, deps] of Object.entries(map)) {
    if (section === clean) continue;
    const filtered = deps.filter((d) => d !== clean);
    if (filtered.length > 0) {
      updated[section] = filtered;
    }
  }

  return updated;
}

/**
 * Evaluates the weakest prerequisite among the dependencies of a struggling section.
 *
 * Scoring:
 * Lower score = weaker prerequisite (higher priority to revisit).
 * 1. Mastery Level Weight: not_started (0), started (1), familiar (2), proficient (3), mastered (4).
 * 2. Accuracy: ratio of correct to total attempts.
 * 3. Lapses / Failures: each lapse penalizes strength.
 *
 * Formula:
 * weaknessScore = (levelWeight * 100) + (accuracy * 50) - (lapsesCount * 15)
 */
export function evaluatePrerequisiteAssessment(
  sectionName: string,
  stats: {
    level: MasteryLevel;
    totalCards: number;
    lapsesCount: number;
    correctAttempts: number;
    totalAttempts: number;
  }
): SectionPrerequisiteAssessment {
  const levelWeight = MASTERY_LEVEL_WEIGHT[stats.level] ?? 0;
  const accuracy = stats.totalAttempts > 0 ? stats.correctAttempts / stats.totalAttempts : 0;
  const weaknessScore = levelWeight * 100 + accuracy * 50 - stats.lapsesCount * 15;

  return {
    sectionName,
    level: stats.level,
    totalCards: stats.totalCards,
    lapsesCount: stats.lapsesCount,
    correctAttempts: stats.correctAttempts,
    totalAttempts: stats.totalAttempts,
    accuracy,
    weaknessScore,
  };
}

/**
 * Selects the weakest prerequisite from a list of candidate assessments.
 * If multiple prerequisites have identical weakness scores, sorts deterministically by section name.
 */
export function selectWeakestPrerequisite(
  assessments: SectionPrerequisiteAssessment[]
): SectionPrerequisiteAssessment | null {
  if (!assessments || assessments.length === 0) return null;

  const sorted = [...assessments].sort((a, b) => {
    if (a.weaknessScore !== b.weaknessScore) {
      return a.weaknessScore - b.weaknessScore;
    }
    // Deterministic tie-break
    return a.sectionName.localeCompare(b.sectionName);
  });

  return sorted[0];
}

/**
 * Determines whether a prerequisite hint should be shown or remain dismissed.
 * A dismissed hint stays quiet until new failures happen on the failing section.
 */
export function shouldShowPrerequisiteHint(
  currentFailureCount: number,
  dismissal?: DismissedHintRecord | null
): boolean {
  if (!dismissal) return true;
  // If new failures have occurred since dismissal, resurface the hint
  return currentFailureCount > dismissal.failureCountAtDismissal;
}
