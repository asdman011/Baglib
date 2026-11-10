import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  CalendarDays,
  Library,
  Layers,
  Clapperboard,
  BookOpen,
  FileText,
  LayoutGrid,
  Sparkles,
  Route,
  Globe,
  BookMarked,
  BookOpenText,
  Feather,
  Settings,
  HelpCircle,
  Upload,
  BookPlus,
  FilePlus,
  CalendarPlus,
} from 'lucide-react';
import type { WorkspaceViewMode } from '../context/WorkspaceContext';
import type { TranslationKey } from '../../translations';

export type NavGroupId = 'home' | 'library' | 'notes' | 'research' | 'islamic';

export interface NavItemConfig {
  id: string;
  viewMode?: WorkspaceViewMode;
  labelKey: TranslationKey;
  tooltipKey?: TranslationKey;
  icon: LucideIcon;
  actionType: 'view' | 'searchHub' | 'boards' | 'cards' | 'support';
}

export interface NavGroupConfig {
  id: NavGroupId;
  labelKey: TranslationKey;
  itemIds: string[];
}

export interface NewObjectActionConfig {
  id: 'import-book' | 'add-physical-book' | 'new-note' | 'new-card' | 'new-task' | 'new-research';
  labelKey: TranslationKey;
  icon: LucideIcon;
}

export const NAV_GROUPS: NavGroupConfig[] = [
  {
    id: 'home',
    labelKey: 'navHomeGroup',
    itemIds: ['dashboard', 'planner'],
  },
  {
    id: 'library',
    labelKey: 'navLibraryGroup',
    itemIds: ['library', 'categories', 'lectures'],
  },
  {
    id: 'notes',
    labelKey: 'navNotesGroup',
    itemIds: ['notes', 'notes-boards', 'notes-cards'],
  },
  {
    id: 'research',
    labelKey: 'navResearchGroup',
    itemIds: ['pathways', 'search'],
  },
  {
    id: 'islamic',
    labelKey: 'navIslamicGroup',
    itemIds: ['quran', 'sunnah', 'bayan'],
  },
];

export const NAV_SECTIONS: {
  ariaLabelKey: TranslationKey;
  groupIds: NavGroupId[];
}[] = [
  {
    ariaLabelKey: 'navRhythmGroup',
    groupIds: ['home'],
  },
  {
    ariaLabelKey: 'navSourcesGroup',
    groupIds: ['library', 'islamic'],
  },
  {
    ariaLabelKey: 'navKnowledgeGroup',
    groupIds: ['notes', 'research'],
  },
];

export const NAV_ITEMS: Record<string, NavItemConfig> = {
  dashboard: {
    id: 'dashboard',
    viewMode: 'dashboard',
    labelKey: 'navDashboard',
    icon: LayoutDashboard,
    actionType: 'view',
  },
  planner: {
    id: 'planner',
    viewMode: 'planner',
    labelKey: 'plannerTitle',
    icon: CalendarDays,
    actionType: 'view',
  },
  library: {
    id: 'library',
    viewMode: 'library',
    labelKey: 'navLibrary',
    icon: Library,
    actionType: 'view',
  },
  categories: {
    id: 'categories',
    viewMode: 'categories',
    labelKey: 'navCategories',
    icon: Layers,
    actionType: 'view',
  },
  lectures: {
    id: 'lectures',
    viewMode: 'lectures',
    labelKey: 'lecturesTitle',
    icon: Clapperboard,
    actionType: 'view',
  },
  reader: {
    id: 'reader',
    viewMode: 'reader',
    labelKey: 'navReader',
    icon: BookOpen,
    actionType: 'view',
  },
  notes: {
    id: 'notes',
    viewMode: 'notes',
    labelKey: 'navNotesLog',
    icon: FileText,
    actionType: 'view',
  },
  'notes-boards': {
    id: 'notes-boards',
    viewMode: 'notes',
    labelKey: 'navNotesBoards',
    icon: LayoutGrid,
    actionType: 'boards',
  },
  'notes-cards': {
    id: 'notes-cards',
    viewMode: 'notes',
    labelKey: 'navNotesCards',
    icon: Sparkles,
    actionType: 'cards',
  },
  pathways: {
    id: 'pathways',
    viewMode: 'pathways',
    labelKey: 'pathwaysTitle',
    icon: Route,
    actionType: 'view',
  },
  search: {
    id: 'search',
    labelKey: 'navDiscoveryHub',
    icon: Globe,
    actionType: 'searchHub',
  },
  quran: {
    id: 'quran',
    viewMode: 'quran',
    labelKey: 'navQuran',
    icon: BookMarked,
    actionType: 'view',
  },
  sunnah: {
    id: 'sunnah',
    viewMode: 'sunnah',
    labelKey: 'navSunnah',
    icon: BookOpenText,
    actionType: 'view',
  },
  bayan: {
    id: 'bayan',
    viewMode: 'bayan',
    labelKey: 'navBayan',
    tooltipKey: 'navBayanTooltip',
    icon: Feather,
    actionType: 'view',
  },
  settings: {
    id: 'settings',
    viewMode: 'settings',
    labelKey: 'navSettings',
    icon: Settings,
    actionType: 'view',
  },
  support: {
    id: 'support',
    labelKey: 'navSupport',
    icon: HelpCircle,
    actionType: 'support',
  },
};

export const NEW_OBJECT_ACTIONS: NewObjectActionConfig[] = [
  {
    id: 'import-book',
    labelKey: 'newObjectImportBook',
    icon: Upload,
  },
  {
    id: 'add-physical-book',
    labelKey: 'newObjectAddPhysical',
    icon: BookPlus,
  },
  {
    id: 'new-note',
    labelKey: 'newObjectNewNote',
    icon: FilePlus,
  },
  {
    id: 'new-card',
    labelKey: 'newObjectNewCard',
    icon: Sparkles,
  },
  {
    id: 'new-task',
    labelKey: 'newObjectNewTask',
    icon: CalendarPlus,
  },
  {
    id: 'new-research',
    labelKey: 'newObjectNewResearch',
    icon: Route,
  },
];

export interface BreadcrumbSegment {
  labelKey?: TranslationKey;
  rawText?: string;
  viewMode?: WorkspaceViewMode;
}

export interface BreadcrumbData {
  parent: BreadcrumbSegment;
  current: BreadcrumbSegment;
}

export function resolveBreadcrumbs(
  viewMode: WorkspaceViewMode,
  options?: {
    activeBookTitle?: string;
    activeCategoryName?: string;
  }
): BreadcrumbData {
  switch (viewMode) {
    case 'dashboard':
      return {
        parent: { labelKey: 'navHomeGroup', viewMode: 'dashboard' },
        current: { labelKey: 'navDashboard' },
      };
    case 'planner':
      return {
        parent: { labelKey: 'navHomeGroup', viewMode: 'dashboard' },
        current: { labelKey: 'plannerTitle' },
      };
    case 'library':
      return {
        parent: { labelKey: 'navLibraryGroup', viewMode: 'library' },
        current: options?.activeCategoryName
          ? { rawText: options.activeCategoryName }
          : { labelKey: 'breadcrumbAllBooks' },
      };
    case 'categories':
      return {
        parent: { labelKey: 'navLibraryGroup', viewMode: 'library' },
        current: { labelKey: 'navCategories' },
      };
    case 'lectures':
      return {
        parent: { labelKey: 'navLibraryGroup', viewMode: 'library' },
        current: { labelKey: 'lecturesTitle' },
      };
    case 'reader':
      return {
        parent: { labelKey: 'navLibraryGroup', viewMode: 'library' },
        current: options?.activeBookTitle
          ? { rawText: options.activeBookTitle }
          : { labelKey: 'navReader' },
      };
    case 'notes':
      return {
        parent: { labelKey: 'navNotesGroup', viewMode: 'notes' },
        current: { labelKey: 'navNotesLog' },
      };
    case 'pathways':
      return {
        parent: { labelKey: 'navResearchGroup', viewMode: 'pathways' },
        current: { labelKey: 'pathwaysTitle' },
      };
    case 'quran':
      return {
        parent: { labelKey: 'navIslamicGroup', viewMode: 'quran' },
        current: { labelKey: 'navQuran' },
      };
    case 'sunnah':
      return {
        parent: { labelKey: 'navIslamicGroup', viewMode: 'sunnah' },
        current: { labelKey: 'navSunnah' },
      };
    case 'bayan':
      return {
        parent: { labelKey: 'navIslamicGroup', viewMode: 'bayan' },
        current: { labelKey: 'navBayan' },
      };
    case 'settings':
      return {
        parent: { labelKey: 'breadcrumbSystem', viewMode: 'settings' },
        current: { labelKey: 'navSettings' },
      };
    default:
      return {
        parent: { labelKey: 'navHomeGroup', viewMode: 'dashboard' },
        current: { labelKey: 'navDashboard' },
      };
  }
}
