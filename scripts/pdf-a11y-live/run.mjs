// Live verification harness for KEY-272 PDF accessibility check and reflowed read-aloud
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';

const directory = fs.mkdtempSync(path.resolve('.baglib-data/pdf-a11y-live-'));
const evidenceDir = path.resolve('.baglib-data/key272-evidence');
if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

// Copy real benchmark files to throwaway directory
const realArabicScan = path.resolve('tests/real-files/pdf/ar/scanned-image-only/تفسير الموعذتين لابن تيمية.pdf');
const realArabicText = path.resolve('tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf');
const realEnglishMag = path.resolve('tests/real-files/pdf/en/text-layer/New Scientist International Edition - 19_November_2016.pdf');
const realEnglishBook = path.resolve('tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf');

const throwawayArabicScan = path.join(directory, 'arabic-scanned.pdf');
const throwawayArabicText = path.join(directory, 'arabic-text.pdf');
const throwawayEnglishMag = path.join(directory, 'english-magazine.pdf');
const throwawayEnglishBook = path.join(directory, 'english-book.pdf');

fs.copyFileSync(realArabicScan, throwawayArabicScan);
fs.copyFileSync(realArabicText, throwawayArabicText);
fs.copyFileSync(realEnglishMag, throwawayEnglishMag);
fs.copyFileSync(realEnglishBook, throwawayEnglishBook);

const env = {
  ...process.env,
  BAGLIB_DATA_DIR: directory,
  BAGLIB_PDF_A11Y_LIVE_DIR: directory,
  BAGLIB_EVIDENCE_DIR: evidenceDir,
};
delete env.ELECTRON_RUN_AS_NODE;

console.log('[pdf-a11y-live] Starting Electron harness in', directory);

const child = spawn(
  electron,
  ['scripts/pdf-a11y-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'],
  { env, stdio: 'inherit', windowsHide: true }
);

const timer = setTimeout(() => {
  console.error('[pdf-a11y-live] Timed out after 180s');
  child.kill('SIGTERM');
  process.exit(1);
}, 180_000);

child.on('exit', (code) => {
  clearTimeout(timer);
  try {
    // Copy any captured screenshots from throwaway to evidence directory
    if (fs.existsSync(directory)) {
      const files = fs.readdirSync(directory);
      for (const f of files) {
        if (f.endsWith('.png')) {
          fs.copyFileSync(path.join(directory, f), path.join(evidenceDir, f));
        }
      }
      fs.rmSync(directory, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('[pdf-a11y-live] Cleanup warning:', err);
  }

  if (code !== 0) {
    console.error(`[pdf-a11y-live] Child exited with code ${code}`);
    process.exit(code || 1);
  }
  console.log('[pdf-a11y-live] Harness completed successfully with code 0.');
});
