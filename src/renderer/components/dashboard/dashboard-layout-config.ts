export type DashboardModuleId =
  | 'today'
  | 'calendar'
  | 'readingGoals'
  | 'activeReads'
  | 'studyProgress'
  | 'studyInsights'
  | 'scratchpad'
  | 'athan'
  | 'khatmah'
  | 'studyRhythm';

export interface DashboardModuleItem {
  id: DashboardModuleId;
  visible: boolean;
}

export interface DashboardLayoutState {
  version: 1;
  modules: DashboardModuleItem[];
}

export const DASHBOARD_LAYOUT_SETTINGS_KEY = 'dashboard.layout.v1';

export const DEFAULT_DASHBOARD_MODULES: DashboardModuleItem[] = [
  { id: 'today', visible: true },
  { id: 'calendar', visible: true },
  { id: 'readingGoals', visible: false },
  { id: 'activeReads', visible: false },
  { id: 'studyProgress', visible: false },
  { id: 'studyInsights', visible: false },
  { id: 'scratchpad', visible: false },
  { id: 'athan', visible: true },
  { id: 'khatmah', visible: false },
  { id: 'studyRhythm', visible: false },
];

export const VALID_MODULE_IDS: readonly DashboardModuleId[] = [
  'today',
  'calendar',
  'readingGoals',
  'activeReads',
  'studyProgress',
  'studyInsights',
  'scratchpad',
  'athan',
  'khatmah',
  'studyRhythm',
] as const;

export function validateDashboardLayout(raw: unknown): DashboardLayoutState {
  if (!raw || typeof raw !== 'object') {
    return { version: 1, modules: [...DEFAULT_DASHBOARD_MODULES] };
  }

  const candidate = raw as Partial<DashboardLayoutState>;
  if (!Array.isArray(candidate.modules)) {
    return { version: 1, modules: [...DEFAULT_DASHBOARD_MODULES] };
  }

  const seen = new Set<DashboardModuleId>();
  const sanitized: DashboardModuleItem[] = [];

  for (const item of candidate.modules) {
    if (
      item &&
      typeof item === 'object' &&
      typeof item.id === 'string' &&
      VALID_MODULE_IDS.includes(item.id as DashboardModuleId) &&
      !seen.has(item.id as DashboardModuleId)
    ) {
      const id = item.id as DashboardModuleId;
      seen.add(id);
      sanitized.push({
        id,
        visible: typeof item.visible === 'boolean' ? item.visible : true,
      });
    }
  }

  // Append any missing modules
  for (const def of DEFAULT_DASHBOARD_MODULES) {
    if (!seen.has(def.id)) {
      sanitized.push({ ...def });
      seen.add(def.id);
    }
  }

  return { version: 1, modules: sanitized };
}

export async function loadDashboardLayout(): Promise<DashboardLayoutState> {
  try {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (api?.settings?.get) {
      const raw = await api.settings.get(
        DASHBOARD_LAYOUT_SETTINGS_KEY,
        { version: 1, modules: DEFAULT_DASHBOARD_MODULES }
      );
      return validateDashboardLayout(raw);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(DASHBOARD_LAYOUT_SETTINGS_KEY);
      if (stored) {
        return validateDashboardLayout(JSON.parse(stored));
      }
    }
  } catch {}
  return { version: 1, modules: [...DEFAULT_DASHBOARD_MODULES] };
}

export async function saveDashboardLayout(
  layout: DashboardLayoutState
): Promise<DashboardLayoutState> {
  const validated = validateDashboardLayout(layout);
  try {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (api?.settings?.set) {
      await api.settings.set(DASHBOARD_LAYOUT_SETTINGS_KEY, validated);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        DASHBOARD_LAYOUT_SETTINGS_KEY,
        JSON.stringify(validated)
      );
    }
  } catch {}
  return validated;
}

export function moveDashboardModule(
  modules: DashboardModuleItem[],
  id: DashboardModuleId,
  direction: 'up' | 'down'
): DashboardModuleItem[] {
  const index = modules.findIndex((m) => m.id === id);
  if (index === -1) return modules;
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= modules.length) return modules;

  const next = [...modules];
  const [removed] = next.splice(index, 1);
  next.splice(targetIndex, 0, removed);
  return next;
}

export function toggleDashboardModuleVisibility(
  modules: DashboardModuleItem[],
  id: DashboardModuleId
): DashboardModuleItem[] {
  return modules.map((m) =>
    m.id === id ? { ...m, visible: !m.visible } : m
  );
}
