import { translations, type TranslationKey } from '../../translations';
import { normalizeSearchString } from '../../../shared/utils/text-normalizer';

export const SETTINGS_GROUPS = [
  { id: 'general', label: 'settingsGroupGeneral' },
  { id: 'appearance', label: 'settingsGroupAppearance' },
  { id: 'library', label: 'settingsGroupLibrary' },
  { id: 'reader', label: 'settingsGroupReader' },
  { id: 'notes', label: 'settingsGroupNotes' },
  { id: 'islamic', label: 'settingsGroupIslamic' },
  { id: 'ai', label: 'settingsGroupAi' },
  { id: 'sync', label: 'settingsGroupSync' },
  { id: 'privacy', label: 'settingsGroupPrivacy' },
  { id: 'advanced', label: 'settingsGroupAdvanced' },
] as const;
export interface SettingEntry {
  id: string;
  group: typeof SETTINGS_GROUPS[number]['id'];
  label: TranslationKey;
  description: TranslationKey;
  action: string;
  keys: readonly string[];
}
export const SETTINGS_DIRECTORY: readonly SettingEntry[] = [
  { id: 'language', group: 'general', label: 'settingLanguage', description: 'settingLanguageDescription', action: 'language', keys: ["baglib-lang"] },
  { id: 'guide', group: 'general', label: 'settingGuide', description: 'settingGuideDescription', action: 'guide', keys: ["onboarding.v1"] },
  { id: 'theme', group: 'appearance', label: 'settingTheme', description: 'settingThemeDescription', action: 'theme', keys: ["baglib-theme"] },
  { id: 'navigation', group: 'appearance', label: 'settingNavigation', description: 'settingNavigationDescription', action: 'navigation', keys: ["shell.navPinned.v1"] },
  { id: 'dashboard', group: 'appearance', label: 'settingDashboard', description: 'settingDashboardDescription', action: 'dashboard', keys: ["dashboard.layout.v1", "dashboard.study.preferences.v1"] },
  { id: 'folder', group: 'library', label: 'settingFolder', description: 'settingFolderDescription', action: 'folder', keys: [] },
  { id: 'storage', group: 'library', label: 'settingStorage', description: 'settingStorageDescription', action: 'storage', keys: [] },
  { id: 'library', group: 'library', label: 'settingLibrary', description: 'settingLibraryDescription', action: 'library', keys: ["library_view_preferences"] },
  { id: 'saving', group: 'reader', label: 'settingSaving', description: 'settingSavingDescription', action: 'saving', keys: ["save.policy.v1", "save.backupFolder.v1", "undo.scope.v1"] },
  { id: 'reader', group: 'reader', label: 'settingReader', description: 'settingReaderDescription', action: 'reader', keys: ['reader.chrome.v1:'] },
  { id: 'plugins', group: 'reader', label: 'settingPlugins', description: 'settingPluginsDescription', action: 'plugins', keys: ["reader_plugins:state"] },
  { id: 'notes', group: 'notes', label: 'settingNotes', description: 'settingNotesDescription', action: 'notes', keys: ["baglib-knowledge-card-hover", "baglib.wordLayout.v1"] },
  { id: 'honorifics', group: 'notes', label: 'settingHonorifics', description: 'settingHonorificsDescription', action: 'honorifics', keys: ["notes.honorifics.autoExpand.v1"] },
  { id: 'questions', group: 'notes', label: 'settingQuestions', description: 'settingQuestionsDescription', action: 'questions', keys: ["knowledge.questions.enabled"] },
  { id: 'quran', group: 'islamic', label: 'settingProfile', description: 'settingProfileDescription', action: 'quran', keys: [] },
  { id: 'wird', group: 'islamic', label: 'settingWird', description: 'settingWirdDescription', action: 'wird', keys: ["study.wird.v1"] },
  { id: 'prayer', group: 'islamic', label: 'settingPrayer', description: 'settingPrayerDescription', action: 'prayer', keys: ["athan.settings.v1"] },
  { id: 'rhythm', group: 'islamic', label: 'settingRhythm', description: 'settingRhythmDescription', action: 'rhythm', keys: ["dashboard.study.rhythm.v1"] },
  { id: 'weekly', group: 'islamic', label: 'settingWeekly', description: 'settingWeeklyDescription', action: 'dashboard', keys: ['study.rhythm.v1'] },
  { id: 'packs', group: 'islamic', label: 'settingPacks', description: 'settingPacksDescription', action: 'packs', keys: [] },
  { id: 'ai', group: 'ai', label: 'settingAi', description: 'settingAiDescription', action: 'ai', keys: ["ai_settings"] },
  { id: 'searchProviders', group: 'ai', label: 'settingSearchProviders', description: 'settingSearchProvidersDescription', action: 'searchProviders', keys: ['search.providers.*.enabled'] },
  { id: 'providers', group: 'ai', label: 'settingProviders', description: 'settingProvidersDescription', action: 'providers', keys: ["metadata_providers", "sources.urls.v1", "sources.urls.update.v1"] },
  { id: 'sync', group: 'sync', label: 'settingSync', description: 'settingSyncDescription', action: 'sync', keys: ["cloud_storage_config", "koreader_sync_config"] },
  { id: 'lock', group: 'privacy', label: 'settingLock', description: 'settingLockDescription', action: 'lock', keys: ["app_lock:config"] },
  { id: 'ocr', group: 'advanced', label: 'settingOcr', description: 'settingOcrDescription', action: 'ocr', keys: ["ocr.engine.v1", "ocr.layout.v1"] },
  { id: 'dictionary', group: 'reader', label: 'settingDictionary', description: 'settingDictionaryDescription', action: 'reader', keys: ["dictionary.sciences.v1"] },
  { id: 'companion', group: 'reader', label: 'settingCompanion', description: 'settingCompanionDescription', action: 'reader', keys: ["baglib.companion.v1"] },
  { id: 'actions', group: 'advanced', label: 'settingActions', description: 'settingActionsDescription', action: 'ocr', keys: ["pdf.actions.v1", "baglib_stirling_favorites"] },
  { id: 'courses', group: 'advanced', label: 'settingCourses', description: 'settingCoursesDescription', action: 'pathways', keys: ["courses.coursera.account.v1"] },
  { id: 'about', group: 'advanced', label: 'settingAbout', description: 'settingAboutDescription', action: 'about', keys: [] },
];
export function searchSettings(query: string): readonly SettingEntry[] {
  const tokens = normalizeSearchString(query).split(' ').filter(Boolean);
  return SETTINGS_DIRECTORY.filter(entry => {
    const content = normalizeSearchString(['ar', 'en'].map(language => {
      const text = translations[language as 'ar' | 'en'];
      const group = SETTINGS_GROUPS.find(group => group.id === entry.group)!;
      return `${text[entry.label]} ${text[entry.description]} ${text[group.label]}`;
    }).join(' '));
    return tokens.every(token => content.includes(token));
  });
}
