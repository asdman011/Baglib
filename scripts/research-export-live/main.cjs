const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY369_PROFILE;
const evidence = process.env.BAGLIB_KEY369_EVIDENCE;
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
  const evaluate = async code => {
    try {
      return await win.webContents.executeJavaScript(code, true);
    } catch (e) {
      console.error('Failed evaluating code:\n' + code);
      throw e;
    }
  };
  const frame = () => win.webContents.mainFrame.frames.find(f => f.url.includes('/research-editor/'));
  const edit = async code => {
    assert.ok(frame(), 'editor iframe');
    try {
      return await frame().executeJavaScript(code, true);
    } catch (e) {
      console.error('Failed editing code in iframe:\n' + code);
      throw e;
    }
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

  const books = [
    path.resolve('tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf'),
    path.resolve('tests/real-files/pdf/en/text-layer/New Scientist International Edition - 19_November_2016.pdf'),
  ];
  for (const b of books) {
    assert.ok(fs.existsSync(b), 'real file exists: ' + b);
  }

  const scenario = require('./scenario.cjs');
  const records = await scenario.execute({
    win,
    evaluate,
    edit,
    frame,
    until,
    shot,
    click,
    input,
    lang,
    labels,
    books,
    evidence,
    pause,
    profile
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

  console.log('KEY-369 live scenario passed cleanly');
  app.exit(0);
}

require(path.resolve('dist/main/index.js'));
