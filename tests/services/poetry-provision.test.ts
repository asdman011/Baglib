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
