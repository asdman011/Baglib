import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { validateRow, reviewScope, reviewValue } from './validate.mjs';

const root = path.resolve(process.env.BAGLIB_QURAN_TRANSLATION_ROOT || '.baglib-data/quran-arabic-translation');
const audit = JSON.parse(fs.readFileSync(path.join(root, 'audit.json'), 'utf8'));
const canonical = Object.values(JSON.parse(fs.readFileSync(path.join(root, 'canonical-ayahs.json'), 'utf8'))).join(' ');
const names = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(root, 'surah-names.json'), 'utf8')).map(row => [row.id, row.name_arabic]));
const hash = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const textHash = value => createHash('sha256').update(value).digest('hex');
const reviewsFile = path.join(root, 'reviews.json');
const decisions = fs.existsSync(reviewsFile) ? JSON.parse(fs.readFileSync(reviewsFile, 'utf8')).decisions || [] : [];
const report = { complete: false, sources: [], unresolvedReports: [], review: [] };
for (const definition of audit) {
  const sourceFile = path.join(root, definition.file);
  assert.equal(hash(sourceFile), definition.sourceSha256, 'Source changed');
  const inputs = fs.readdirSync(path.join(root, 'input', definition.group)).filter(name => /^\d+\.json$/.test(name));
  const translations = new Map();
  const flagged = [];
  const translationDirectories = fs.existsSync(path.join(root, 'translated')) ? fs.readdirSync(path.join(root, 'translated')).filter(name => name === definition.group || name.startsWith(`${definition.group}-`)) : [];
  for (const directory of translationDirectories) {
    const directoryRows = [];
    const batchRows = {};
    for (const filename of fs.readdirSync(path.join(root, 'translated', directory))) {
      const full = path.join(root, 'translated', directory, filename);
      if (filename === 'unresolved.json') {
        const contents = JSON.parse(fs.readFileSync(full, 'utf8'));
        const issues = Array.isArray(contents) ? contents : contents.issues || [];
        if (issues.length) flagged.push({ group: definition.group, file: full, contents: issues, directoryRows, batchRows });
        continue;
      }
      if (!/^\d+\.json$/.test(filename)) continue;
      const batch = JSON.parse(fs.readFileSync(full, 'utf8'));
      batchRows[filename] = batch.map(row => row._rowid);
      directoryRows.push(...batchRows[filename]);
      for (const row of batch) {
        if (translations.has(row._rowid)) throw new Error(`Duplicate translation row: ${definition.group}/${row._rowid}`);
        translations.set(row._rowid, row);
      }
    }
  }
  const issues = [];
  for (const sourceReport of flagged) {
    const unresolved = [];
    for (const issue of sourceReport.contents) {
      const scope = reviewScope(issue, sourceReport.directoryRows, sourceReport.batchRows, definition.fields);
      const value = reviewValue(scope, translations);
      const decision = typeof value === 'string' ? decisions.find(decision => decision.group === definition.group && (decision.scopeKey === JSON.stringify(scope) || scope.rows.length === 1 && scope.fields.length === 1 && decision.rowid === issue.rowid && decision.field === issue.field) && decision.issueSha256 === textHash(JSON.stringify(issue)) && decision.translationSha256 === textHash(value) && ['verified-quotation', 'accepted-source-limitation', 'corrected-source-error'].includes(decision.status)) : null;
      if (decision) report.review.push(decision);
      else unresolved.push(issue);
    }
    if (unresolved.length) report.unresolvedReports.push({ ...sourceReport, contents: unresolved });
  }
  const sourceRows = inputs.flatMap(filename => JSON.parse(fs.readFileSync(path.join(root, 'input', definition.group, filename), 'utf8')));
  for (const row of sourceRows) issues.push(...validateRow(row, translations.get(row._rowid), definition, canonical, names));
  const source = new DatabaseSync(sourceFile, { readOnly: true });
  const immutableRows = source.prepare(`SELECT rowid AS _rowid,* FROM ${definition.table}`).all();
  const summary = { group: definition.group, rows: immutableRows.length, translatedRows: translations.size, issues, sourceSha256: definition.sourceSha256, output: null };
  if (!issues.length && translations.size === immutableRows.length && !report.unresolvedReports.some(report => report.group === definition.group)) {
    const destination = path.join(root, 'output', randomUUID());
    fs.mkdirSync(destination, { recursive: true });
    const filename = path.join(destination, definition.target);
    fs.copyFileSync(sourceFile, filename, fs.constants.COPYFILE_EXCL);
    const database = new DatabaseSync(filename);
    try {
      database.exec('BEGIN IMMEDIATE');
      const update = database.prepare(`UPDATE ${definition.table} SET ${definition.fields.map(field => `${field}=?`).join(',')} WHERE rowid=?`);
      for (const original of immutableRows) {
        const translated = translations.get(original._rowid);
        update.run(...definition.fields.map(field => translated[field]), original._rowid);
      }
      assert.deepEqual(database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all().map(row => ({ ...row })), definition.schema, 'Schema changed');
      const rows = database.prepare(`SELECT rowid AS _rowid,* FROM ${definition.table}`).all();
      assert.equal(rows.length, immutableRows.length);
      for (let index = 0; index < rows.length; index++) for (const [field, value] of Object.entries(immutableRows[index])) if (!definition.fields.includes(field)) assert.equal(rows[index][field], value, `Changed immutable field ${field}`);
      assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      database.exec('COMMIT');
    } catch (cause) { database.exec('ROLLBACK'); throw cause; }
    finally { database.close(); }
    summary.output = { filename, sha256: hash(filename) };
  }
  source.close();
  report.sources.push(summary);
}
report.complete = report.sources.every(source => source.output !== null) && !report.unresolvedReports.some(report => Array.isArray(report.contents) ? report.contents.length : true);
fs.writeFileSync(path.join(root, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ complete: report.complete, sources: report.sources.map(({ group, rows, translatedRows, issues, output }) => ({ group, rows, translatedRows, issues: issues.length, output })) }));
if (!report.complete) process.exitCode = 2;
