/**
 * KEY-436: Shared Learning Mode resolver & hints prompt policy.
 *
 * Modules: revision (revision sessions & tests), reader, quran, sunnah, notes, researchEditor.
 * Modes:
 * - 'off': AI is disabled/hidden for this module.
 * - 'hints': AI gives hints and guiding questions rather than direct answers; full answer only after an attempt.
 * - 'full': current full-help behaviour.
 *
 * Defaults: revision = 'off'; all other modules = 'hints'.
 */

export const AI_LEARNING_MODULES = [
  'revision',
  'reader',
  'quran',
  'sunnah',
  'notes',
  'researchEditor',
] as const;

export type AiLearningModule = (typeof AI_LEARNING_MODULES)[number];

export const AI_LEARNING_MODES = ['off', 'hints', 'full'] as const;

export type AiLearningMode = (typeof AI_LEARNING_MODES)[number];

export type AiLearningModesMap = Record<AiLearningModule, AiLearningMode>;

export function isAiLearningModule(value: unknown): value is AiLearningModule {
  return typeof value === 'string' && (AI_LEARNING_MODULES as readonly string[]).includes(value);
}

export function isAiLearningMode(value: unknown): value is AiLearningMode {
  return typeof value === 'string' && (AI_LEARNING_MODES as readonly string[]).includes(value);
}

export function defaultLearningMode(module?: AiLearningModule | null): AiLearningMode {
  return module === 'revision' ? 'off' : 'hints';
}

export function normalizeLearningModes(raw?: unknown): AiLearningModesMap {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  return {
    revision: isAiLearningMode(input.revision) ? input.revision : defaultLearningMode('revision'),
    reader: isAiLearningMode(input.reader) ? input.reader : defaultLearningMode('reader'),
    quran: isAiLearningMode(input.quran) ? input.quran : defaultLearningMode('quran'),
    sunnah: isAiLearningMode(input.sunnah) ? input.sunnah : defaultLearningMode('sunnah'),
    notes: isAiLearningMode(input.notes) ? input.notes : defaultLearningMode('notes'),
    researchEditor: isAiLearningMode(input.researchEditor) ? input.researchEditor : defaultLearningMode('researchEditor'),
  };
}

export interface ResolveLearningModeOptions {
  inRevisionOrTest?: boolean;
  legacyMode?: unknown;
}

export interface LearningModeSettingsLike {
  learningModes?: Partial<Record<AiLearningModule, AiLearningMode>>;
  learningMode?: unknown;
}

/**
 * Resolves the effective learning mode for a module.
 * - If `inRevisionOrTest` is true, always resolves against the `'revision'` module.
 * - Otherwise checks `settings.learningModes[module]`, then legacy `settings.learningMode` / `options.legacyMode`
 *   (only for non-revision modules so revision/tests stay `'off'` unless `'revision'` is explicitly configured),
 *   then falls back to `defaultLearningMode(effectiveModule)`.
 */
export function resolveLearningMode(
  settings?: LearningModeSettingsLike | null,
  module?: AiLearningModule | null,
  options?: ResolveLearningModeOptions
): AiLearningMode {
  const effectiveModule: AiLearningModule | null = options?.inRevisionOrTest ? 'revision' : (module ?? null);
  if (effectiveModule && settings?.learningModes) {
    const configured = settings.learningModes[effectiveModule];
    if (isAiLearningMode(configured)) {
      return configured;
    }
  }
  if (effectiveModule !== 'revision') {
    if (isAiLearningMode(settings?.learningMode)) {
      return settings.learningMode;
    }
    if (isAiLearningMode(options?.legacyMode)) {
      return options.legacyMode;
    }
  }
  return defaultLearningMode(effectiveModule);
}

/** Maps a WorkspaceView name to its corresponding AI learning module (undefined = general fallback -> hints). */
export function moduleFromWorkspaceView(
  view?: string | null,
  options?: { inRevisionOrTest?: boolean }
): AiLearningModule | undefined {
  if (options?.inRevisionOrTest) return 'revision';
  switch (view) {
    case 'reader':
      return 'reader';
    case 'quran':
      return 'quran';
    case 'sunnah':
      return 'sunnah';
    case 'notes':
      return 'notes';
    case 'notes-editor':
      return 'researchEditor';
    default:
      return undefined;
  }
}

/** Maps a study link target (`quran:...`, `sunnah:...`, `book:...`, `note:...`) to its AI learning module. */
export function moduleFromStudyTarget(target?: string | null): AiLearningModule | undefined {
  if (typeof target !== 'string') return undefined;
  if (target.startsWith('quran:')) return 'quran';
  if (target.startsWith('sunnah:')) return 'sunnah';
  if (target.startsWith('book:')) return 'reader';
  if (target.startsWith('note:')) return 'notes';
  return undefined;
}

export const HINTS_MODE_PROMPT_GUIDANCE = [
  'LEARNING MODE — HINTS ONLY:',
  '- Do NOT give the direct final answer, full solution, or complete summary up front.',
  '- Instead, provide 1–3 concise hints, key clues from the sources, or guiding questions that help the learner think and arrive at the answer themselves.',
  '- Invite the learner to share their attempt before asking for the full answer.',
].join('\n');

/**
 * Appends hints-only pedagogical instructions to `systemPrompt` when `mode === 'hints'`
 * and `revealFullAnswer` is not explicitly true.
 */
export function applyHintsPrompt(
  systemPrompt: string,
  mode: AiLearningMode,
  options?: { revealFullAnswer?: boolean }
): string {
  if (mode !== 'hints' || options?.revealFullAnswer) {
    return systemPrompt;
  }
  return `${systemPrompt}\n\n${HINTS_MODE_PROMPT_GUIDANCE}`;
}
