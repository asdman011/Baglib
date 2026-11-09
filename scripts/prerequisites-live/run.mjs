import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';

// 1. Ensure port 3000 is clean
try {
  execSync('node scripts/ensure-port-free.js', { stdio: 'inherit' });
} catch {}

const directory = fs.mkdtempSync(path.resolve('.baglib-data/prereq-live-'));
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
  BAGLIB_PREREQ_PROFILE: profile,
  BAGLIB_PREREQ_EVIDENCE: evidence,
  BAGLIB_COURSE_PDFS: JSON.stringify(coursePdfs),
  BAGLIB_REGISTER_PROTOCOL: '0',
};

const runLang = async (lang) => {
  console.log(`[live] Starting Electron in ${lang}...`);
  const child = spawn(electron, ['scripts/prerequisites-live/main.cjs'], {
    env: { ...env, BAGLIB_PREREQ_LANG: lang },
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
  // Run Arabic
  await runLang('ar');
  // Run English
  await runLang('en');

  // Copy screenshots to persistent evidence directory
  const persistentEvidence = path.resolve('.baglib-data/key288-evidence');
  fs.mkdirSync(persistentEvidence, { recursive: true });
  for (const file of fs.readdirSync(evidence)) {
    if (file.endsWith('.png')) {
      fs.copyFileSync(path.join(evidence, file), path.join(persistentEvidence, file));
    }
  }
  console.log(`[live] Copied evidence screenshots to ${persistentEvidence}`);
} finally {
  console.log('[live] Stopping Next.js dev server...');
  nextProcess.kill();
  try {
    execSync(`taskkill /F /T /PID ${nextProcess.pid}`);
  } catch {}

  console.log('[live] Cleaning up throwaway profile...');
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[live] Failed to remove ${directory}: ${err.message}`);
  }
}
