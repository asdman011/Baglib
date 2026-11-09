import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setupThrowawayCorpus } from '../../scripts/lib/corpus-copy.mjs';

const dataDir = fileURLToPath(new URL('../../.baglib-data/', import.meta.url));
fs.mkdirSync(dataDir, { recursive: true });

const sha256 = (filePath: string): string =>
  createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

describe('corpus-copy helper (KEY-278)', () => {
  it('refuses targets equal to, inside, or containing the source profile before modifying files', () => {
    const root = fs.mkdtempSync(path.join(dataDir, 'baglib-corpus-overlap-test-'));
    try {
      const sourceUserData = path.join(root, 'source-user-data');
      const original = path.join(sourceUserData, 'partitions', 'bayan_poetry.sqlite');
      fs.mkdirSync(path.dirname(original), { recursive: true });
      fs.writeFileSync(original, 'original-poetry');
      const before = sha256(original);
      for (const targetDir of [sourceUserData, path.join(sourceUserData, 'child'), root]) {
        assert.throws(() => setupThrowawayCorpus({
          targetDir,
          sourceUserDataDir: sourceUserData,
          linkSunnah: false,
        }), /targetDir must not overlap sourceUserDataDir/);
        assert.equal(sha256(original), before);
        assert.equal(fs.existsSync(path.join(sourceUserData, 'child')), false);
        assert.equal(fs.existsSync(path.join(root, 'partitions')), false);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses targets outside the repo .baglib-data folder before creating or modifying files', () => {
    const root = fs.mkdtempSync(path.join(dataDir, 'baglib-corpus-boundary-test-'));
    try {
      const sourceUserData = path.join(root, 'source-user-data');
      const original = path.join(sourceUserData, 'partitions', 'bayan_poetry.sqlite');
      fs.mkdirSync(path.dirname(original), { recursive: true });
      fs.writeFileSync(original, 'original-poetry');
      const before = sha256(original);
      const outside = `${dataDir.replace(/[\\/]$/, '')}-outside-${path.basename(root)}`;
      for (const targetDir of [outside, path.join(dataDir, '..', path.basename(outside)), dataDir]) {
        assert.throws(() => setupThrowawayCorpus({
          targetDir,
          sourceUserDataDir: sourceUserData,
          linkSunnah: false,
        }), /targetDir must be inside the repo .baglib-data folder/);
        assert.equal(sha256(original), before);
        assert.equal(fs.existsSync(outside), false);
        assert.equal(fs.existsSync(path.join(dataDir, 'partitions')), false);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('copies Quran packs and poetry partition read-only, verifies hashes, and deletes copies on cleanup while originals stay unchanged', () => {
    const root = fs.mkdtempSync(path.join(dataDir, 'baglib-corpus-copy-test-'));
    try {
      const sourceUserData = path.join(root, 'source-user-data');
      const targetProfile = path.join(root, 'throwaway-profile');
      const packId = '22a0f391-bc69-40aa-8ffb-1c02d0832a39';

      fs.mkdirSync(path.join(sourceUserData, 'quran', 'packs', packId), { recursive: true });
      fs.mkdirSync(path.join(sourceUserData, 'quran', 'derived'), { recursive: true });
      fs.mkdirSync(path.join(sourceUserData, 'partitions'), { recursive: true });

      const catalogFile = path.join(sourceUserData, 'quran', 'catalog.sqlite');
      const manifestFile = path.join(sourceUserData, 'quran', 'packs', packId, 'manifest.json');
      const packSqlite = path.join(sourceUserData, 'quran', 'packs', packId, '0.sqlite');
      const derivedSqlite = path.join(sourceUserData, 'quran', 'derived', 'derived-hafs.sqlite');
      const poetryFile = path.join(sourceUserData, 'partitions', 'bayan_poetry.sqlite');
      const sunnahFile = path.join(root, 'sunnah.sqlite');

      fs.writeFileSync(catalogFile, 'sqlite-catalog-bytes');
      fs.writeFileSync(manifestFile, JSON.stringify({ id: packId, files: [{ name: '0.sqlite', type: 'sqlite' }] }));
      fs.writeFileSync(packSqlite, 'sqlite-pack-bytes');
      fs.writeFileSync(derivedSqlite, 'sqlite-derived-bytes');
      fs.writeFileSync(poetryFile, 'sqlite-poetry-bytes');
      fs.writeFileSync(sunnahFile, 'sqlite-sunnah-bytes');

      const beforeHashes = {
        catalog: sha256(catalogFile),
        manifest: sha256(manifestFile),
        pack: sha256(packSqlite),
        derived: sha256(derivedSqlite),
        poetry: sha256(poetryFile),
      };

      const corpus = setupThrowawayCorpus({
        targetDir: targetProfile,
        sourceUserDataDir: sourceUserData,
        sunnahCorpusFile: sunnahFile,
      });

      assert.equal(corpus.quran.available, true);
      assert.equal(corpus.poetry.available, true);
      assert.equal(corpus.sunnah.available, true);

      const copiedCatalog = path.join(targetProfile, 'quran', 'catalog.sqlite');
      const copiedPack = path.join(targetProfile, 'quran', 'packs', packId, '0.sqlite');
      const copiedDerived = path.join(targetProfile, 'quran', 'derived', 'derived-hafs.sqlite');
      const copiedPoetry = path.join(targetProfile, 'partitions', 'bayan_poetry.sqlite');

      assert.equal(sha256(copiedCatalog), beforeHashes.catalog);
      assert.equal(sha256(copiedPack), beforeHashes.pack);
      assert.equal(sha256(copiedDerived), beforeHashes.derived);
      assert.equal(sha256(copiedPoetry), beforeHashes.poetry);

      const cleanupReport = corpus.cleanup();
      assert.equal(cleanupReport.copiesDeleted, true);
      assert.equal(cleanupReport.originalsUnchanged, true);
      assert.equal(fs.existsSync(path.join(targetProfile, 'quran')), false);
      assert.equal(fs.existsSync(path.join(targetProfile, 'partitions')), false);

      assert.equal(sha256(catalogFile), beforeHashes.catalog);
      assert.equal(sha256(manifestFile), beforeHashes.manifest);
      assert.equal(sha256(packSqlite), beforeHashes.pack);
      assert.equal(sha256(derivedSqlite), beforeHashes.derived);
      assert.equal(sha256(poetryFile), beforeHashes.poetry);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports explicit SKIP reasons when no installed Quran pack or poetry partition exists', () => {
    const root = fs.mkdtempSync(path.join(dataDir, 'baglib-corpus-empty-test-'));
    try {
      const emptyUserData = path.join(root, 'empty-user-data');
      const targetProfile = path.join(root, 'throwaway-profile');
      fs.mkdirSync(emptyUserData, { recursive: true });

      const corpus = setupThrowawayCorpus({
        targetDir: targetProfile,
        sourceUserDataDir: emptyUserData,
        sunnahCorpusFile: path.join(root, 'missing-sunnah.sqlite'),
      });

      assert.equal(corpus.quran.available, false);
      assert.equal(corpus.quran.skipReason, 'SKIPPED: no installed Quran pack');
      assert.equal(corpus.poetry.available, false);
      assert.equal(corpus.poetry.skipReason, 'SKIPPED: no installed poetry partition');
      assert.equal(corpus.sunnah.available, false);

      const cleanupReport = corpus.cleanup();
      assert.equal(cleanupReport.copiesDeleted, true);
      assert.equal(cleanupReport.originalsUnchanged, true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('follows quran-location.json in sourceUserDataDir and detects if an original file hash changes', () => {
    const root = fs.mkdtempSync(path.join(dataDir, 'baglib-corpus-location-test-'));
    try {
      const sourceUserData = path.join(root, 'source-user-data');
      const externalQuranDir = path.join(root, 'external-quran');
      const targetProfile = path.join(root, 'throwaway-profile');
      const packId = '2b9afe8c-923e-494c-9237-14519768c08b';

      fs.mkdirSync(sourceUserData, { recursive: true });
      fs.mkdirSync(path.join(externalQuranDir, 'packs', packId), { recursive: true });
      fs.writeFileSync(
        path.join(sourceUserData, 'quran-location.json'),
        JSON.stringify({ directory: externalQuranDir }),
      );
      const catalogFile = path.join(externalQuranDir, 'catalog.sqlite');
      fs.writeFileSync(catalogFile, 'external-catalog-bytes');
      fs.writeFileSync(path.join(externalQuranDir, 'packs', packId, 'manifest.json'), '{"id":"svg"}');
      for (let i = 0; i < 12; i++) {
        fs.writeFileSync(path.join(externalQuranDir, 'packs', packId, `${i}.svg`), `<svg>${i}</svg>`);
      }

      const corpus = setupThrowawayCorpus({
        targetDir: targetProfile,
        sourceUserDataDir: sourceUserData,
        copyPoetry: false,
        linkSunnah: false,
      });

      assert.equal(corpus.quran.available, true);
      assert.equal(fs.existsSync(path.join(targetProfile, 'quran', 'packs', packId, 'manifest.json')), true);
      assert.equal(fs.existsSync(path.join(targetProfile, 'quran', 'packs', packId, '0.svg')), false);

      fs.writeFileSync(catalogFile, 'tampered-catalog-bytes');
      assert.throws(() => corpus.cleanup(), /Original corpus file changed/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
