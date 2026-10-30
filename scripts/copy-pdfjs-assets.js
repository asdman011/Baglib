const fs = require('fs');
const path = require('path');
const { buildSync } = require('esbuild');

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
  buildSync({ entryPoints: [path.join(rootDir, 'assets', 'pdf-raster-worker.ts')], outfile: path.join(targetDir, 'pdf.raster.worker.mjs'), bundle: true, format: 'esm', platform: 'browser', target: 'chrome128', minify: true });
  const coverOut = path.join(targetDir, 'pdf.cover.min.js');
  if (!fs.existsSync(coverOut)) {
    buildSync({
      entryPoints: [path.join(rootDir, 'node_modules', 'pdfjs-dist', 'build', 'pdf.mjs')],
      outfile: coverOut,
      bundle: true,
      format: 'iife',
      globalName: 'baglibCoverPdfjs',
      platform: 'browser',
      target: 'chrome128',
      minify: true,
    });
  }
  for (const filename of ['pdf-cover-frame.html', 'pdf-cover-frame.js']) {
    fs.copyFileSync(path.join(rootDir, 'assets', filename), path.join(targetDir, filename));
  }

  const workerDest = path.join(targetDir, 'pdf.worker.min.mjs');
  if (fs.existsSync(srcWorker) && !fs.existsSync(workerDest)) {
    fs.copyFileSync(srcWorker, workerDest);
  }

  const workerBundleOut = path.join(targetDir, 'pdf.worker.bundle.js');
  if (!fs.existsSync(workerBundleOut)) {
    try {
      buildSync({
        entryPoints: [path.join(rootDir, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.mjs')],
        outfile: workerBundleOut,
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'chrome128',
        minify: true,
      });
    } catch (bundleErr) {
      console.warn('[copy-pdfjs-assets] Failed to bundle pdf.worker.bundle.js:', bundleErr);
    }
  }

  const cmapsDest = path.join(targetDir, 'cmaps');
  if (fs.existsSync(srcCmaps) && !fs.existsSync(cmapsDest)) {
    fs.cpSync(srcCmaps, cmapsDest, { recursive: true });
  }

  const fontsDest = path.join(targetDir, 'standard_fonts');
  if (fs.existsSync(srcFonts) && !fs.existsSync(fontsDest)) {
    fs.cpSync(srcFonts, fontsDest, { recursive: true });
  }
});

const outDevDir = path.join(rootDir, 'out', 'dev');
const outDevRoutes = path.join(outDevDir, 'types', 'routes.d.ts');
if (fs.existsSync(outDevRoutes)) {
  try {
    const routesContent = fs.readFileSync(outDevRoutes, 'utf8');
    if (routesContent.includes('type AppRoutes = never')) {
      fs.rmSync(outDevDir, { recursive: true, force: true });
      console.log('[baglib] Cleared stale out/dev Next.js route cache.');
    }
  } catch {}
}

console.log('[baglib] Copied PDF.js worker, cmaps, and fonts to public vendor directories.');
const wav1 = path.join(rootDir, 'public', 'assets', 'audio', 'athan-default.wav');
const wav2 = path.join(rootDir, 'src', 'renderer', 'public', 'assets', 'audio', 'athan-default.wav');
if (!fs.existsSync(wav1) || !fs.existsSync(wav2)) {
  const audioPreparation = require('node:child_process').spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/prepare-athan-audio.ts'],
    { cwd: rootDir, stdio: 'inherit' }
  );
  if (audioPreparation.status !== 0) process.exit(audioPreparation.status || 1);
}
