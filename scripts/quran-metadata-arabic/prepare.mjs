import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve('.baglib-data/quran-arabic-translation');
const definitions = [
  { file: 'surah-info-en.db', table: 'surah_infos', fields: ['surah_name', 'text', 'short_text'], target: 'surah-info-ar.db', group: 'surahs' },
  { file: 'topics.db', table: 'topics', fields: ['name', 'description'], target: 'topics-ar.db', group: 'topics' },
  { file: 'ayah-themes.db', table: 'themes', fields: ['theme', 'keywords'], target: 'ayah-themes-ar.db', group: 'themes' },
];
const audit = [];
for (const definition of definitions) {
  const filename = path.join(root, definition.file);
  const database = new DatabaseSync(filename, { readOnly: true });
  const rows = database.prepare(`SELECT rowid AS _rowid, * FROM ${definition.table}`).all();
  const directory = path.join(root, 'input', definition.group);
  fs.mkdirSync(directory, { recursive: true });
  let batch = [];
  let size = 0;
  let sequence = 1;
  const flush = () => {
    if (!batch.length) return;
    const target = path.join(directory, `${String(sequence++).padStart(3, '0')}.json`);
    const value = JSON.stringify(batch, null, 2) + '\n';
    if (!fs.existsSync(target)) fs.writeFileSync(target, value, { flag: 'wx' });
    else if (fs.readFileSync(target, 'utf8') !== value) throw new Error(`Changed input: ${target}`);
    batch = []; size = 0;
  };
  for (const row of rows) {
    const item = { _rowid: row._rowid, ...Object.fromEntries(definition.fields.map(field => [field, row[field]])) };
    if (definition.group === 'topics') item.arabic_name = row.arabic_name;
    if (definition.group === 'surahs') item.surah_number = row.surah_number;
    if (definition.group === 'themes') { item.surah_number = row.surah_number; item.ayah_from = row.ayah_from; item.ayah_to = row.ayah_to; }
    const length = JSON.stringify(item).length;
    if (size + length > 16000) flush();
    batch.push(item); size += length;
  }
  flush();
  audit.push({ ...definition, rows: rows.length, batches: sequence - 1, sourceSha256: createHash('sha256').update(fs.readFileSync(filename)).digest('hex'), schema: database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all() });
  database.close();
}
fs.writeFileSync(path.join(root, 'audit.json'), JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify(audit.map(({ file, rows, batches }) => ({ file, rows, batches }))));
