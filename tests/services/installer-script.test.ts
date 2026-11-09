import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load } from 'js-yaml';

const config = load(fs.readFileSync('electron-builder.yml', 'utf8')) as {
  fileAssociations: { ext: string; name: string }[];
  nsis: { oneClick: boolean; allowToChangeInstallationDirectory: boolean; installerLanguages: string[]; include: string };
};
const script = fs.readFileSync(config.nsis.include, 'utf8');

test('the installer asks instead of installing silently', () => {
  assert.equal(config.nsis.oneClick, false);
  assert.equal(config.nsis.allowToChangeInstallationDirectory, true);
  assert.deepEqual(config.nsis.installerLanguages, ['en_US', 'ar_SA']);
});

test('the installer script stays UTF-8 with a BOM, or NSIS garbles the Arabic', () => {
  assert.deepEqual([...fs.readFileSync(config.nsis.include).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('every option string exists in English and Arabic', () => {
  const strings = [...script.matchAll(/LangString (baglib\w+) (\d+) /gu)];
  const languages = new Map<string, Set<string>>();
  for (const [, id, language] of strings) languages.set(id, (languages.get(id) ?? new Set()).add(language));
  assert.ok(languages.size >= 5);
  for (const [id, seen] of languages) assert.deepEqual([...seen].sort(), ['1025', '1033'], id);
});

test('removing file associations covers exactly what electron-builder registers', () => {
  const listed = [...script.matchAll(/baglibUnregisterFileType "([^"]+)" "([^"]+)"/gu)].map(match => `${match[1]}|${match[2]}`).sort();
  assert.deepEqual(listed, config.fileAssociations.map(item => `${item.ext}|${item.name}`).sort());
});

test('every installer variable is declared, because warnings are off and NSIS would treat it as text', () => {
  const declared = new Set([...script.matchAll(/^\s*Var (\w+)/gmu)].map(match => match[1]));
  for (const [, name] of script.matchAll(/\$(baglib\w+)/gu)) assert.ok(declared.has(name), name);
  // baglibSkipAssociations, at 22 characters, compiled to literal text with warnings off. A shorter name fixed it.
  for (const name of declared) assert.ok(name.length <= 21, name);
});

test('engine setup verifies shaping wheels separately after both base installs', () => {
  const setup = fs.readFileSync('scripts/setup-pdf-engine.ps1', 'utf8');
  const base = fs.readFileSync('assets/pdf-editor/requirements.txt', 'utf8');
  assert.doesNotMatch(base, /--hash/u);
  const installs = setup.split(/\r?\n/u).filter(line => line.startsWith('& $enginePython -m pip install'));
  const baseInstalls = installs.filter(line => line.includes('/requirements.txt'));
  assert.equal(baseInstalls.length, 2);
  for (const baseInstall of baseInstalls) {
    const shaping = installs[installs.indexOf(baseInstall) + 1];
    assert.ok(shaping.includes('/requirements-shaping.txt'));
    assert.ok(shaping.includes('--require-hashes'));
    assert.equal(shaping.includes('--target $embeddedPackages'), baseInstall.includes('--target $embeddedPackages'));
    assert.equal(shaping.includes('--upgrade'), baseInstall.includes('--upgrade'));
  }
});
