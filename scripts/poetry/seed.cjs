const { spawnSync } = require('node:child_process');
const path = require('node:path');
const electron = require('electron');
const os = require('node:os');
const build = spawnSync(process.execPath, [path.resolve('node_modules/tsup/dist/cli-default.js')], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);
const seeded = spawnSync(electron, [path.resolve('dist/main/poetry-provision-worker.js')], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', BAGLIB_POETRY_USER_DATA: process.env.BAGLIB_POETRY_USER_DATA || path.join(process.env.APPDATA || os.homedir(), 'baglib'), BAGLIB_POETRY_CACHE: process.env.BAGLIB_POETRY_CACHE || path.resolve('.baglib-data/poetry/shards'), BAGLIB_POETRY_PARSER: path.resolve('assets/poetry/parquet_rows.py') } });
process.exit(seeded.status ?? 1);
