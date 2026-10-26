import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { unzipSync } from 'fflate';

test('SQLite copies retain exact schema, IDs and Arabic while incomplete translations never publish', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-arabic-metadata-'));
  const audit = [];
  const hash = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  try {
    for (const group of ['surahs', 'topics', 'themes']) {
      const file = `${group}.db`;
      const database = new DatabaseSync(path.join(root, file));
      database.exec('CREATE TABLE items(id INTEGER PRIMARY KEY, name TEXT, original_arabic TEXT, reference TEXT)');
      database.prepare('INSERT INTO items VALUES(?,?,?,?)').run(17, 'Faith', 'الإيمان', '2:3');
      const schema = database.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();
      database.close();
      const source = { _rowid: 17, id: 17, name: 'Faith', original_arabic: 'الإيمان', reference: '2:3' };
      const input = path.join(root, 'input', group);
      const translated = path.join(root, 'translated', group);
      fs.mkdirSync(input, { recursive: true }); fs.mkdirSync(translated, { recursive: true });
      fs.writeFileSync(path.join(input, '001.json'), JSON.stringify([source]));
      fs.writeFileSync(path.join(translated, '001.json'), JSON.stringify([{ ...source, name: 'الإيمان' }]));
      audit.push({ group, file, table: 'items', target: `${group}-ar.db`, fields: ['name'], sourceSha256: hash(path.join(root, file)), schema });
    }
    fs.writeFileSync(path.join(root, 'audit.json'), JSON.stringify(audit));
    fs.writeFileSync(path.join(root, 'canonical-ayahs.json'), '{}');
    fs.writeFileSync(path.join(root, 'surah-names.json'), '[]');
    const run = () => spawnSync(process.execPath, ['scripts/quran-metadata-arabic/build.mjs'], { env: { ...process.env, BAGLIB_QURAN_TRANSLATION_ROOT: root }, encoding: 'utf8' });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(fs.readFileSync(path.join(root, 'validation.json'), 'utf8'));
    assert.equal(report.complete, true);
    for (const [index, source] of report.sources.entries()) {
      assert.equal(hash(path.join(root, audit[index].file)), audit[index].sourceSha256);
      const translated = new DatabaseSync(source.output.filename, { readOnly: true });
      assert.deepEqual({ ...translated.prepare('SELECT * FROM items').get() }, { id: 17, name: 'الإيمان', original_arabic: 'الإيمان', reference: '2:3' });
      assert.deepEqual(translated.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all(), audit[index].schema);
      translated.close();
    }
    fs.writeFileSync(path.join(root, 'source-archives.json'), JSON.stringify(audit.map(source => ({ filename: path.join(root, source.file), sha256: source.sourceSha256 }))));
    const published = path.join(root, 'published');
    const publish = () => spawnSync(process.execPath, ['scripts/quran-metadata-arabic/publish.mjs', published], { env: { ...process.env, BAGLIB_QURAN_TRANSLATION_ROOT: root }, encoding: 'utf8' });
    const publication = publish();
    assert.equal(publication.status, 0, publication.stderr);
    const manifest = JSON.parse(fs.readFileSync(path.join(published, 'manifest.json'), 'utf8'));
    assert.equal(manifest.officialQulEdition, false);
    assert.equal(manifest.installedInBaglib, false);
    assert.equal(manifest.files.length, 3);
    assert.equal(Object.keys(unzipSync(fs.readFileSync(path.join(published, 'baglib-quran-arabic-metadata.zip')))).length, 5);
    const issue = { rowid: 17, field: 'name', source: 'Faith', status: 'parent-review-required' };
    fs.writeFileSync(path.join(root, 'translated', 'topics', 'unresolved.json'), JSON.stringify([issue]));
    assert.equal(run().status, 2);
    assert.notEqual(publish().status, 0, 'Incomplete or unresolved inputs cannot be republished');
    const digest = value => createHash('sha256').update(value).digest('hex');
    fs.writeFileSync(path.join(root, 'reviews.json'), JSON.stringify({ decisions: [{ group: 'topics', rowid: 17, field: 'name', issueSha256: digest(JSON.stringify(issue)), translationSha256: digest('الإيمان'), status: 'accepted-source-limitation', note: 'اختبار قرار مراجعة مرتبط بالنص نفسه.' }] }));
    assert.equal(run().status, 0);
    fs.writeFileSync(path.join(root, 'translated', 'topics', '001.json'), JSON.stringify([{ _rowid: 17, id: 17, name: 'إيمان', original_arabic: 'الإيمان', reference: '2:3' }]));
    assert.equal(run().status, 2, 'Changing reviewed wording invalidates the old review decision');
    fs.writeFileSync(path.join(root, 'translated', 'topics', '001.json'), JSON.stringify([{ _rowid: 17, id: 17, name: 'Faith', original_arabic: 'الإيمان', reference: '2:3' }]));
    assert.equal(run().status, 2);
    const incomplete = JSON.parse(fs.readFileSync(path.join(root, 'validation.json'), 'utf8'));
    assert.equal(incomplete.complete, false);
    assert.equal(incomplete.sources.find(source => source.group === 'topics').output, null);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('baglib-arabic-metadata-'));
    fs.rmSync(root, { recursive: true });
  }
});
