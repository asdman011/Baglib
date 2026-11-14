import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PoetryProvisioner } from '../../src/main/services/poetry/provision';

test('compiled Poetry provisioner isolates cwd, parses progress/errors, prevents duplicate jobs and permits retries', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-poetry-provision-'));
  const profile = path.join(directory, 'profile');
  fs.mkdirSync(profile);
  fs.mkdirSync(path.join(directory, 'dist/main'), { recursive: true });
  const entry = path.join(directory, 'dist/main/poetry-provision-worker.js');
  const counter = path.join(profile, 'runs');
  fs.writeFileSync(entry, `const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(counter)},'x');if(process.cwd()!==${JSON.stringify(profile)})process.exit(2);console.log(JSON.stringify({downloaded:900,total:1000}));console.log(JSON.stringify({imported:500}));setTimeout(()=>{console.log(JSON.stringify({error:'poetry-python-unavailable'}));process.exit(1)},100);`);
  const provisioner = new PoetryProvisioner(directory, profile);
  const wait = async () => {
    for (let index = 0; index < 200; index++) {
      if (provisioner.getStatus().phase === 'error') return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.fail('Provisioner did not finish');
  };
  try {
    assert.equal(provisioner.getStatus().phase, 'idle');
    assert.equal(provisioner.start().phase, 'downloading');
    provisioner.start();
    await wait();
    assert.equal(fs.readFileSync(counter, 'utf8'), 'x');
    assert.deepEqual(provisioner.getStatus(), { phase: 'error', downloaded: 900, total: 1000, imported: 500, error: 'python' });
    assert.equal(provisioner.start().phase, 'downloading');
    await wait();
    assert.equal(fs.readFileSync(counter, 'utf8'), 'xx');
    assert.equal(fs.existsSync(path.join(profile, 'partitions/bayan_poetry.sqlite')), false);
  } finally {
    provisioner.close();
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(directory).startsWith('baglib-poetry-provision-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('installed builds unpack the poetry pack shipped in resources, and report it only when present', async () => {
  const Database = (await import('better-sqlite3')).default;
  const { buildPoetryPack } = await import('../../src/main/services/poetry/pack');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-poetry-bundled-'));
  try {
    const source = path.join(directory, 'source.sqlite');
    const database = new Database(source);
    database.exec('CREATE TABLE poems (id INTEGER PRIMARY KEY, title TEXT)');
    for (let index = 0; index < 3; index++) database.prepare('INSERT INTO poems (title) VALUES (?)').run(`قصيدة ${index}`);
    database.close();
    const resources = path.join(directory, 'resources', 'poetry-pack');
    const { manifestPath } = await buildPoetryPack({ source, outDir: resources, rows: 3 });
    const profile = path.join(directory, 'profile');
    fs.mkdirSync(profile);
    // No pack shipped: not reported, and asking for it fails without touching the profile.
    const missing = new PoetryProvisioner(directory, profile, undefined, path.join(directory, 'absent.pack.json'));
    assert.equal(missing.getStatus().bundled, undefined);
    assert.equal(missing.importBundled().error, 'pack');
    assert.equal(fs.existsSync(path.join(profile, 'partitions', 'bayan_poetry.sqlite')), false);
    const provisioner = new PoetryProvisioner(directory, profile, undefined, manifestPath);
    assert.equal(provisioner.getStatus().bundled, true);
    assert.equal(provisioner.importBundled().phase, 'unpacking');
    for (let index = 0; index < 200 && provisioner.getStatus().phase === 'unpacking'; index++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(provisioner.getStatus().phase, 'ready');
    assert.ok(fs.readFileSync(path.join(profile, 'partitions', 'bayan_poetry.sqlite')).equals(fs.readFileSync(source)));
    assert.equal(provisioner.importBundled().phase, 'ready'); // a second request keeps the installed partition
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
