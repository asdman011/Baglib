// KEY-266 packaged acceptance: an installed build (release/win-unpacked) on a clean throwaway profile, with Chromium
// pointed at a dead proxy, imports the local poetry pack through the real Windows file picker (the path is set in
// the dialog through UI Automation), survives a cancel and a retry, then searches poems in Arabic (RTL) and English (LTR).
// With --bundled it instead uses the pack the installer shipped (no picker), and --exe=<path> runs an installed copy.
// Usage: node scripts/packaged-poetry-live/run.mjs [--bundled] [--exe=<Baglib.exe>] [path to bayan_poetry-v1.pack.json]
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const args = process.argv.slice(2);
const bundled = args.includes('--bundled');
const exe = path.resolve(args.find(arg => arg.startsWith('--exe='))?.slice(6) || path.join(root, 'release', 'win-unpacked', 'Baglib.exe'));
const manifest = path.resolve(args.find(arg => !arg.startsWith('--')) || '.baglib-data/poetry-pack/bayan_poetry-v1.pack.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Finds the Windows "Open" dialog owned by the test app's own process (UI Automation), sets its file-name box and
 * presses Open with window messages. It never sends keystrokes, so no other window on the desktop can receive input.
 */
function chooseInOpenDialog(pid) {
  const script = `
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]; $T = [System.Windows.Automation.TreeScope]; $P = [System.Windows.Automation.PropertyCondition]
$dialog = $null
for ($i = 0; $i -lt 60 -and -not $dialog; $i++) {
  Start-Sleep -Milliseconds 250
  $windows = $A::RootElement.FindAll($T::Children, (New-Object $P($A::ProcessIdProperty, ${'$'}{PID})))
  foreach ($w in $windows) { $d = $w.FindFirst($T::Descendants, (New-Object $P($A::ClassNameProperty, '#32770'))); if ($w.Current.ClassName -eq '#32770') { $d = $w }; if ($d) { $dialog = $d; break } }
}
if (-not $dialog) { exit 3 }
$edit = $dialog.FindAll($T::Descendants, (New-Object $P($A::AutomationIdProperty, '1148'))) | Where-Object { $_.Current.ClassName -eq 'Edit' } | Select-Object -First 1
if (-not $edit) { exit 4 }
# The file-name box is a plain Win32 Edit: set its text with WM_SETTEXT, then send IDOK (WM_COMMAND, 1) to this dialog.
# Both messages go to this dialog's own windows, so nothing else on the desktop receives input.
Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern System.IntPtr SendMessage(System.IntPtr h, uint m, System.IntPtr w, string l); [DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);'
[void][W.U]::SendMessage([System.IntPtr]$edit.Current.NativeWindowHandle, 0x000C, [System.IntPtr]::Zero, '${'$'}{FILE}')
Start-Sleep -Milliseconds 300
[void][W.U]::PostMessage([System.IntPtr]$dialog.Current.NativeWindowHandle, 0x0111, [System.IntPtr]1, [System.IntPtr]::Zero)
`.replace('${PID}', String(pid)).replace('${FILE}', manifest.replace(/'/gu, "''"));
  execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, timeout: 30_000 });
}

async function cdp(port) {
  let page;
  for (let attempt = 0; attempt < 120 && !page; attempt++) {
    await sleep(500);
    const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json()).catch(() => []);
    page = targets.find(target => target.type === 'page' && !target.url.startsWith('devtools'));
  }
  if (!page) throw new Error('no page target');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0; const pending = new Map();
  socket.onmessage = message => { const data = JSON.parse(message.data); if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); } };
  const send = (method, params = {}, timeout = 15000) => new Promise(resolve => { const key = ++id; pending.set(key, resolve); socket.send(JSON.stringify({ id: key, method, params })); setTimeout(() => { if (pending.delete(key)) resolve({ timedOut: true }); }, timeout); });
  const evaluate = async expression => { const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return reply.result?.result?.value; };
  const until = async (expression, tries = 240, step = 500) => { for (let attempt = 0; attempt < tries; attempt++) { if (await evaluate(expression).catch(() => false)) return true; await sleep(step); } throw new Error(`timed out: ${expression}`); };
  return { send, evaluate, until, close: () => socket.close() };
}

const profile = fs.mkdtempSync(path.join(root, '.baglib-data', 'KEY-266-packaged-'));
const child = spawn(exe, [`--user-data-dir=${profile}`, '--remote-debugging-port=9440', '--proxy-server=http://127.0.0.1:9'], { stdio: 'ignore' });
const result = { exe, mode: bundled ? 'bundled' : 'picker', profile: path.basename(profile) };
const partitions = path.join(profile, 'partitions');
const leftovers = () => fs.existsSync(partitions) ? fs.readdirSync(partitions).filter(name => name.startsWith('.poetry-pack-')) : [];
try {
  const page = await cdp(9440);
  const open = async language => {
    await page.until('!!window.electronAPI && !!document.querySelector("footer")');
    await page.evaluate(`window.electronAPI.settings.set('onboarding.v1', { seen: true }); localStorage.setItem('baglib-lang', '${language}'); true`);
    await page.send('Page.reload', {}, 3000); await sleep(2500);
    await page.until('!!window.electronAPI && !!document.querySelector("footer")');
    await page.evaluate(`document.querySelector('[data-guide-skip]')?.click(); [...document.querySelectorAll('[data-nav-item]')].find(b => b.getAttribute('data-nav-item') === 'bayan')?.click(); true`);
    await page.until('!!document.querySelector("[data-bayan-view]")');
    return page.evaluate('document.querySelector("[data-bayan-view]").dir');
  };
  const search = async text => {
    await page.evaluate(`(()=>{const field=document.querySelector('[data-bayan-view] input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(text)});field.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    await page.until(`document.querySelectorAll('[data-bayan-view] article').length > 0`, 120, 250);
    return page.evaluate(`document.querySelectorAll('[data-bayan-view] article').length`);
  };
  const button = bundled ? '[data-bayan-import-bundled]' : '[data-bayan-import-pack]';
  const startImport = async () => {
    await page.evaluate(`setTimeout(() => document.querySelector('${button}').click(), 0); true`);
    if (!bundled) chooseInOpenDialog(child.pid);
  };
  result.arDir = await open('ar');
  await page.until(`!!document.querySelector('${button}')`);
  if (bundled) result.arLabel = await page.evaluate(`document.querySelector('${button}').textContent`);
  // First attempt: start, then cancel.
  await startImport();
  await page.until(`(async () => { const r = await window.electronAPI.poetry.status(); return r.ok && r.data.phase === 'unpacking' && r.data.downloaded > 0; })()`, 200, 100);
  await page.evaluate(`document.querySelector('[data-bayan-import-cancel]').click(); true`);
  await page.until('!!document.querySelector("[data-bayan-import-cancelled]")');
  await sleep(500);
  result.afterCancel = { partition: fs.existsSync(path.join(partitions, 'bayan_poetry.sqlite')), leftovers: leftovers() };
  // Retry to completion.
  const started = Date.now();
  await page.until(`!!document.querySelector('${button}')`);
  await startImport();
  await page.until(`(async () => { const r = await window.electronAPI.poetry.status(); return r.ok && (r.data.phase === 'ready' || r.data.phase === 'error'); })()`, 600, 500);
  result.status = await page.evaluate('window.electronAPI.poetry.status().then(r => r.data)');
  result.importSeconds = Math.round((Date.now() - started) / 1000);
  result.arHits = await search('الحب');
  result.enDir = await open('en');
  result.enHits = await search('الليل');
  result.leftovers = leftovers();
  page.close();
  result.passed = result.arDir === 'rtl' && result.enDir === 'ltr' && !result.afterCancel.partition && !result.afterCancel.leftovers.length && result.status.phase === 'ready' && result.arHits > 0 && result.enHits > 0 && !result.leftovers.length;
} catch (error) {
  result.passed = false; result.error = String(error?.message || error);
} finally {
  child.kill();
  await sleep(2500);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  result.profileDeleted = !fs.existsSync(profile);
}
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.passed ? 0 : 1;
