import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundledPdfEngineRoot, pdfEnginePython, pdfEngineRoot } from '../../src/main/services/pdf-editor/engine-root';

const withResources = (resources: string | undefined, run: () => void) => {
  const original = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
  Object.defineProperty(process, 'resourcesPath', { value: resources, configurable: true });
  try { run(); } finally {
    if (original) Object.defineProperty(process, 'resourcesPath', original);
    else delete (process as { resourcesPath?: string }).resourcesPath;
  }
};

test('an installed app reads engine tools from resources', () => {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-engine-'));
  fs.mkdirSync(path.join(resources, 'pdf-engine'));
  withResources(resources, () => {
    assert.equal(bundledPdfEngineRoot(), path.join(resources, 'pdf-engine'));
    assert.equal(pdfEngineRoot(), path.join(resources, 'pdf-engine'));
  });
  fs.rmSync(resources, { recursive: true, force: true });
});

test('development falls back to the local engine folder', () => {
  withResources(undefined, () => {
    assert.equal(bundledPdfEngineRoot(), null);
    assert.equal(pdfEngineRoot(), path.resolve('.baglib-data', 'pdf-engine'));
  });
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-engine-'));
  withResources(empty, () => assert.equal(bundledPdfEngineRoot(), null));
  fs.rmSync(empty, { recursive: true, force: true });
});

test('a venv wins over the embeddable Python, which is used when no venv exists', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-python-'));
  const embedded = path.join(root, 'python', 'python.exe');
  const venv = path.join(root, 'venv', 'Scripts', 'python.exe');
  fs.mkdirSync(path.dirname(embedded), { recursive: true });
  fs.writeFileSync(embedded, '');
  assert.equal(pdfEnginePython(root), embedded);
  fs.mkdirSync(path.dirname(venv), { recursive: true });
  fs.writeFileSync(venv, '');
  assert.equal(pdfEnginePython(root), venv);
  fs.rmSync(root, { recursive: true, force: true });
});
