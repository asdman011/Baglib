import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { qulPresetFile, qulResourceRoot, suppliedRecitationFile } from '../../src/main/services/quran/qul-paths';
import { readerPresets } from '../../src/shared/quran-resource-presets';

// KEY-264: installed builds read the basic Quran packs from resources/quran; development builds from repos/.
const installed = { packaged: true, appPath: 'C:/Program Files/Baglib/resources/app.asar', resourcesPath: 'C:/Program Files/Baglib/resources' };
const dev = { packaged: false, appPath: 'D:/repo/Baglib' };

test('installed builds read QUL packs from the installer resources, never from repos', () => {
  assert.equal(qulResourceRoot(installed), path.join('C:/Program Files/Baglib/resources', 'quran', 'QUL Developer Resources'));
  assert.equal(qulResourceRoot({ packaged: true, appPath: installed.appPath }), null);
  for (const preset of readerPresets) {
    const file = qulPresetFile(installed, preset)!;
    assert.ok(path.normalize(file).startsWith(path.normalize(path.join(installed.resourcesPath, 'quran'))), `${preset.id} stays inside resources/quran`);
    assert.equal(file.includes('repos'), false);
  }
});

test('development builds keep reading the developer copy, including the out-of-tree Mukhtasar preset', () => {
  assert.equal(qulResourceRoot(dev), path.join('D:/repo/Baglib', 'repos', 'Quran', 'QUL Developer Resources'));
  const mukhtasar = readerPresets.find(preset => preset.id === 'tafsir/251')!;
  assert.equal(qulPresetFile(dev, mukhtasar), path.join('D:/repo/Baglib', '.baglib-data', 'qul-phase1', 'arabic-mukhtasar-tafsir-sqlite.zip'));
  assert.equal(qulPresetFile(installed, mukhtasar), path.join(installed.resourcesPath, 'quran', 'extra', 'arabic-mukhtasar-tafsir-sqlite.zip'));
});

test('supplied recitation audio resolves only for matching Tarteel addresses and a known root', () => {
  const root = qulResourceRoot(installed);
  assert.equal(suppliedRecitationFile(root, 'https://audio-cdn.tarteel.ai/quran/husary/002255.mp3', 2, 255), path.join(root!, '3-Recitations and segments data', 'audio', 'husary', '002', '002255.mp3'));
  assert.equal(suppliedRecitationFile(root, 'https://audio-cdn.tarteel.ai/quran/minshawyMurattal/001001.mp3', 1, 1)?.includes(path.join('minshawi', '001')), true);
  assert.equal(suppliedRecitationFile(root, 'https://audio-cdn.tarteel.ai/quran/husary/002255.mp3', 2, 256), null);
  assert.equal(suppliedRecitationFile(root, 'https://example.com/quran/husary/002255.mp3', 2, 255), null);
  assert.equal(suppliedRecitationFile(root, 'not a url', 2, 255), null);
  assert.equal(suppliedRecitationFile(null, 'https://audio-cdn.tarteel.ai/quran/husary/002255.mp3', 2, 255), null);
});

test('the installer bundles the QUL folder without recitation audio, plus the Mukhtasar file', () => {
  const builder = fs.readFileSync(path.resolve('electron-builder.yml'), 'utf8');
  assert.match(builder, /from: repos\/Quran\/QUL Developer Resources\s+to: quran\/QUL Developer Resources/);
  assert.match(builder, /"!3-Recitations and segments data\/audio\/\*\*"/);
  assert.match(builder, /to: quran\/extra\/arabic-mukhtasar-tafsir-sqlite\.zip/);
});
