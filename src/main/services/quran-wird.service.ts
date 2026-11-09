import BetterSqlite3 from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { ISettingsRepository } from '../database/repositories/settings.repository';
import type { StudyPlannerRepository } from '../database/repositories/study-planner.repository';
import type { StudyTask } from '../../shared/study-planner';
import {
  QURAN_WIRD_SETTINGS_KEY,
  DEFAULT_QURAN_WIRD_CONFIG,
  validateQuranWirdConfig,
  isWirdActiveDay,
  calculateAyahPortion,
  calculateJuzPortion,
  calculatePagePortion,
  calculateMurajaaPortion,
  calculateCatchUpSuggestion,
  type QuranWirdConfig,
  type QuranWirdProfile,
  type QuranPortion,
  type MushafPageSummary,
  type TodayWirdSyncResult,
  type QuranWirdMissingLayoutError,
} from '../../shared/quran-wird';

export interface QuranWirdServiceOptions {
  settingsRepo: ISettingsRepository;
  plannerRepo: StudyPlannerRepository;
  quranDirectory?: string;
  layoutProvider?: (profile: QuranWirdProfile) => Promise<MushafPageSummary[] | null> | MushafPageSummary[] | null;
}

export class QuranWirdService {
  private readonly settingsRepo: ISettingsRepository;
  private readonly plannerRepo: StudyPlannerRepository;
  private readonly quranDirectory?: string;
  private readonly customLayoutProvider?: (profile: QuranWirdProfile) => Promise<MushafPageSummary[] | null> | MushafPageSummary[] | null;
  private cachedLayouts = new Map<QuranWirdProfile, MushafPageSummary[]>();

  constructor(options: QuranWirdServiceOptions) {
    this.settingsRepo = options.settingsRepo;
    this.plannerRepo = options.plannerRepo;
    this.quranDirectory = options.quranDirectory;
    this.customLayoutProvider = options.layoutProvider;
  }

  /**
   * Get validated Quran wird settings.
   */
  async getConfig(): Promise<QuranWirdConfig> {
    const raw = this.settingsRepo.get(QURAN_WIRD_SETTINGS_KEY, DEFAULT_QURAN_WIRD_CONFIG);
    return validateQuranWirdConfig(raw);
  }

  /**
   * Save Quran wird settings with validation and layout availability check.
   * If unit is 'pages' and no layout is installed, throws typed 'missing-layout' error.
   */
  async saveConfig(input: unknown): Promise<QuranWirdConfig> {
    const valid = validateQuranWirdConfig(input);

    if (valid.unit === 'pages' || (valid.murajaa.enabled && valid.murajaa.unit === 'pages')) {
      const layout = await this.getLayoutPages(valid.profile);
      if (!layout || layout.length === 0) {
        const error: QuranWirdMissingLayoutError = {
          error: 'missing-layout',
          profile: valid.profile,
          availableUnits: ['ayahs', 'juz'],
          message: `Mushaf layout data for profile '${valid.profile}' is not installed. Please choose ayah or juz units.`,
        };
        throw error;
      }
    }

    this.settingsRepo.set(QURAN_WIRD_SETTINGS_KEY, valid);
    return valid;
  }

  /**
   * Check whether layout pages are installed for the requested profile.
   */
  async hasLayout(profile: QuranWirdProfile): Promise<boolean> {
    const pages = await this.getLayoutPages(profile);
    return Boolean(pages && pages.length > 0);
  }

  /**
   * Retrieve page summaries from installed layout pack or custom provider.
   */
  async getLayoutPages(profile: QuranWirdProfile): Promise<MushafPageSummary[] | null> {
    if (this.customLayoutProvider) {
      return this.customLayoutProvider(profile);
    }

    if (this.cachedLayouts.has(profile)) {
      return this.cachedLayouts.get(profile)!;
    }

    const quranDir = this.quranDirectory || this.resolveDefaultQuranDirectory();
    if (!quranDir) {
      return null;
    }

    // 1. Check derived/ folder for prebuilt Mushaf layout SQLite databases
    const derivedDir = path.join(quranDir, 'derived');
    if (fs.existsSync(derivedDir)) {
      try {
        const files = fs.readdirSync(derivedDir);
        for (const file of files) {
          if (!file.endsWith('.sqlite')) continue;
          try {
            const derivedDb = new BetterSqlite3(path.join(derivedDir, file), { readonly: true });
            const tableCheck = derivedDb
              .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pages'")
              .get();
            if (tableCheck) {
              const rows = derivedDb
                .prepare(
                  'SELECT page_number AS pageNumber, surah_start AS surahStart, ayah_start AS ayahStart, surah_end AS surahEnd, ayah_end AS ayahEnd FROM pages ORDER BY page_number'
                )
                .all() as MushafPageSummary[];
              derivedDb.close();
              if (rows.length >= 604 && profile === 'hafs') {
                this.cachedLayouts.set(profile, rows);
                return rows;
              }
            } else {
              derivedDb.close();
            }
          } catch {}
        }
      } catch {}
    }

    if (!fs.existsSync(path.join(quranDir, 'catalog.sqlite'))) {
      return null;
    }

    try {
      const catalogDb = new BetterSqlite3(path.join(quranDir, 'catalog.sqlite'), { readonly: true });
      const packs = catalogDb.prepare('SELECT id, resource_id, descriptor FROM packs').all() as {
        id: string;
        resource_id: string;
        descriptor: string;
      }[];
      catalogDb.close();

      for (const pack of packs) {
        try {
          const descriptor = JSON.parse(pack.descriptor) as {
            resource?: { category?: string; profile?: { profile?: string } };
          };
          const isLayout =
            pack.resource_id.startsWith('mushaf-layout') ||
            descriptor.resource?.category === 'mushaf-layout';

          // Check profile match (only Hafs currently has layout in standard packs)
          const packProfile = descriptor.resource?.profile?.profile || (pack.resource_id.includes('warsh') ? 'warsh' : 'hafs');
          if (isLayout && packProfile === profile) {
            const packDbPath = path.join(quranDir, 'packs', pack.id, '0.sqlite');
            if (fs.existsSync(packDbPath)) {
              const packDb = new BetterSqlite3(packDbPath, { readonly: true });
              const rows = packDb
                .prepare('SELECT page_number AS pageNumber, surah_start AS surahStart, ayah_start AS ayahStart, surah_end AS surahEnd, ayah_end AS ayahEnd FROM pages ORDER BY page_number')
                .all() as MushafPageSummary[];
              packDb.close();

              if (rows.length > 0) {
                this.cachedLayouts.set(profile, rows);
                return rows;
              }
            }
          }
        } catch {}
      }
    } catch {}

    return null;
  }

  /**
   * Synchronizes and calculates today's wird and revision cycle.
   * If today is an active weekday, links or creates a study_task (ADR-007)
   * with references_json holding the quran: range.
   */
  async syncTodayWird(todayStr: string): Promise<TodayWirdSyncResult> {
    const config = await this.getConfig();
    const todayDate = new Date(todayStr + 'T12:00:00Z');
    const isActiveToday = isWirdActiveDay(config, todayDate);
    const isCompletedToday = config.lastCompletedDate === todayStr;

    let layoutPages: MushafPageSummary[] | null = null;
    if (config.unit === 'pages' || (config.murajaa.enabled && config.murajaa.unit === 'pages')) {
      layoutPages = await this.getLayoutPages(config.profile);
    }

    // Calculate today's main wird portion
    let portion: QuranPortion;
    if (config.unit === 'ayahs') {
      portion = calculateAyahPortion(config.currentPosition, config.dailyAmount, config.profile, 'wird');
    } else if (config.unit === 'juz') {
      portion = calculateJuzPortion(config.currentPosition.juz || 1, config.dailyAmount, config.profile, 'wird');
    } else {
      portion = calculatePagePortion(config.currentPosition.page || 1, config.dailyAmount, layoutPages || [], config.profile, 'wird');
    }

    // Calculate revision cycle (muraja'a)
    const murajaaPortion = calculateMurajaaPortion(config, layoutPages || undefined);

    // Calculate single consolidated catch-up if previous days were missed
    const catchUp = calculateCatchUpSuggestion(config, todayStr, layoutPages || undefined);

    // Manage study_task in SQLite
    let existingTask: StudyTask | undefined;
    try {
      const allTasks = this.plannerRepo.list();
      existingTask = allTasks.find(t => {
        const isDateMatch = t.startDate === todayStr || t.dueDate === todayStr;
        const isQuranTarget = t.references.some(r => r.target.startsWith(`quran:${config.profile}:`));
        return isDateMatch && isQuranTarget;
      });
    } catch {}

    let taskId = existingTask?.id;

    if (!existingTask && isActiveToday && !isCompletedToday) {
      // Create new study_task for today's wird
      try {
        const title = `ورد القرآن: ${portion.label}`;
        const description = `Daily Quran portion (${config.unit})`;
        const created = this.plannerRepo.save({
          title,
          description,
          status: 'open',
          startDate: todayStr,
          dueDate: todayStr,
          priority: 2, // high priority so Today panel includes it
          sortOrder: 0,
          references: [
            {
              target: portion.primaryTarget,
              label: portion.label,
              scope: 'surah',
            },
          ],
        });
        taskId = created.id;
      } catch {}
    }

    return {
      config,
      portion,
      murajaaPortion,
      catchUp: catchUp.needed ? catchUp : null,
      taskId,
      isCompletedToday,
      isActiveToday,
    };
  }

  /**
   * Completes a wird portion (from Planner, Today panel or Quran view),
   * advances the position, updates lastCompletedDate, and resets catch-up.
   */
  async completeWird(todayStr: string, taskId?: string): Promise<TodayWirdSyncResult> {
    const config = await this.getConfig();

    let layoutPages: MushafPageSummary[] | null = null;
    if (config.unit === 'pages' || (config.murajaa.enabled && config.murajaa.unit === 'pages')) {
      layoutPages = await this.getLayoutPages(config.profile);
    }

    // Calculate current portion to get nextPosition
    let portion: QuranPortion;
    if (config.unit === 'ayahs') {
      portion = calculateAyahPortion(config.currentPosition, config.dailyAmount, config.profile, 'wird');
    } else if (config.unit === 'juz') {
      portion = calculateJuzPortion(config.currentPosition.juz || 1, config.dailyAmount, config.profile, 'wird');
    } else {
      portion = calculatePagePortion(config.currentPosition.page || 1, config.dailyAmount, layoutPages || [], config.profile, 'wird');
    }

    // Advance Muraja'a if enabled
    let updatedMurajaa = { ...config.murajaa };
    if (config.murajaa.enabled) {
      const mPortion = calculateMurajaaPortion(config, layoutPages || undefined);
      if (mPortion && mPortion.nextPosition.juz) {
        updatedMurajaa = {
          ...updatedMurajaa,
          currentJuz: mPortion.nextPosition.juz,
          ...(mPortion.nextPosition.page ? { currentPage: mPortion.nextPosition.page } : {}),
        };
      }
    }

    // Advance position and save
    const updatedConfig: QuranWirdConfig = {
      ...config,
      currentPosition: portion.nextPosition,
      murajaa: updatedMurajaa,
      lastCompletedDate: todayStr,
      catchUpAccumulated: 0,
    };

    await this.saveConfig(updatedConfig);

    // Complete study_task if taskId provided or found
    if (taskId) {
      try {
        const allTasks = this.plannerRepo.list();
        const currentTask = allTasks.find(t => t.id === taskId);
        if (currentTask && currentTask.status === 'open') {
          this.plannerRepo.save({
            id: currentTask.id,
            title: currentTask.title,
            description: currentTask.description,
            status: 'completed',
            startDate: currentTask.startDate,
            dueDate: currentTask.dueDate,
            priority: currentTask.priority,
            sortOrder: currentTask.sortOrder,
            references: currentTask.references,
            expectedUpdatedAt: currentTask.updatedAt,
          });
        }
      } catch {}
    }

    return this.syncTodayWird(todayStr);
  }

  private resolveDefaultQuranDirectory(): string | null {
    if (process.platform === 'win32' && process.env.APPDATA) {
      return path.join(process.env.APPDATA, 'baglib', 'quran');
    }
    return null;
  }
}
