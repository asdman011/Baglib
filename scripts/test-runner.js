const { spawnSync } = require('child_process');
const electron = require('electron');
const path = require('path');
const fs = require('fs');

const tsxCli = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
const userArgs = process.argv.slice(2);

let testFiles = userArgs;
if (testFiles.length === 0) {
  const testsDir = path.resolve(__dirname, '../tests');
  if (fs.existsSync(testsDir)) {
    testFiles = fs.readdirSync(testsDir, { recursive: true })
      .filter((file) => typeof file === 'string' && file.endsWith('.test.ts'))
      .map((file) => path.join(testsDir, file));
  }
}

const args = [tsxCli, '--test', ...testFiles];

const result = spawnSync(electron, args, {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
});

process.exit(result.status ?? 0);
