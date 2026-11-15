const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY368_PROFILE;
const evidence = process.env.BAGLIB_KEY368_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const init = require(path.join(profile, 'initialize.cjs'));
init.initializeProfile();
const labels = init.translations;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let running = false;

app.on('browser-window-created', (_, win) => {
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message);
  });
  win.webContents.on('did-finish-load', () => {
    if (running || win.webContents.getURL().startsWith('devtools:')) return;
    running = true;
    run(win, errors).catch(async error => {
      console.error(error);
      fs.writeFileSync(path.join(evidence, 'failure.txt'), error.stack + '\n' + JSON.stringify(errors));
      try {
        fs.writeFileSync(path.join(evidence, 'failure.png'), (await win.webContents.capturePage()).toPNG());
      } catch {}
      app.exit(1);
    });
  });
});

async function run(win, errors) {
  win.setSize(1480, 1050);
  win.show();
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const frame = () => win.webContents.mainFrame.frames.find(f => f.url.includes('/research-editor/'));
  const edit = code => {
    assert.ok(frame(), 'editor iframe');
    return frame().executeJavaScript(code, true);
  };
  async function until(code, child = false) {
    for (let i = 0; i < 400; i++) {
      try {
        if (await (child ? edit(code) : evaluate(code))) return;
      } catch {}
      await pause(100);
    }
    throw Error('timeout ' + code + '\n' + await evaluate('document.body.innerText.slice(-2500)'));
  }
  const shot = async name => {
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  const click = async selector => {
    await until('!!document.querySelector(' + JSON.stringify(selector) + ')');
    await evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
    await pause(150);
  };
  const input = async (selector, text) => {
    await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await pause(120);
  };
  const lang = async value => {
    const old = await evaluate('document.documentElement.lang');
    if (old !== value) await click('[aria-label=' + JSON.stringify(labels[old].toggleLanguage) + ']');
    await until(`document.documentElement.lang===${JSON.stringify(value)}`);
  };

  await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=notes]")');
  await evaluate('window.electronAPI.settings.set("onboarding.v1",{seen:true})');
  await evaluate('location.reload()');
  await pause(1000);

  const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
  const books = [];
  for (const language of ['ar', 'en']) {
    const file = manifest.files.find(f => f.kind === 'pdf' && f.lang === language && f.textLayer === 'yes');
    assert.ok(file);
    const title = language === 'ar' ? 'كتاب اقتباس KEY368' : 'Book quote KEY368';
    const imported = await evaluate(`window.electronAPI.importDigitalFile({filePath:${JSON.stringify(path.resolve('tests/real-files', file.path))},customTitle:${JSON.stringify(title)}})`);
    assert.equal(imported.success, true, JSON.stringify(imported));
    books.push({ language, file: file.path, title });
  }

  await evaluate('location.reload()');
  await pause(1300);

  const records = await require('./scenario.cjs')({
    win,
    evaluate,
    edit,
    until,
    shot,
    click,
    input,
    lang,
    labels,
    books,
    evidence,
    pause,
  });

  assert.deepEqual(errors, [], 'renderer errors');
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({
    pass: 1,
    fail: 0,
    records,
    errors,
    realFiles: books,
    originalFilesModified: false,
  }, null, 2));

  console.log('KEY-368 live scenario passed cleanly');
  app.exit(0);
}

require(path.resolve('dist/main/index.js'));
