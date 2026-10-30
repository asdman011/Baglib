import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

test('Poetry bundles five pinned offline font families and their original OFL licenses', () => {
  const directory = path.resolve('src/renderer/public/assets/poetry-fonts');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as { revision: string; files: { file: string; source: string; bytes: number; sha256: string }[] };
  assert.match(manifest.revision, /^[a-f0-9]{40}$/u);
  assert.equal(manifest.files.length, 10);
  const css = fs.readFileSync('src/renderer/app/globals.css', 'utf8');
  for (const family of ['amiri', 'scheherazadenew', 'notonaskharabic', 'ebgaramond', 'lora']) {
    assert.ok(css.includes(`/assets/poetry-fonts/${family}.ttf`));
    assert.ok(fs.readFileSync(path.join(directory, `${family}-OFL.txt`), 'utf8').includes('SIL OPEN FONT LICENSE'));
  }
  for (const item of manifest.files) {
    assert.equal(path.basename(item.file), item.file);
    assert.ok(item.source.startsWith(`https://raw.githubusercontent.com/google/fonts/${manifest.revision}/ofl/`));
    const content = fs.readFileSync(path.join(directory, item.file));
    assert.equal(content.length, item.bytes);
    assert.equal(createHash('sha256').update(content).digest('hex'), item.sha256);
    if (item.file.endsWith('.ttf')) assert.equal(content.readUInt32BE(0), 0x00010000);
  }
});
