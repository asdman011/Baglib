// Live check for KEY-275 OCR Suspect Review in real Electron app
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';

const directory = fs.mkdtempSync(path.resolve('.baglib-data/ocr-review-live-'));
const evidenceDir = process.env.BAGLIB_EVIDENCE_DIR || path.resolve('.baglib-data/key292-evidence');
if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

// Copy real benchmark files to throwaway directory
const realArabicScan = path.resolve('tests/real-files/pdf/ar/scanned-image-only/تفسير الموعذتين لابن تيمية.pdf');
const realEnglishPdf = path.resolve('tests/real-files/pdf/en/text-layer/New Scientist International Edition - 19_November_2016.pdf');

const throwawayArabic = path.join(directory, 'arabic-scan.pdf');
const throwawayEnglish = path.join(directory, 'english-sample.pdf');

fs.copyFileSync(realArabicScan, throwawayArabic);
fs.copyFileSync(realEnglishPdf, throwawayEnglish);

const env = {
  ...process.env,
  BAGLIB_DATA_DIR: directory,
  BAGLIB_OCR_REVIEW_LIVE_DIR: directory,
  BAGLIB_EVIDENCE_DIR: evidenceDir,
};
delete env.ELECTRON_RUN_AS_NODE;

console.log('[ocr-review-live] Starting Electron harness in', directory);

const child = spawn(
  electron,
  ['scripts/ocr-review-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'],
  { env, stdio: 'inherit', windowsHide: true }
);

const timer = setTimeout(() => {
  console.error('[ocr-review-live] Timed out after 5 minutes');
  child.kill();
}, 300000);

const trimProfile = () => {
  // Copy screenshots to evidence directory before cleaning
  try {
    const files = fs.readdirSync(directory);
    for (const f of files) {
      if (f.endsWith('.png') || f.endsWith('.json')) {
        fs.copyFileSync(path.join(directory, f), path.join(evidenceDir, f));
      }
    }
  } catch (err) {
    console.warn('[ocr-review-live] Error copying evidence:', err);
  }

  // Drop temporary directories
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      try {
        fs.rmSync(path.join(directory, entry.name), { recursive: true, force: true });
      } catch {}
    }
  }
};

child.once('exit', (code) => {
  clearTimeout(timer);
  trimProfile();
  console.log(JSON.stringify({ directory, evidenceDir, code }));
  process.exitCode = code ?? 1;
});
