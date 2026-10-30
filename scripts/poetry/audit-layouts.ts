import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { classifyPoetryLayout, type PoetryLanguage } from '../../src/shared/poetry';

const filename = process.env.BAGLIB_POETRY_AUDIT_DATABASE || path.join(process.env.APPDATA || '', 'baglib/partitions/bayan_poetry.sqlite');
const database = new Database(filename, { readonly: true, fileMustExist: true });
const changes: { id: number; before: string; after: string; meter: string | null }[] = [];
let inspected = 0;
try {
  for (const row of database.prepare('SELECT id,language,meter,verses_json,layout_type FROM poems ORDER BY id').iterate() as Iterable<{ id: number; language: PoetryLanguage; meter: string | null; verses_json: string; layout_type: string }>) {
    const verses = JSON.parse(row.verses_json) as string[];
    const after = classifyPoetryLayout(row.language, row.meter, verses);
    if (after !== row.layout_type) changes.push({ id: row.id, before: row.layout_type, after, meter: row.meter });
    inspected++;
  }
  const report = { readonly: true, inspected, changed: changes.length, changes };
  const output = path.resolve('.baglib-data/poetry/layout-audit.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ inspected, changed: changes.length, output }));
} finally { database.close(); }
