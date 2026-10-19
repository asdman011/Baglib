const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const srcWorker = path.join(rootDir, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const srcCmaps = path.join(rootDir, 'node_modules', 'pdfjs-dist', 'cmaps');
const srcFonts = path.join(rootDir, 'node_modules', 'pdfjs-dist', 'standard_fonts');

const targets = [
  path.join(rootDir, 'public', 'vendor', 'pdfjs'),
  path.join(rootDir, 'src', 'renderer', 'public', 'vendor', 'pdfjs'),
];

targets.forEach((targetDir) => {
  fs.mkdirSync(targetDir, { recursive: true });

  if (fs.existsSync(srcWorker)) {
    fs.copyFileSync(srcWorker, path.join(targetDir, 'pdf.worker.min.mjs'));
  }

  if (fs.existsSync(srcCmaps)) {
    fs.cpSync(srcCmaps, path.join(targetDir, 'cmaps'), { recursive: true });
  }

  if (fs.existsSync(srcFonts)) {
    fs.cpSync(srcFonts, path.join(targetDir, 'standard_fonts'), { recursive: true });
  }
});

console.log('[baglib] Copied PDF.js worker, cmaps, and fonts to public vendor directories.');
