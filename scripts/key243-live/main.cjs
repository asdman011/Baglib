// KEY-243 live verification script in Electron (ar & en, CodeMirror live preview, tables, callouts, per-line direction).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY243_PROFILE;
const evidence = process.env.BAGLIB_KEY243_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('KEY-243 hard timeout'); app.exit(1); }, 180_000).unref();

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
      fs.writeFileSync(path.join(evidence, 'failure.txt'), (error.stack || String(error)) + '\n' + JSON.stringify(errors));
      try {
        fs.writeFileSync(path.join(evidence, 'failure.png'), (await win.webContents.capturePage()).toPNG());
      } catch {}
      app.exit(1);
    });
  });
});

async function run(win, errors) {
  win.setSize(1280, 900);
  win.show();
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  async function until(code, tries = 180) {
    for (let i = 0; i < tries; i++) {
      try {
        if (await evaluate(code)) return;
      } catch {}
      await pause(120);
    }
    throw new Error('Timed out: ' + code);
  }
  const shot = async name => {
    await pause(350);
    win.webContents.invalidate();
    await pause(250);
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  const press = (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  };
  const type = async text => {
    await pause(120);
    await win.webContents.insertText(text);
    await pause(120);
  };

  console.log('KEY-243 waiting for app ready...');
  await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=notes]")');
  await evaluate(`(async () => {
    await window.electronAPI.settings.set("onboarding.v1", { seen: true });
    await window.electronAPI.settings.set("workspace.tabs.v1", null);
    await window.electronAPI.settings.set("workspace.closed.v1", null);
  })()`);

  // Import real ar & en PDFs from tests/real-files (manifest.json) + a sample note for [[ link check.
  const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
  const arPdf = manifest.files.find(f => f.kind === 'pdf' && f.lang === 'ar' && f.textLayer === 'yes');
  const enPdf = manifest.files.find(f => f.kind === 'pdf' && f.lang === 'en' && f.textLayer === 'yes');
  assert.ok(arPdf && enPdf, 'Real AR and EN PDFs exist in manifest');
  await evaluate(`window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(path.resolve('tests/real-files', arPdf.path))} })`);
  await evaluate(`window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(path.resolve('tests/real-files', enPdf.path))} })`);
  await evaluate("window.electronAPI.studyNotes.save({ id: 'k243-target', title: 'أصول البحث', content: 'ملاحظة مرجعية', aliases: [], tags: [], expectedRevision: 0 })");

  const results = {};

  for (const lang of ['ar', 'en']) {
    console.log(`KEY-243 testing lang=${lang}...`);
    await evaluate(`window.electronAPI.settings.set('workspace.tabs.v1', null)`);
    await evaluate(`localStorage.setItem('baglib-lang', '${lang}')`);
    await evaluate('location.reload()');
    await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=notes]")');
    await pause(300);

    await evaluate('document.querySelector("[data-nav-item=notes]").click()');
    await until('!!document.querySelector("[data-study-note-editor] .cm-content") || (window.dispatchEvent(new CustomEvent("baglib:new-note")), false)');
    await pause(300);

    await evaluate('document.querySelector("[data-study-note-editor]").value = ""');
    await evaluate('document.querySelector("[data-study-note-editor] .cm-content").focus()');

    // Mixed Arabic + English lines with live-preview syntax.
    await type('# عنوان الملاحظة');
    press('Enter');
    await type('English mixed line with **bold**, *italic*, and `inlineCode`');
    press('Enter');
    await type('- عنصر عربي في القائمة');
    press('Enter');
    await type('[[أصول');
    await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length > 0");
    press('Enter');
    await pause(200);
    press('Enter');

    // Insert table via slash command, type in header, Tab to next cell, Tab through body to append row.
    await type('/table');
    await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length > 0");
    press('Enter');
    await pause(250);
    await type('العمود');
    press('Tab');
    await pause(150);
    await type('Column');
    press('Tab');
    await pause(150);
    await type('بيان');
    press('Tab');
    await pause(150);
    await type('Value');
    press('Tab'); // Appends a second body row!
    await pause(200);
    await type('صف جديد');

    // Append callouts (Arabic + English) and move caret to the last line (outside table and outside callout header).
    await evaluate(`(() => {
      const ed = document.querySelector('[data-study-note-editor]');
      if (ed) {
        ed.value = ed.value + '\\n\\n> [!warning] تنبيه مهم\\n> نص التنبيه بالعربية\\n\\n> [!tip] Useful tip\\n> English note line';
      }
    })()`);
    await pause(350);

    const check = await evaluate(`(() => {
      const root = document.querySelector('[data-study-note-editor]');
      const lines = [...root.querySelectorAll('.cm-line')];
      return {
        rtlLines: lines.filter(l => l.getAttribute('dir') === 'rtl').length,
        ltrLines: lines.filter(l => l.getAttribute('dir') === 'ltr').length,
        headings: root.querySelectorAll('.cm-lp-heading').length,
        strongs: root.querySelectorAll('.cm-lp-strong').length,
        ems: root.querySelectorAll('.cm-lp-em').length,
        codes: root.querySelectorAll('.cm-lp-code').length,
        bullets: root.querySelectorAll('.cm-lp-bullet').length,
        tables: root.querySelectorAll('[data-table-widget]').length,
        callouts: root.querySelectorAll('[data-callout-badge]').length,
        value: root.value,
      };
    })()`);

    console.log(`KEY-243 (${lang}) check:`, JSON.stringify({ ...check, value: undefined }));
    await shot(`${lang}-live-preview`);

    assert.ok(check.rtlLines >= 2, `${lang}: expected RTL lines, got ${check.rtlLines}`);
    assert.ok(check.ltrLines >= 2, `${lang}: expected LTR lines, got ${check.ltrLines}`);
    assert.ok(check.headings >= 1, `${lang}: expected heading live preview`);
    assert.ok(check.strongs >= 1, `${lang}: expected bold live preview`);
    assert.ok(check.ems >= 1, `${lang}: expected italic live preview`);
    assert.ok(check.codes >= 1, `${lang}: expected inline code live preview`);
    assert.ok(check.bullets >= 1, `${lang}: expected bullet live preview`);
    assert.ok(check.tables >= 1, `${lang}: expected rendered table widget when caret is outside`);
    assert.ok(check.callouts >= 2, `${lang}: expected rendered callout badges`);
    assert.ok(check.value.includes('صف جديد'), `${lang}: expected Tab-appended row text`);

    // Click inside the rendered table widget to verify it switches to source-edit mode.
    await evaluate(`(() => {
      const td = document.querySelector('[data-table-widget] td');
      if (td) td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    })()`);
    await pause(350);
    const tablesWhileEditing = await evaluate(`document.querySelectorAll('[data-table-widget]').length`);
    assert.equal(tablesWhileEditing, 0, `${lang}: expected table widget to reveal source when caret enters`);
    await shot(`${lang}-table-edit`);

    results[lang] = check;
  }

  assert.equal(errors.length, 0, 'Renderer console errors: ' + JSON.stringify(errors));
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ passed: true, errors, results }, null, 2));
  console.log('KEY-243 live verification PASSED in ar & en.');
  app.exit(0);
}

require('../../dist/main/index.js');
