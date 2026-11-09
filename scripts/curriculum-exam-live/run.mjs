import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';

// 1. Ensure port 3000 is clean
try {
  execSync('node scripts/ensure-port-free.js', { stdio: 'inherit' });
} catch {}

const directory = fs.mkdtempSync(path.resolve('.baglib-data/exam-live-'));
const profile = path.join(directory, 'profile');
const evidence = path.join(directory, 'evidence');
const courseFilesDir = path.join(profile, 'course-files');
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });
fs.mkdirSync(courseFilesDir, { recursive: true });

// 2. Safely copy real statistics course PDFs into throwaway profile
const courseRoot = 'U:\\Cources\\الجامعة\\السنة الرابعة والأخيرة بإذن الله\\الترم الأول';
const statSrc = path.join(courseRoot, 'إحصاء رياضي', 'Mathematical Statistics Study Guide.pdf');
const econSrc = path.join(
  courseRoot,
  'اقتصاد قياسي',
  '[mid] Econometrics Exam Study Guide - Parts I and II.pdf'
);

assert.ok(fs.existsSync(statSrc), `Stat course PDF exists at ${statSrc}`);
assert.ok(fs.existsSync(econSrc), `Econometrics course PDF exists at ${econSrc}`);

const statDst = path.join(courseFilesDir, 'stat-guide.pdf');
const econDst = path.join(courseFilesDir, 'econ-guide.pdf');
fs.copyFileSync(statSrc, statDst);
fs.copyFileSync(econSrc, econDst);
console.log('[live] Copied external statistics course PDFs into throwaway profile.');

const coursePdfs = [
  {
    id: 'stat-guide',
    title: 'Mathematical Statistics Study Guide',
    filePath: statDst,
  },
  {
    id: 'econ-guide',
    title: 'Econometrics Exam Study Guide',
    filePath: econDst,
  },
];

// 3. Start Next.js dev server on port 3000
console.log('[live] Starting Next.js dev server on port 3000...');
const nextProcess = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'],
  {
    stdio: 'ignore',
    windowsHide: true,
  }
);

let devServerReady = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch('http://127.0.0.1:3000');
    if (res.status === 200 || res.status === 304 || res.status === 404) {
      devServerReady = true;
      console.log('[live] Next.js dev server is ready.');
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}
assert.ok(devServerReady, 'Next.js dev server failed to start within 60s');

const env = {
  ...process.env,
  BAGLIB_DATA_DIR: profile,
  BAGLIB_EXAM_PROFILE: profile,
  BAGLIB_EXAM_EVIDENCE: evidence,
  BAGLIB_COURSE_PDFS: JSON.stringify(coursePdfs),
  BAGLIB_REGISTER_PROTOCOL: '0',
};

const runLang = async (lang) => {
  console.log(`[live] Starting Electron in ${lang}...`);
  const child = spawn(electron, ['scripts/curriculum-exam-live/main.cjs'], {
    env: { ...env, BAGLIB_EXAM_LANG: lang },
    stdio: 'inherit',
  });

  return new Promise((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Electron exited with code ${code}`));
    });
  });
};

try {
  await runLang('ar');
  await runLang('en');
  console.log('[live] Both Arabic and English Electron runs completed successfully.');

  // Copy evidence screenshots to permanent evidence directory
  const permEvidence = path.resolve('.baglib-data/key285-evidence');
  fs.mkdirSync(permEvidence, { recursive: true });
  for (const file of fs.readdirSync(evidence)) {
    fs.copyFileSync(path.join(evidence, file), path.join(permEvidence, file));
    console.log(`[live] Saved evidence screenshot: ${file}`);
  }
} finally {
  console.log('[live] Cleaning up dev server and throwaway profile...');
  try {
    nextProcess.kill('SIGTERM');
  } catch {}
  try {
    fs.rmSync(directory, { recursive: true, force: true });
    console.log('[live] Cleaned up throwaway directory:', directory);
  } catch (err) {
    console.warn('[live] Warning: could not remove throwaway dir immediately:', err.message);
  }
}
