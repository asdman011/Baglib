import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NAV_GROUPS,
  NAV_ITEMS,
  NEW_OBJECT_ACTIONS,
  resolveBreadcrumbs,
} from '../../src/renderer/components/layout/nav-model';
import { translations } from '../../src/renderer/translations';

test('Nav Model: Groups Structure & Items', () => {
  // Must have the 5 groups specified by the Figma vision mockup & D4
  const groupIds = NAV_GROUPS.map((g) => g.id);
  assert.deepEqual(groupIds, ['home', 'library', 'notes', 'research', 'islamic']);

  // Check each group's constituent items
  const home = NAV_GROUPS.find((g) => g.id === 'home');
  assert.ok(home);
  assert.deepEqual(home.itemIds, ['dashboard', 'planner', 'statistics']);

  const library = NAV_GROUPS.find((g) => g.id === 'library');
  assert.ok(library);
  assert.deepEqual(library.itemIds, ['library', 'categories', 'lectures']);

  const notes = NAV_GROUPS.find((g) => g.id === 'notes');
  assert.ok(notes);
  assert.deepEqual(notes.itemIds, ['notes', 'notes-boards', 'notes-cards']);

  const research = NAV_GROUPS.find((g) => g.id === 'research');
  assert.ok(research);
  assert.deepEqual(research.itemIds, ['pathways', 'search']);

  const islamic = NAV_GROUPS.find((g) => g.id === 'islamic');
  assert.ok(islamic);
  assert.deepEqual(islamic.itemIds, ['quran', 'sunnah', 'bayan']);
});

test('Nav Model: Bottom Pinned Actions', () => {
  assert.ok(NAV_ITEMS.settings, 'settings must be defined in NAV_ITEMS');
  assert.equal(NAV_ITEMS.settings.viewMode, 'settings');
  assert.equal(NAV_ITEMS.settings.actionType, 'view');

  assert.ok(NAV_ITEMS.support, 'support must be defined in NAV_ITEMS');
  assert.equal(NAV_ITEMS.support.actionType, 'support');
});

test('Nav Model: New Object Menu Actions (D3)', () => {
  const actionIds = NEW_OBJECT_ACTIONS.map((a) => a.id);
  assert.deepEqual(actionIds, [
    'import-book',
    'add-physical-book',
    'new-note',
    'new-card',
    'new-task',
    'new-research',
  ]);

  for (const action of NEW_OBJECT_ACTIONS) {
    assert.ok(action.labelKey in translations.ar, `Missing ar translation for ${action.labelKey}`);
    assert.ok(action.labelKey in translations.en, `Missing en translation for ${action.labelKey}`);
    assert.ok(action.icon, `Missing icon for action ${action.id}`);
  }
});

test('Nav Model: Breadcrumb Resolution Across All Workspaces', () => {
  // 1. Dashboard
  const dashCrumb = resolveBreadcrumbs('dashboard');
  assert.equal(dashCrumb.parent.labelKey, 'navHomeGroup');
  assert.equal(dashCrumb.parent.viewMode, 'dashboard');
  assert.equal(dashCrumb.current.labelKey, 'navDashboard');

  // 2. Planner
  const plannerCrumb = resolveBreadcrumbs('planner');
  assert.equal(plannerCrumb.parent.labelKey, 'navHomeGroup');
  assert.equal(plannerCrumb.current.labelKey, 'plannerTitle');

  // 3. Library (default)
  const libCrumb = resolveBreadcrumbs('library');
  assert.equal(libCrumb.parent.labelKey, 'navLibraryGroup');
  assert.equal(libCrumb.parent.viewMode, 'library');
  assert.equal(libCrumb.current.labelKey, 'breadcrumbAllBooks');

  // 4. Library (filtered by category)
  const catLibCrumb = resolveBreadcrumbs('library', { activeCategoryName: 'الفقه المالكي' });
  assert.equal(catLibCrumb.parent.labelKey, 'navLibraryGroup');
  assert.equal(catLibCrumb.current.rawText, 'الفقه المالكي');

  // 5. Reader (with book title)
  const readerCrumb = resolveBreadcrumbs('reader', { activeBookTitle: 'تفسير ابن تيمية' });
  assert.equal(readerCrumb.parent.labelKey, 'navLibraryGroup');
  assert.equal(readerCrumb.parent.viewMode, 'library');
  assert.equal(readerCrumb.current.rawText, 'تفسير ابن تيمية');

  // 6. Reader (fallback without title)
  const readerFallbackCrumb = resolveBreadcrumbs('reader');
  assert.equal(readerFallbackCrumb.parent.labelKey, 'navLibraryGroup');
  assert.equal(readerFallbackCrumb.current.labelKey, 'navReader');

  // 7. Categories
  const catCrumb = resolveBreadcrumbs('categories');
  assert.equal(catCrumb.parent.labelKey, 'navLibraryGroup');
  assert.equal(catCrumb.current.labelKey, 'navCategories');

  // 8. Lectures
  const lectCrumb = resolveBreadcrumbs('lectures');
  assert.equal(lectCrumb.parent.labelKey, 'navLibraryGroup');
  assert.equal(lectCrumb.current.labelKey, 'lecturesTitle');

  // 9. Notes
  const notesCrumb = resolveBreadcrumbs('notes');
  assert.equal(notesCrumb.parent.labelKey, 'navNotesGroup');
  assert.equal(notesCrumb.current.labelKey, 'navNotesLog');

  // 10. Pathways
  const pathwaysCrumb = resolveBreadcrumbs('pathways');
  assert.equal(pathwaysCrumb.parent.labelKey, 'navResearchGroup');
  assert.equal(pathwaysCrumb.current.labelKey, 'pathwaysTitle');

  // 11. Quran
  const quranCrumb = resolveBreadcrumbs('quran');
  assert.equal(quranCrumb.parent.labelKey, 'navIslamicGroup');
  assert.equal(quranCrumb.current.labelKey, 'navQuran');

  // 12. Sunnah
  const sunnahCrumb = resolveBreadcrumbs('sunnah');
  assert.equal(sunnahCrumb.parent.labelKey, 'navIslamicGroup');
  assert.equal(sunnahCrumb.current.labelKey, 'navSunnah');

  // 13. Bayan
  const bayanCrumb = resolveBreadcrumbs('bayan');
  assert.equal(bayanCrumb.parent.labelKey, 'navIslamicGroup');
  assert.equal(bayanCrumb.current.labelKey, 'navBayan');

  // 14. Settings
  const settingsCrumb = resolveBreadcrumbs('settings');
  assert.equal(settingsCrumb.parent.labelKey, 'breadcrumbSystem');
  assert.equal(settingsCrumb.current.labelKey, 'navSettings');
});

test('Nav Model: Bilingual Translations Parity for All Keys', () => {
  const allNavKeys = [
    'brandSubtitle',
    'newObjectButton',
    'newObjectMenuTitle',
    'newObjectImportBook',
    'newObjectAddPhysical',
    'newObjectNewNote',
    'newObjectNewCard',
    'newObjectNewTask',
    'newObjectNewResearch',
    'navHomeGroup',
    'navLibraryGroup',
    'navNotesGroup',
    'navResearchGroup',
    'navIslamicGroup',
    'navNotesLog',
    'navNotesBoards',
    'navNotesCards',
    'navDiscoveryHub',
    'navSupport',
    'supportSheetTitle',
    'supportSheetDesc',
    'supportVersion',
    'supportDataLocation',
    'supportEnvironment',
    'supportLocalFirstPromise',
    'breadcrumbAllBooks',
    'breadcrumbHome',
    'breadcrumbSystem',
    'mobileNavOpen',
    'mobileNavClose',
  ] as const;

  for (const key of allNavKeys) {
    assert.ok(translations.ar[key], `translations.ar must have key ${key}`);
    assert.ok(translations.en[key], `translations.en must have key ${key}`);
    assert.ok(translations.ar[key].length > 0, `translations.ar[${key}] must not be empty`);
    assert.ok(translations.en[key].length > 0, `translations.en[${key}] must not be empty`);
  }
});
