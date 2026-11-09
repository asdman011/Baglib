import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const CORPUS_DATA_ROOT = fileURLToPath(new URL('../../.baglib-data/', import.meta.url));

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_DERIVED_BYTES_DEFAULT = 100 * 1024 * 1024;

export function defaultUserDataDir() {
  if (process.env.BAGLIB_CORPUS_SOURCE_DIR) {
    return path.resolve(process.env.BAGLIB_CORPUS_SOURCE_DIR);
  }
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'baglib');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'baglib');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'baglib');
}

export function hashFileReadOnly(filePath) {
  const fd = fs.openSync(filePath, fs.constants.O_RDONLY);
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(CHUNK_SIZE);
  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead));
    }
    return hash.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

export function copyAndVerifyReadOnly(sourcePath, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const sourceFd = fs.openSync(sourcePath, fs.constants.O_RDONLY);
  const destFd = fs.openSync(destPath, 'w');
  const sourceHash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(CHUNK_SIZE);
  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(sourceFd, buffer, 0, buffer.length, null)) > 0) {
      const slice = bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead);
      sourceHash.update(slice);
      fs.writeSync(destFd, slice, 0, slice.length);
    }
  } finally {
    fs.closeSync(sourceFd);
    fs.closeSync(destFd);
  }
  const expected = sourceHash.digest('hex');
  const actual = hashFileReadOnly(destPath);
  assert.equal(actual, expected, `Hash mismatch copying ${sourcePath} -> ${destPath}`);
  return expected;
}

function resolveInstalledQuranRoot(sourceUserDataDir) {
  const locationFile = path.join(sourceUserDataDir, 'quran-location.json');
  if (fs.existsSync(locationFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(locationFile, 'utf8'));
      if (typeof parsed.directory === 'string' && path.isAbsolute(parsed.directory)) {
        return parsed.directory;
      }
    } catch {
      // fall back to default quran folder
    }
  }
  return path.join(sourceUserDataDir, 'quran');
}

export function setupThrowawayCorpus(options) {
  if (!options || typeof options.targetDir !== 'string' || !options.targetDir) {
    throw new Error('targetDir is required');
  }
  const targetDir = path.resolve(options.targetDir);
  const sourceUserDataDir = path.resolve(options.sourceUserDataDir || defaultUserDataDir());
  // Validate before creating, copying or deleting anything in the destination.
  if (path.relative(CORPUS_DATA_ROOT, targetDir) === '' || !isWithin(CORPUS_DATA_ROOT, targetDir)) {
    throw new Error('targetDir must be inside the repo .baglib-data folder');
  }
  if (isWithin(sourceUserDataDir, targetDir) || isWithin(targetDir, sourceUserDataDir)) {
    throw new Error('targetDir must not overlap sourceUserDataDir');
  }
  const copyQuran = options.copyQuran !== false;
  const copyPoetry = options.copyPoetry !== false;
  const linkSunnah = options.linkSunnah !== false;
  const includeMushafLayout = options.includeMushafLayout === true;
  const sunnahCorpusFile = path.resolve(
    options.sunnahCorpusFile || 'tools/hadith-alignment/data/output/sunnah_merged_quranlab_v1.sqlite',
  );

  fs.mkdirSync(targetDir, { recursive: true });

  /** @type {{ sourcePath: string; sha256: string }[]} */
  const trackedOriginals = [];
  const copiedPaths = [
    path.join(targetDir, 'quran'),
    path.join(targetDir, 'quran-location.json'),
    path.join(targetDir, 'partitions'),
    path.join(targetDir, 'sunnah'),
  ];

  const quranResult = {
    available: false,
    directory: null,
    skipReason: 'SKIPPED: no installed Quran pack',
    copiedFiles: 0,
  };

  if (copyQuran) {
    const quranRoot = resolveInstalledQuranRoot(sourceUserDataDir);
    const catalogSource = path.join(quranRoot, 'catalog.sqlite');
    const packsSourceDir = path.join(quranRoot, 'packs');
    const packEntries = fs.existsSync(packsSourceDir)
      ? fs.readdirSync(packsSourceDir, { withFileTypes: true }).filter(
          entry => entry.isDirectory() && fs.existsSync(path.join(packsSourceDir, entry.name, 'manifest.json')),
        )
      : [];

    if (fs.existsSync(catalogSource) && packEntries.length > 0) {
      const targetQuranDir = path.join(targetDir, 'quran');
      fs.mkdirSync(path.join(targetQuranDir, 'packs'), { recursive: true });
      fs.mkdirSync(path.join(targetQuranDir, 'derived'), { recursive: true });

      const catalogHash = copyAndVerifyReadOnly(catalogSource, path.join(targetQuranDir, 'catalog.sqlite'));
      trackedOriginals.push({ sourcePath: catalogSource, sha256: catalogHash });
      quranResult.copiedFiles++;

      for (const entry of packEntries) {
        const srcPackDir = path.join(packsSourceDir, entry.name);
        const dstPackDir = path.join(targetQuranDir, 'packs', entry.name);
        const files = fs.readdirSync(srcPackDir, { withFileTypes: true }).filter(file => file.isFile());
        const filesToCopy = includeMushafLayout || files.length <= 10
          ? files.map(file => file.name)
          : files.filter(file => file.name === 'manifest.json').map(file => file.name);

        for (const fileName of filesToCopy) {
          const srcFile = path.join(srcPackDir, fileName);
          const dstFile = path.join(dstPackDir, fileName);
          const digest = copyAndVerifyReadOnly(srcFile, dstFile);
          trackedOriginals.push({ sourcePath: srcFile, sha256: digest });
          quranResult.copiedFiles++;
        }
      }

      const derivedSourceDir = path.join(quranRoot, 'derived');
      if (fs.existsSync(derivedSourceDir)) {
        for (const entry of fs.readdirSync(derivedSourceDir, { withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.sqlite')) continue;
          const srcFile = path.join(derivedSourceDir, entry.name);
          const stat = fs.statSync(srcFile);
          if (!includeMushafLayout && stat.size > MAX_DERIVED_BYTES_DEFAULT) continue;
          const dstFile = path.join(targetQuranDir, 'derived', entry.name);
          const digest = copyAndVerifyReadOnly(srcFile, dstFile);
          trackedOriginals.push({ sourcePath: srcFile, sha256: digest });
          quranResult.copiedFiles++;
        }
      }

      fs.writeFileSync(
        path.join(targetDir, 'quran-location.json'),
        JSON.stringify({ directory: targetQuranDir }),
      );
      quranResult.available = true;
      quranResult.directory = targetQuranDir;
      quranResult.skipReason = null;
    }
  }

  const poetryResult = {
    available: false,
    file: null,
    skipReason: 'SKIPPED: no installed poetry partition',
  };

  if (copyPoetry) {
    const poetrySource = path.join(sourceUserDataDir, 'partitions', 'bayan_poetry.sqlite');
    if (fs.existsSync(poetrySource)) {
      const poetryDest = path.join(targetDir, 'partitions', 'bayan_poetry.sqlite');
      const digest = copyAndVerifyReadOnly(poetrySource, poetryDest);
      trackedOriginals.push({ sourcePath: poetrySource, sha256: digest });
      poetryResult.available = true;
      poetryResult.file = poetryDest;
      poetryResult.skipReason = null;
    }
  }

  const sunnahResult = {
    available: false,
    file: null,
    skipReason: 'SKIPPED: no installed Sunnah corpus',
  };

  if (linkSunnah && fs.existsSync(sunnahCorpusFile)) {
    const digest = hashFileReadOnly(sunnahCorpusFile);
    trackedOriginals.push({ sourcePath: sunnahCorpusFile, sha256: digest });
    fs.mkdirSync(path.join(targetDir, 'sunnah'), { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, 'sunnah', 'research-source.json'),
      JSON.stringify({ filename: sunnahCorpusFile }),
    );
    sunnahResult.available = true;
    sunnahResult.file = sunnahCorpusFile;
    sunnahResult.skipReason = null;
  }

  let cleanedUp = false;
  const cleanup = () => {
    for (const copiedPath of copiedPaths) {
      fs.rmSync(copiedPath, { recursive: true, force: true });
    }
    const copiesDeleted = copiedPaths.every(copiedPath => !fs.existsSync(copiedPath));
    for (const item of trackedOriginals) {
      const currentHash = hashFileReadOnly(item.sourcePath);
      assert.equal(currentHash, item.sha256, `Original corpus file changed during test: ${item.sourcePath}`);
    }
    cleanedUp = true;
    return {
      copiesDeleted,
      originalsUnchanged: true,
      verifiedFiles: trackedOriginals.length,
    };
  };

  return {
    targetDir,
    sourceUserDataDir,
    quran: quranResult,
    poetry: poetryResult,
    sunnah: sunnahResult,
    get cleanedUp() {
      return cleanedUp;
    },
    cleanup,
  };
}
