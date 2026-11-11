import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import electron from 'electron';

const root = fs.realpathSync('.baglib-data');
const engine = path.join(root, 'pdf-engine');
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const realPdfs = ['ar', 'en'].map(lang => manifest.files.filter(file => file.kind === 'pdf' && file.lang === lang && file.textLayer === 'yes').sort((a,b) => a.bytes-b.bytes)[0]);
assert.ok(realPdfs.every(Boolean));
const evidenceRoot = fs.mkdtempSync(path.join(root, 'k317-import-quit-evidence-'));
for (const language of ['en', 'ar']) {
  const directory = fs.mkdtempSync(path.join(root, `import-quit-${language}-`));
  const evidenceDir = path.join(evidenceRoot, language);
  fs.mkdirSync(evidenceDir);
  try {
    const sources = path.join(directory, 'fixtures');
    fs.mkdirSync(sources);
    const options = [];
    for (let index = 0; index < 120; index++) {
      const filePath = path.join(sources, `reading-${index}.txt`);
      fs.writeFileSync(filePath, `عِلْمٌ وعَمَلٌ English study ${index}\n${'A unique reading passage. '.repeat(100)}`);
      options.push({ filePath, customTitle: `Shutdown fixture ${index}`, duplicateAction: 'import_anyway' });
    }
    for (const [index, file] of realPdfs.entries()) {
      const filePath = path.join(sources, `reading-pdf-${index}.pdf`);
      fs.copyFileSync(path.resolve('tests/real-files', file.path), filePath);
      options.push({ filePath, customTitle: `Shutdown PDF ${index}`, duplicateAction: 'import_anyway' });
    }
    fs.writeFileSync(path.join(directory, 'options.json'), JSON.stringify(options));
    const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_IMPORT_LIVE_DIR: directory, BAGLIB_IMPORT_LIVE_LANG: language };
    delete env.ELECTRON_RUN_AS_NODE;
    const code = await new Promise(resolve => {
      const child = spawn(electron, ['scripts/import-shutdown-live/main.cjs', `--user-data-dir=${directory}`], { env, windowsHide: true, stdio: 'inherit' });
      child.once('exit', status => { resolve(status); });
    });
    assert.equal(code, 0);
    const evidence = JSON.parse(fs.readFileSync(path.join(directory, 'evidence.json'), 'utf8'));
    assert.equal(evidence.quitDuringImport, true);
    assert.equal(evidence.windowClosed, true);
    assert.equal(evidence.firstProgress.currentFileIndex, 1);
    assert.deepEqual(evidence.errors, []);
    const inspection = `import sqlite3,sys,json
db=sqlite3.connect(sys.argv[1])
pdfs=[json.loads(row[0]) for row in db.execute("SELECT metadata_json FROM work WHERE title LIKE 'Shutdown PDF%'")]
print(json.dumps({
 "imported":db.execute("SELECT COUNT(*) FROM work WHERE title LIKE 'Shutdown %'").fetchone()[0],
 "sources":db.execute("SELECT COUNT(*) FROM file_source_detail f JOIN source s ON s.id=f.source_id JOIN edition e ON e.id=s.edition_id JOIN work w ON w.id=e.work_id WHERE w.title LIKE 'Shutdown %'").fetchone()[0],
 "pdfCovers":sum(bool(row.get('coverImage')) and row.get('pagesCount') in ${JSON.stringify(realPdfs.map(file => file.pages))} for row in pdfs),
 "integrity":db.execute("PRAGMA integrity_check").fetchone()[0]}))`;
    const inspected = spawnSync(path.join(engine, 'venv/Scripts/python.exe'), ['-I', '-c', inspection, path.join(directory, 'data/baglib.db')], { encoding: 'utf8' });
    assert.equal(inspected.status, 0, inspected.stderr);
    const result = JSON.parse(inspected.stdout);
    assert.equal(result.imported, 122);
    assert.equal(result.sources, 122);
    assert.equal(result.pdfCovers, 2);
    assert.equal(result.integrity, 'ok');
    fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result));
    console.log(JSON.stringify({ language, evidenceDir, ...result }));
  } finally {
    for (const name of ['evidence.json', 'result.json']) {
      if (fs.existsSync(path.join(directory, name))) fs.copyFileSync(path.join(directory, name), path.join(evidenceDir, name));
    }
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved), root);
    fs.rmSync(resolved, { recursive: true, force: true });
    console.log(JSON.stringify({ language, evidenceDir, profileDeleted: true }));
  }
}
