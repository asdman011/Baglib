import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { translations } from '../../src/renderer/translations';

// The native file pickers showed Arabic titles and filter names in the English interface.
test('file and folder pickers take their words from translations in the page language', () => {
  const main = fs.readFileSync(path.resolve('src/main/ipc/system.ts'), 'utf8');
  assert.equal(/[؀-ۿ]/u.test(main), false, 'no Arabic literals in system dialogs');
  for (const channel of ['system:open-file-dialog', 'system:open-files-dialog', 'system:open-directory-dialog']) {
    assert.match(main, new RegExp(`'${channel}', async \\(_event, language\\?: unknown\\)`), channel);
  }
  const preload = fs.readFileSync(path.resolve('src/preload/index.ts'), 'utf8');
  for (const channel of ['system:open-file-dialog', 'system:open-files-dialog', 'system:open-directory-dialog']) {
    assert.ok(preload.includes(`ipcRenderer.invoke('${channel}', document.documentElement.lang)`), channel + ' passes the page language');
  }
  for (const key of ['dialogPickBook', 'dialogPickBooks', 'dialogPickScanFolder', 'dialogFilterAllBooks', 'dialogFilterPdf', 'dialogFilterEbooks', 'dialogFilterText', 'dialogFilterAll'] as const) {
    assert.ok(translations.ar[key] && translations.en[key], key);
  }
  assert.equal(translations.en.dialogPickScanFolder, 'Select a folder to scan for missing files');
});
