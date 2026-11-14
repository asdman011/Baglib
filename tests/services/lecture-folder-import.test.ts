import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { LectureLibrary } from '../../src/main/services/lectures/lecture-library';
import { LectureSeriesRepository } from '../../src/main/database/repositories/lecture-series.repository';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { DigitalImportPipelineService } from '../../src/main/services/digital/digital-import-pipeline.service';
import { nextSeriesLecture } from '../../src/shared/lecture-series';

async function fixture(run: (context: { directory: string; db: Database.Database; library: LectureLibrary; series: LectureSeriesRepository; file: (folder: string, name: string) => Promise<string> }) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'baglib-folder-'));
  const db = new Database(':memory:'); db.pragma('foreign_keys=ON'); runMigrations(db, migrations);
  let counter = 0;
  const file = async (folder: string, name: string) => {
    const filename = path.join(directory, folder, name);
    await mkdir(path.dirname(filename), { recursive: true });
    // Valid ID3 signature plus distinct payloads for content-hash duplicate detection.
    await writeFile(filename, Buffer.concat([Buffer.from([73, 68, 51, 3, 0, 0, 0, 0, 0, 0]), Buffer.from(String(++counter))]));
    return filename;
  };
  try { await run({ directory, db, file, library: new LectureLibrary(db, directory), series: new LectureSeriesRepository(db) }); }
  finally { db.close(); await rm(directory, { recursive: true, force: true }); }
}

test('multi-file selections group by full parent path, naturally sort Arabic/Latin names and never reuse names', async () => {
  await fixture(async ({ file, library, series }) => {
    const names = ['Lesson 10.mp3', 'Lesson 2.mp3', '\u062f\u0631\u0633 \u0661\u0660.mp3', '\u062f\u0631\u0633 \u0662.mp3'];
    const files = await Promise.all(names.map(name => file('a/Course', name)));
    const other = await Promise.all(['10.mp3', '2.mp3'].map(name => file('b/Course', name)));
    const existing = series.create('Course');
    await library.add([...files, ...other, files[0]]);
    const groups = series.list();
    assert.equal(groups.length, 3);
    assert.deepEqual(groups.find(group => group.id === existing.id)?.items, []);
    const group = groups.find(group => group.items.length === 4)!;
    const ordered = group.items.map(item => library.list().find(lecture => lecture.id === item.workId)!.path).map(filename => path.basename(filename));
    assert.ok(ordered.indexOf('Lesson 2.mp3') < ordered.indexOf('Lesson 10.mp3'));
    assert.ok(ordered.indexOf('\u062f\u0631\u0633 \u0662.mp3') < ordered.indexOf('\u062f\u0631\u0633 \u0661\u0660.mp3'));
    assert.equal(groups.find(item => item.items.length === 2)?.items.length, 2);
    await library.add(files);
    assert.equal(series.list().length, 3, 'duplicate paths do not create an empty series');
    const extra = await Promise.all(['20.mp3', '30.mp3'].map(name => file('a/Course', name)));
    await library.add(extra);
    assert.equal(series.list().length, 4, 'a later import owns a fresh series even with the same name');
  });
});

test('a single selected file stays ungrouped; a selected folder including one media item creates a series', async () => {
  await fixture(async ({ directory, file, library, series }) => {
    const single = await file('Single', 'Only.mp3');
    const another = await file('Other', 'Only.mp3');
    await library.add([single]);
    await library.add([another]);
    assert.equal(series.list().length, 0, 'separate single-file imports stay ungrouped');
    await file('Folder', 'Only.mp3');
    await file('Folder/Child', 'Only.mp3');
    await library.add([path.join(directory, 'Folder')]);
    assert.deepEqual(series.list().map(group => group.name).sort(), ['Child', 'Folder']);
    assert.ok(series.list().every(group => group.items.length === 1));
  });
});

test('digital batch import uses natural series order and skips duplicate works on retry', async () => {
  await fixture(async ({ db, file, series }) => {
    const files = await Promise.all(['10.mp3', '2.mp3', '1.mp3'].map(name => file('Pipeline', name)));
    const pipeline = new DigitalImportPipelineService(new SqliteWorkRepository(db));
    const options = files.map(filePath => ({ filePath, duplicateAction: 'skip' as const, skipExactDuplicatesOnly: true }));
    const result = await pipeline.importFiles(options);
    assert.equal(result.successfulImports, 3);
    const group = series.list()[0];
    assert.deepEqual(group.items.map(item => result.results.find(row => row.workId === item.workId)!.fileName), ['1.mp3', '2.mp3', '10.mp3']);
    assert.equal((await pipeline.importFiles(options)).skippedImports, 3);
    assert.equal(series.list().length, 1);
    const single = await file('Pipeline', 'Single.mp3');
    await pipeline.importFiles([{ filePath: single }]);
    assert.equal(series.list().length, 1);
  });
});

test('auto-next follows only the containing series and stops at its end, including when enabled', async () => {
  await fixture(async ({ file, library, series }) => {
    await library.add(await Promise.all(['2.mp3', '1.mp3'].map(name => file('Course', name))));
    const unrelated = (await library.add([await file('Elsewhere', 'single.mp3')]))[0];
    const group = series.list()[0];
    series.update(group.id, { autoplayNext: true });
    const groups = series.list();
    assert.equal(nextSeriesLecture(groups, group.items[0].workId)?.next.workId, group.items[1].workId);
    assert.equal(nextSeriesLecture(groups, group.items[0].workId)?.series.autoplayNext, true);
    assert.equal(nextSeriesLecture(groups, group.items[1].workId), null);
    assert.equal(nextSeriesLecture(groups, unrelated.id), null);
  });
});

test('multi-folder selection creates distinct series for singleton parents and digital folder provenance groups one item', async () => {
  await fixture(async ({ db, file, library, series }) => {
    await library.add([await file('A', 'one.mp3'), await file('B', 'one.mp3')]);
    assert.deepEqual(series.list().map(group => group.name).sort(), ['A', 'B']);
    const selected = await file('DigitalFolder', 'one.mp3');
    const pipeline = new DigitalImportPipelineService(new SqliteWorkRepository(db));
    await pipeline.importFiles([{ filePath: selected }], undefined, undefined, [path.dirname(selected)]);
    assert.equal(series.list().find(group => group.name === 'DigitalFolder')?.items.length, 1);
  });
});
