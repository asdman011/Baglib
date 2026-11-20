const { spawn, execFileSync } = require('child_process');
const electron = require('electron');
const path = require('path');
const fs = require('fs');

const tsxCli = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
const userArgs = process.argv.slice(2);
const flags = userArgs.filter((arg) => arg.startsWith('-'));
let testFiles = userArgs.filter((arg) => !arg.startsWith('-'));
if (testFiles.length === 0) {
  const testsDir = path.resolve(__dirname, '../tests');
  if (fs.existsSync(testsDir)) {
    testFiles = fs.readdirSync(testsDir, { recursive: true })
      .filter((file) => typeof file === 'string' && file.endsWith('.test.ts'))
      // Keep Windows' child-process command line below its length limit as the suite grows.
      .map((file) => path.relative(process.cwd(), path.join(testsDir, file)));
  }
}

// A run must never hang (2026-11-19: a full-suite run sat idle for over two hours).
// - Each test fails after 2 minutes instead of waiting forever, and the report names it.
// - `--test-force-exit` ends the run once the tests finish, even if a test left a timer, listener or handle open.
// - The whole run is killed after 45 minutes (BAGLIB_TEST_RUN_TIMEOUT_MS overrides; 0 turns it off).
const defaults = [];
if (!flags.some((flag) => flag.startsWith('--test-timeout'))) defaults.push('--test-timeout=120000');
if (!flags.includes('--test-force-exit')) defaults.push('--test-force-exit');

const args = [tsxCli, '--test', ...defaults, ...flags, ...testFiles];
const overallMs = process.env.BAGLIB_TEST_RUN_TIMEOUT_MS !== undefined ? Number(process.env.BAGLIB_TEST_RUN_TIMEOUT_MS) : 45 * 60 * 1000;

const child = spawn(electron, args, {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});

let timedOut = false;
const timer = overallMs > 0 ? setTimeout(() => {
  timedOut = true;
  console.error(`\n[test-runner] The run took longer than ${Math.round(overallMs / 60000)} minutes and was stopped. A test is probably waiting for something that never happens.`);
  try {
    // The test runner starts child processes; stop the whole tree.
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch {}
}, overallMs) : null;

child.on('exit', (code, signal) => {
  if (timer) clearTimeout(timer);
  if (timedOut) process.exit(124);
  process.exit(code ?? (signal ? 1 : 0));
});
child.on('error', (error) => {
  if (timer) clearTimeout(timer);
  console.error('[test-runner] Could not start the tests:', error);
  process.exit(1);
});
