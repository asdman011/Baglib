import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SETTINGS_DIRECTORY, SETTINGS_GROUPS } from '../../src/renderer/components/layout/settings-directory-model';
import { translations } from '../../src/renderer/translations';

// Read registered preference keys from their existing owners. Content records, caches,
// credentials derived by app-lock, and per-document drafts are operational data.
const sources = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(directory, entry.name);
  if (entry.isDirectory()) return ['.next', 'out', 'node_modules'].includes(entry.name) ? [] : sources(full);
  return /\.tsx?$/.test(entry.name) && entry.name !== 'translations.ts' ? [full] : [];
});
const operational = new Set([
  'planner.groups.v1', // User-authored group names and display ordering, managed in Tasks (KEY-341).
  'planner.reminder-delivery.v1', // Durable per-task notification delivery ledger (KEY-341).
  'athan.mawaqit.cache.v1', // Cached mosque response.
  'app_lock:pin_hash', 'app_lock:pin_salt', // Derived secrets owned by the lock editor.
  'courses.coursera.v1', // Catalog snapshot.
  'pathways.templates.v1', // User-authored templates.
  'media.lecture-subtitles.v1', // Per-lecture subtitle paths, selected inside the player (KEY-343).
  'media.lectures-works.v1', // Idempotent conversion marker from legacy lecture settings (KEY-342).
  'media.lectures.v1', // Lecture content records.
  'dashboard.scratchpad.draft.v1', // Unsaved note content.
  'islamic.continue.v1', // Last reading positions.
  'notifications.history.v1', // Delivered notification records (KEY-312).
  'rss.feeds.v1', // Registered feed addresses, managed in the online hub's RSS tab (KEY-50).
  'rss.seen.v1', // Feed items already reported, so notifications only cover newer ones.
  'baglib.notes.folder', // The Notes tab's last open folder, so a return visit opens where the user left (KEY-338).
  'baglib.poetry.size', // Verse size, changed inside the poem's reading options or with Ctrl+wheel, like the Sunnah text size kept with its reading position (KEY-339).
]);

test('every registered setting key appears in the settings directory', () => {
  const registered = new Set<string>();
  for (const owner of sources(path.resolve('src'))) {
    const code = fs.readFileSync(path.resolve(owner), 'utf8');
    for (const match of code.matchAll(/\b([A-Z][A-Z_]*(?:KEY|SETTING|STATE|CONFIG|SALT|HASH)|SETTING_[A-Z_]+)\s*=\s*['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('DEFAULT_') && !operational.has(match[2])) registered.add(match[2]);
    }
  }
  // Preferences registered as literal keys rather than constants.
  for (const key of ['baglib-lang', 'baglib-theme', 'library_view_preferences', 'undo.scope.v1', 'knowledge.questions.enabled', 'dashboard.study.preferences.v1', 'onboarding.v1']) registered.add(key);
  assert.ok(registered.size >= 25, 'owner scan must enumerate actual registrations');
  const directory = new Set(SETTINGS_DIRECTORY.flatMap(entry => [...entry.keys]));
  assert.deepEqual([...registered].filter(key => !directory.has(key)), []);
});
test('all ten groups have reachable entries and localized descriptions', () => {
  assert.equal(SETTINGS_GROUPS.length, 10);
  for (const group of SETTINGS_GROUPS) assert.ok(SETTINGS_DIRECTORY.some(entry => entry.group === group.id));
  for (const entry of SETTINGS_DIRECTORY) for (const language of ['ar', 'en'] as const) {
    assert.ok(translations[language][entry.label].trim());
    assert.ok(translations[language][entry.description].length > 20);
    assert.ok(entry.action);
  }
});
