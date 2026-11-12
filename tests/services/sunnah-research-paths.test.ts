import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { sunnahResearchPaths } from '../../src/main/services/sunnah/research-paths';

// KEY-265: installed builds find the merged Sunnah database shipped in resources/sunnah; a profile copy still wins.
test('installed builds look in the profile first, then in the installer resources', () => {
  const paths = sunnahResearchPaths({ packaged: true, userData: 'C:/Users/u/AppData/Roaming/baglib', appPath: 'C:/Program Files/Baglib/resources/app.asar', resourcesPath: 'C:/Program Files/Baglib/resources' });
  assert.deepEqual(paths.slice(0, 2), [
    path.join('C:/Users/u/AppData/Roaming/baglib', 'sunnah', 'sunnah_merged_quranlab_v1.sqlite'),
    path.join('C:/Program Files/Baglib/resources', 'sunnah', 'sunnah_merged_quranlab_v1.sqlite'),
  ]);
  assert.equal(paths.some(entry => entry.includes('hadith-alignment')), false, 'no development paths in installed builds');
});

test('development builds keep the local alignment output and never look in resources', () => {
  const paths = sunnahResearchPaths({ packaged: false, userData: '/profile', appPath: '/repo', resourcesPath: '/electron/resources' });
  assert.deepEqual(paths.slice(0, 2), [path.join('/profile', 'sunnah', 'sunnah_merged_quranlab_v1.sqlite'), path.join('/repo', 'tools', 'hadith-alignment', 'data', 'output', 'sunnah_merged_quranlab_v1.sqlite')]);
  assert.equal(paths.some(entry => entry.includes(path.join('electron', 'resources'))), false);
});

test('the installer ships the merged database into resources/sunnah', () => {
  const builder = fs.readFileSync(path.resolve('electron-builder.yml'), 'utf8');
  assert.match(builder, /- from: tools\/hadith-alignment\/data\/output\/sunnah_merged_quranlab_v1\.sqlite\r?\n\s+to: sunnah\/sunnah_merged_quranlab_v1\.sqlite/u);
});
