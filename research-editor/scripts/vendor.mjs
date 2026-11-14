#!/usr/bin/env node
// Vendor tooling for the BagLib research editor (KEY-362).
//
// research-editor/vendor/ holds a pinned subset of AFFiNE's BlockSuite (tag v0.27.4, MIT)
// with BagLib's numbered patches from research-editor/patches/ applied on top.
// Never edit research-editor/vendor/ by hand: add a new numbered patch instead.
//
//   node research-editor/scripts/vendor.mjs check    rebuild tag + patches in a temp folder and
//                                                     fail if research-editor/vendor differs
//   node research-editor/scripts/vendor.mjs rebuild  replace research-editor/vendor with tag + patches
//
// The pristine tag tarball is never downloaded by this script. Point BAGLIB_BLOCKSUITE_TARBALL
// at it, or place it at research-editor/.cache/AFFiNE-v0.27.4.tar.gz (git-ignored).
// Source: https://github.com/toeverything/AFFiNE/archive/refs/tags/v0.27.4.tar.gz

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TAG = 'v0.27.4';
export const TARBALL_SHA256 = '3637540cee52df9866557c6e22a97d6a2a0b1c0916e98cbbf5c45e529b0415bb';
export const TARBALL_URL = `https://github.com/toeverything/AFFiNE/archive/refs/tags/${TAG}.tar.gz`;
const TOP = `AFFiNE-${TAG.slice(1)}`;
/** Paths copied from the tag, relative to the tarball's top folder. */
export const SUBSET = [
  'blocksuite/affine',
  'blocksuite/framework',
  'blocksuite/integration-test',
  'blocksuite/tsconfig.json',
  'tsconfig.json',
  'tsconfig.web.json',
  'LICENSE-MIT',
];

const here = dirname(fileURLToPath(import.meta.url));
export const editorRoot = resolve(here, '..');
export const vendorDir = join(editorRoot, 'vendor');
export const patchesDir = join(editorRoot, 'patches');

function fail(message, code = 1) {
  console.error(`vendor: ${message}`);
  process.exit(code);
}

export function findTarball() {
  const candidates = [
    process.env.BAGLIB_BLOCKSUITE_TARBALL,
    join(editorRoot, '.cache', `AFFiNE-${TAG}.tar.gz`),
  ].filter(Boolean);
  const found = candidates.find(p => existsSync(p));
  if (!found) {
    fail(
      `pristine tarball not found. Set BAGLIB_BLOCKSUITE_TARBALL or place it at ` +
        `research-editor/.cache/AFFiNE-${TAG}.tar.gz.\n  Source: ${TARBALL_URL}\n  sha256: ${TARBALL_SHA256}`,
      2
    );
  }
  return found;
}

async function sha256File(path) {
  const hash = createHash('sha256');
  await new Promise((res, rej) => {
    createReadStream(path).on('data', d => hash.update(d)).on('end', res).on('error', rej);
  });
  return hash.digest('hex');
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) {
    fail(`${cmd} ${args.join(' ')} failed (${r.status}):\n${r.stderr || r.stdout || r.error}`);
  }
  return r.stdout;
}

function tarExe() {
  // Windows ships bsdtar, which accepts drive-letter paths; Git Bash's GNU tar would read "D:" as a host.
  return process.platform === 'win32'
    ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
}

export function listPatches() {
  return readdirSync(patchesDir)
    .filter(f => /^\d{4}-.+\.(diff|patch)$/.test(f))
    .sort();
}

/** Extract the pinned subset and apply every numbered patch into `dest` (which becomes vendor-shaped). */
export async function buildPristinePlusPatches(dest) {
  const tarball = findTarball();
  const digest = await sha256File(tarball);
  if (digest !== TARBALL_SHA256) fail(`tarball sha256 ${digest} does not match the pinned ${TARBALL_SHA256}`);
  const extractRoot = mkdtempSync(join(tmpdir(), 'baglib-blocksuite-'));
  try {
    run(tarExe(), ['-xzf', tarball, '-C', extractRoot, ...SUBSET.map(p => `${TOP}/${p}`)]);
    for (const p of SUBSET) cpSync(join(extractRoot, TOP, p), join(dest, p), { recursive: true });
  } finally {
    rmSync(extractRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  for (const patch of listPatches()) {
    // dest is outside any git work tree, so `git apply` treats paths relative to cwd.
    run('git', ['apply', '-p1', '--whitespace=nowarn', join(patchesDir, patch)], { cwd: dest });
  }
}

function walk(root) {
  const out = new Map();
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist') continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) stack.push(full);
      else out.set(relative(root, full).split(sep).join('/'), full);
    }
  }
  return out;
}

function normalized(path) {
  // Compare text with LF endings so a CRLF checkout (core.autocrlf) is not reported as a change.
  return readFileSync(path).toString('latin1').replace(/\r\n/g, '\n');
}

export function diffTrees(expectedRoot, actualRoot) {
  const expected = walk(expectedRoot);
  const actual = walk(actualRoot);
  const problems = [];
  for (const [rel, full] of expected) {
    if (!actual.has(rel)) problems.push(`missing  ${rel}`);
    else if (normalized(full) !== normalized(actual.get(rel))) problems.push(`changed  ${rel}`);
  }
  for (const rel of actual.keys()) if (!expected.has(rel)) problems.push(`extra    ${rel}`);
  return { problems, fileCount: expected.size };
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'check') {
    const tmp = mkdtempSync(join(tmpdir(), 'baglib-vendor-check-'));
    try {
      await buildPristinePlusPatches(tmp);
      const { problems, fileCount } = diffTrees(tmp, vendorDir);
      if (problems.length) {
        console.error(problems.slice(0, 50).join('\n'));
        if (problems.length > 50) console.error(`... and ${problems.length - 50} more`);
        fail(
          `research-editor/vendor differs from ${TAG} + ${listPatches().length} patch(es) in ${problems.length} file(s). ` +
            'Do not edit vendor/ directly: revert it and add a numbered patch in research-editor/patches/.'
        );
      }
      console.log(`vendor: OK. ${fileCount} files match BlockSuite ${TAG} + patches ${listPatches().join(', ')}.`);
    } finally {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  } else if (cmd === 'rebuild') {
    const tmp = mkdtempSync(join(tmpdir(), 'baglib-vendor-rebuild-'));
    try {
      await buildPristinePlusPatches(tmp);
      rmSync(vendorDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      cpSync(tmp, vendorDir, { recursive: true });
      console.log(`vendor: rebuilt from ${TAG} + ${listPatches().join(', ')}.`);
    } finally {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  } else {
    fail('usage: vendor.mjs check | rebuild', 64);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => fail(err.stack || String(err)));
}
