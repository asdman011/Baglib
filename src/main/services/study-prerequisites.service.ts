import type Database from 'better-sqlite3';
import { SqliteSettingsRepository } from '../database/repositories/settings.repository';
import { StudyProgressService } from './statistics/study-progress.service';
import {
  PREREQUISITES_SETTINGS_PREFIX,
  PREREQUISITES_DISMISSED_PREFIX,
  validatePrerequisitesMap,
  detectCycle,
  renameSectionInPrerequisites,
  deleteSectionInPrerequisites,
  evaluatePrerequisiteAssessment,
  selectWeakestPrerequisite,
  shouldShowPrerequisiteHint,
  type PrerequisitesMap,
  type PrerequisiteHint,
  type DismissedHintRecord,
  type SectionPrerequisiteAssessment,
} from '../../shared/study-prerequisites';
import type { MasteryLevel, SectionMasterySummary } from '../../shared/study-progress';

interface PathwayRow {
  id: string;
  name: string;
  collection_type: string;
}

interface SectionStats {
  level: MasteryLevel;
  totalCards: number;
  lapsesCount: number;
  correctAttempts: number;
  totalAttempts: number;
  failureCount: number;
}

export class StudyPrerequisitesService {
  private readonly settings: SqliteSettingsRepository;
  private readonly progressService: StudyProgressService;

  constructor(
    private readonly db: Database.Database,
    settingsRepo?: SqliteSettingsRepository,
    progressService?: StudyProgressService
  ) {
    this.settings = settingsRepo ?? new SqliteSettingsRepository(db);
    this.progressService = progressService ?? new StudyProgressService(db);
  }

  /**
   * Returns the available section names for a curriculum pathway.
   */
  getAvailableSections(pathwayId: string): string[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT DISTINCT section
           FROM pathway_item
           WHERE collection_id = ? AND section IS NOT NULL AND TRIM(section) <> ''
           ORDER BY sort_order ASC, section ASC`
        )
        .all(pathwayId) as { section: string }[];
      return rows.map((r) => r.section.trim());
    } catch {
      return [];
    }
  }

  /**
   * Loads the prerequisites map for a given curriculum pathway.
   */
  getPrerequisites(pathwayId: string): PrerequisitesMap {
    const key = `${PREREQUISITES_SETTINGS_PREFIX}${pathwayId}`;
    const raw = this.settings.get<PrerequisitesMap>(key);
    return validatePrerequisitesMap(raw);
  }

  /**
   * Saves prerequisites for a curriculum pathway.
   * If a cycle is detected, rejects with `{ success: false, cycle }`.
   */
  savePrerequisites(
    pathwayId: string,
    input: unknown
  ): { success: boolean; cycle?: string[]; error?: string } {
    const available = this.getAvailableSections(pathwayId);
    let validated: PrerequisitesMap;

    try {
      validated = validatePrerequisitesMap(input, available.length > 0 ? available : undefined);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }

    const cycle = detectCycle(validated);
    if (cycle) {
      return { success: false, cycle };
    }

    const key = `${PREREQUISITES_SETTINGS_PREFIX}${pathwayId}`;
    this.settings.set(key, validated);
    return { success: true };
  }

  /**
   * Propagates section rename across prerequisites map and dismissal records.
   */
  renameSection(pathwayId: string, oldSection: string, newSection: string): void {
    const cleanOld = oldSection.trim();
    const cleanNew = newSection.trim();
    if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;

    this.db.transaction(() => {
      // 1. Update items in SQLite
      this.db
        .prepare('UPDATE pathway_item SET section = ? WHERE collection_id = ? AND section = ?')
        .run(cleanNew, pathwayId, cleanOld);

      // 2. Update prerequisites map in settings
      const mapKey = `${PREREQUISITES_SETTINGS_PREFIX}${pathwayId}`;
      const currentMap = this.getPrerequisites(pathwayId);
      const updatedMap = renameSectionInPrerequisites(currentMap, cleanOld, cleanNew);
      this.settings.set(mapKey, updatedMap);

      // 3. Update dismissals if any
      const dismissKey = `${PREREQUISITES_DISMISSED_PREFIX}${pathwayId}`;
      const dismissals = this.settings.get<Record<string, DismissedHintRecord>>(dismissKey) || {};
      let changedDismissals = false;
      const updatedDismissals: Record<string, DismissedHintRecord> = {};

      for (const [key, record] of Object.entries(dismissals)) {
        let rec = record;
        if (rec.failingSection === cleanOld || rec.weakestPrerequisite === cleanOld) {
          rec = {
            ...rec,
            failingSection: rec.failingSection === cleanOld ? cleanNew : rec.failingSection,
            weakestPrerequisite:
              rec.weakestPrerequisite === cleanOld ? cleanNew : rec.weakestPrerequisite,
          };
          changedDismissals = true;
        }
        const targetKey = key === cleanOld ? cleanNew : key;
        updatedDismissals[targetKey] = rec;
      }

      if (changedDismissals) {
        this.settings.set(dismissKey, updatedDismissals);
      }
    })();
  }

  /**
   * Propagates section deletion across prerequisites map and dismissal records.
   */
  deleteSection(pathwayId: string, section: string): void {
    const clean = section.trim();
    if (!clean) return;

    this.db.transaction(() => {
      // 1. Delete items in SQLite
      this.db
        .prepare('DELETE FROM pathway_item WHERE collection_id = ? AND section = ?')
        .run(pathwayId, clean);

      // 2. Update prerequisites map in settings
      const mapKey = `${PREREQUISITES_SETTINGS_PREFIX}${pathwayId}`;
      const currentMap = this.getPrerequisites(pathwayId);
      const updatedMap = deleteSectionInPrerequisites(currentMap, clean);
      this.settings.set(mapKey, updatedMap);

      // 3. Remove dismissal entry for this section
      const dismissKey = `${PREREQUISITES_DISMISSED_PREFIX}${pathwayId}`;
      const dismissals = this.settings.get<Record<string, DismissedHintRecord>>(dismissKey);
      if (dismissals && dismissals[clean]) {
        delete dismissals[clean];
        this.settings.set(dismissKey, dismissals);
      }
    })();
  }

  /**
   * Cleans up all prerequisites data when a pathway is removed.
   */
  cleanupPathway(pathwayId: string): void {
    const mapKey = `${PREREQUISITES_SETTINGS_PREFIX}${pathwayId}`;
    const dismissKey = `${PREREQUISITES_DISMISSED_PREFIX}${pathwayId}`;
    this.settings.delete(mapKey);
    this.settings.delete(dismissKey);
  }

  /**
   * Dismisses a prerequisite hint for a section.
   * Records the current failure count so the hint stays quiet until new failures happen.
   */
  dismissHint(
    pathwayId: string,
    failingSection: string,
    weakestPrerequisite: string,
    currentFailureCount: number
  ): void {
    const dismissKey = `${PREREQUISITES_DISMISSED_PREFIX}${pathwayId}`;
    const dismissals = this.settings.get<Record<string, DismissedHintRecord>>(dismissKey) || {};

    dismissals[failingSection] = {
      pathwayId,
      failingSection,
      weakestPrerequisite,
      dismissedAt: new Date().toISOString(),
      failureCountAtDismissal: currentFailureCount,
    };

    this.settings.set(dismissKey, dismissals);
  }

  /**
   * Clears a dismissal record for a section.
   */
  clearDismissal(pathwayId: string, failingSection: string): void {
    const dismissKey = `${PREREQUISITES_DISMISSED_PREFIX}${pathwayId}`;
    const dismissals = this.settings.get<Record<string, DismissedHintRecord>>(dismissKey);
    if (dismissals && dismissals[failingSection]) {
      delete dismissals[failingSection];
      this.settings.set(dismissKey, dismissals);
    }
  }

  /**
   * Queries curriculum pathways, finds struggling sections with prerequisites,
   * selects the weakest prerequisite, checks dismissal rules, and returns active hints.
   */
  getPrerequisiteHints(): PrerequisiteHint[] {
    const hints: PrerequisiteHint[] = [];

    // 1. Fetch curriculum pathways
    let pathways: PathwayRow[] = [];
    try {
      pathways = this.db
        .prepare(
          `SELECT id, name, collection_type
           FROM collection
           WHERE collection_type = 'curriculum'
           ORDER BY name ASC`
        )
        .all() as PathwayRow[];
    } catch {
      return [];
    }

    const hasPractice = this.hasTable('practice_attempt');
    const hasSrs = this.hasTable('srs_state');

    for (const pathway of pathways) {
      const prereqMap = this.getPrerequisites(pathway.id);
      const sectionsWithDeps = Object.keys(prereqMap);
      if (sectionsWithDeps.length === 0) continue;

      // Get pathway progress mastery summaries
      const progress = this.progressService.getProgress('pathway', pathway.id);
      const masterySectionsMap = new Map<string, SectionMasterySummary>();
      if (progress?.demonstratedKnowledge?.sections) {
        for (const sec of progress.demonstratedKnowledge.sections) {
          masterySectionsMap.set(sec.sectionName, sec);
        }
      }

      // Load dismissals for this pathway
      const dismissKey = `${PREREQUISITES_DISMISSED_PREFIX}${pathway.id}`;
      const dismissals = this.settings.get<Record<string, DismissedHintRecord>>(dismissKey) || {};

      for (const section of sectionsWithDeps) {
        const prerequisites = prereqMap[section];
        if (!prerequisites || prerequisites.length === 0) continue;

        // Evaluate failing section stats
        const failingStats = this.getSectionStats(pathway.id, section, hasPractice, hasSrs);

        // Check if section is struggling / triggered:
        // Trigger condition:
        // - At least 1 lapse or practice failure
        // - OR mastery level has dropped / is below proficient with failures
        const isStruggling =
          failingStats.failureCount > 0 &&
          (failingStats.level === 'not_started' ||
            failingStats.level === 'started' ||
            failingStats.level === 'familiar' ||
            failingStats.lapsesCount > 0);

        if (!isStruggling) continue;

        // Check dismissal: stays quiet until new failures happen
        const dismissal = dismissals[section];
        if (!shouldShowPrerequisiteHint(failingStats.failureCount, dismissal)) {
          continue;
        }

        // Evaluate all candidate prerequisites
        const candidateAssessments: SectionPrerequisiteAssessment[] = [];
        for (const dep of prerequisites) {
          const depStats = this.getSectionStats(pathway.id, dep, hasPractice, hasSrs);
          candidateAssessments.push(
            evaluatePrerequisiteAssessment(dep, {
              level: depStats.level,
              totalCards: depStats.totalCards,
              lapsesCount: depStats.lapsesCount,
              correctAttempts: depStats.correctAttempts,
              totalAttempts: depStats.totalAttempts,
            })
          );
        }

        const weakest = selectWeakestPrerequisite(candidateAssessments);
        if (!weakest) continue;

        hints.push({
          id: `hint:${pathway.id}:${section}:${weakest.sectionName}`,
          pathwayId: pathway.id,
          pathwayName: pathway.name,
          failingSection: section,
          weakestPrerequisite: weakest.sectionName,
          prerequisiteCardsCount: weakest.totalCards,
          prerequisiteLevel: weakest.level,
          failingSectionLapses: failingStats.lapsesCount,
          currentFailureCount: failingStats.failureCount,
          target: `pathway:${pathway.id}`,
        });
      }
    }

    return hints;
  }

  private getSectionStats(
    pathwayId: string,
    sectionName: string,
    hasPractice: boolean,
    hasSrs: boolean
  ): SectionStats {
    let lapsesCount = 0;
    let incorrectAttempts = 0;
    let correctAttempts = 0;
    let totalAttempts = 0;
    let totalCards = 0;

    try {
      // Find cards assigned to this section
      const cards = this.db
        .prepare(
          `SELECT k.id, cd.source_ref, cd.source_label
           FROM knowledge k
           LEFT JOIN card_detail cd ON cd.knowledge_id = k.id
           WHERE k.deleted_at IS NULL
             AND (
               cd.source_label = ?
               OR EXISTS (
                 SELECT 1 FROM pathway_item pi
                 WHERE pi.collection_id = ?
                   AND pi.section = ?
                   AND (
                     pi.reference = 'card:' || k.id
                     OR (pi.reference IS NOT NULL AND cd.source_ref LIKE '%' || pi.reference || '%')
                   )
               )
             )`
        )
        .all(sectionName, pathwayId, sectionName) as {
        id: string;
        source_ref: string | null;
        source_label: string | null;
      }[];

      totalCards = cards.length;
      const cardIds = cards.map((c) => c.id);

      if (cardIds.length > 0) {
        const placeholders = cardIds.map(() => '?').join(',');

        if (hasSrs) {
          const srsRows = this.db
            .prepare(
              `SELECT SUM(lapses) as totalLapses
               FROM srs_state
               WHERE knowledge_id IN (${placeholders})`
            )
            .get(...cardIds) as { totalLapses: number | null } | undefined;
          lapsesCount = Number(srsRows?.totalLapses || 0);
        }

        if (hasPractice) {
          const practiceRows = this.db
            .prepare(
              `SELECT
                 COUNT(CASE WHEN result = 'correct' THEN 1 END) as correctCount,
                 COUNT(CASE WHEN result = 'incorrect' THEN 1 END) as incorrectCount,
                 COUNT(*) as attemptCount
               FROM practice_attempt
               WHERE knowledge_id IN (${placeholders})`
            )
            .get(...cardIds) as {
            correctCount: number | null;
            incorrectCount: number | null;
            attemptCount: number | null;
          } | undefined;

          correctAttempts = Number(practiceRows?.correctCount || 0);
          incorrectAttempts = Number(practiceRows?.incorrectCount || 0);
          totalAttempts = Number(practiceRows?.attemptCount || 0);
        }
      }
    } catch {}

    const failureCount = lapsesCount + incorrectAttempts;

    // Determine basic level
    let level: MasteryLevel = 'not_started';
    if (totalCards > 0) {
      if (correctAttempts >= 3 && failureCount === 0) level = 'proficient';
      else if (correctAttempts >= 2) level = 'familiar';
      else if (correctAttempts >= 1 || totalAttempts > 0) level = 'started';
    }

    return {
      level,
      totalCards,
      lapsesCount,
      correctAttempts,
      totalAttempts,
      failureCount,
    };
  }

  private hasTable(tableName: string): boolean {
    try {
      const row = this.db
        .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`)
        .get(tableName);
      return Boolean(row);
    } catch {
      return false;
    }
  }
}
