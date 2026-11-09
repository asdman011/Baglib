import type { Database } from 'better-sqlite3';
import { SqliteSettingsRepository } from '../database/repositories/settings.repository';
import {
  EXAM_SETTINGS_PREFIX,
  validateExamConfig,
  computeAdaptiveReplan,
  type CurriculumExamConfig,
  type PlanStepItem,
  type ReplanResult,
} from '../../shared/curriculum-exam';
import {
  WEEKLY_RHYTHM_SETTINGS_KEY,
  DEFAULT_WEEKLY_RHYTHM,
  type WeeklyRhythmConfig,
} from '../../shared/study-rhythm';
import { StudyPrerequisitesService } from './study-prerequisites.service';
import { civilDate } from '../../shared/study-planner';

interface StepRow {
  itemId: string;
  section: string;
  title: string;
  pinned: number;
  taskId: string | null;
  taskStatus: string | null;
  taskDueDate: string | null;
}

export class CurriculumExamService {
  private settings: SqliteSettingsRepository;
  private prereqs: StudyPrerequisitesService;

  constructor(private db: Database) {
    this.settings = new SqliteSettingsRepository(db);
    this.prereqs = new StudyPrerequisitesService(db);
  }

  private assertPathway(pathwayId: string): void {
    const row = this.db
      .prepare("SELECT 1 FROM collection WHERE id = ? AND collection_type = 'curriculum'")
      .get(pathwayId);
    if (!row) throw new Error('invalid-request');
  }

  getExamConfig(pathwayId: string): CurriculumExamConfig {
    this.assertPathway(pathwayId);
    const key = `${EXAM_SETTINGS_PREFIX}${pathwayId}`;
    const raw = this.settings.get<unknown>(key, null);
    if (raw && typeof raw === 'object') {
      try {
        return validateExamConfig({ ...(raw as Record<string, unknown>), pathwayId });
      } catch {
        // Fall back to default config if invalid
      }
    }

    return validateExamConfig({
      pathwayId,
      examDate: null,
    });
  }

  saveExamConfig(configInput: unknown): CurriculumExamConfig {
    const validated = validateExamConfig(configInput);
    this.assertPathway(validated.pathwayId);
    const key = `${EXAM_SETTINGS_PREFIX}${validated.pathwayId}`;
    this.settings.set(key, validated);
    return validated;
  }

  async getReplanPreview(pathwayId: string, lang: 'ar' | 'en' = 'en'): Promise<ReplanResult> {
    this.assertPathway(pathwayId);
    const config = this.getExamConfig(pathwayId);

    // Load rhythm settings for rest days
    const rhythmRaw = this.settings.get<WeeklyRhythmConfig>(
      WEEKLY_RHYTHM_SETTINGS_KEY,
      DEFAULT_WEEKLY_RHYTHM
    );
    const restDays = Array.isArray(rhythmRaw?.restDays) ? rhythmRaw.restDays : [5];

    // Load prerequisites map
    const prereqMap = this.prereqs.getPrerequisites(pathwayId);
    const prerequisiteSections = new Set<string>();
    for (const deps of Object.values(prereqMap)) {
      for (const dep of deps) {
        prerequisiteSections.add(dep);
      }
    }

    // Load pathway steps and their linked planner tasks
    const query = `
      SELECT
        i.id AS itemId,
        i.section AS section,
        i.title AS title,
        i.pinned AS pinned,
        t.id AS taskId,
        t.status AS taskStatus,
        t.due_date AS taskDueDate
      FROM pathway_item i
      LEFT JOIN study_task t ON i.kind = 'step' AND i.reference = 'task:' || t.id
      WHERE i.collection_id = ? AND i.kind = 'step'
      ORDER BY i.sort_order ASC, i.created_at ASC
    `;
    const rows = this.db.prepare(query).all(pathwayId) as StepRow[];

    // Build PlanStepItem for each step
    const stepItems: PlanStepItem[] = [];
    const sectionMasteryCache = new Map<
      string,
      {
        masteryLevel: 'not_started' | 'started' | 'familiar' | 'proficient' | 'mastered';
        failureCount: number;
      }
    >();

    for (const r of rows) {
      const sectionName = r.section || '';
      let cached = sectionMasteryCache.get(sectionName);

      if (!cached) {
        const stats = this.prereqs.getSectionStats(pathwayId, sectionName);
        cached = {
          masteryLevel: stats.level,
          failureCount: stats.failureCount,
        };
        sectionMasteryCache.set(sectionName, cached);
      }

      stepItems.push({
        itemId: r.itemId,
        taskId: r.taskId || '',
        section: sectionName,
        title: r.title,
        pinned: r.pinned === 1,
        done: r.taskStatus === 'completed',
        currentDueDate: r.taskDueDate,
        estimatedMinutes: config.defaultStepMinutes,
        masteryLevel: cached.masteryLevel,
        isPrerequisite: prerequisiteSections.has(sectionName),
        failureCount: cached.failureCount,
      });
    }

    return computeAdaptiveReplan({
      steps: stepItems,
      examConfig: config,
      restDays,
      todayStr: civilDate(new Date()),
      lang,
    });
  }

  applyReplan(pathwayId: string, schedule: { taskId: string; date: string }[]): void {
    this.assertPathway(pathwayId);
    if (!Array.isArray(schedule)) throw new Error('invalid-request');

    const now = new Date().toISOString();
    const updateStmt = this.db.prepare(
      'UPDATE study_task SET due_date = ?, updated_at = ? WHERE id = ?'
    );

    const tx = this.db.transaction(() => {
      for (const item of schedule) {
        if (!item || typeof item !== 'object') throw new Error('invalid-request');
        if (typeof item.taskId !== 'string' || !item.taskId.trim()) throw new Error('invalid-request');
        if (typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(item.date)) {
          throw new Error('invalid-request');
        }

        updateStmt.run(item.date, now, item.taskId);
      }
    });

    tx();
  }
}
