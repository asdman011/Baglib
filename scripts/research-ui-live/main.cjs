const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_K306_DIR;
const evidence = process.env.BAGLIB_K306_EVIDENCE;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
app.setAsDefaultProtocolClient = () => { throw Error('Protocol registration forbidden'); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const AR_PDF = path.resolve('tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf');
const EN_PDF = path.resolve('tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf');
const AR_TITLE = 'الدفاع عن أراضي المسلمين أهم فروض الأعيان';
const EN_TITLE = 'Why Lyrics Last: Evolution, Cognition, and Shakespeare';
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) throw Error('Only one Electron window is allowed');
  started = true;
  const errors = [];
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = script => win.webContents.executeJavaScript(script, true);
  // KEY-317: throwaway profiles would show the KEY-307 first-run guide, which takes focus.
  win.webContents.on('did-finish-load', () => { win.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until = async (script, ms = 60000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { if (await evaluate(script)) return; } catch {}
      await sleep(150);
    }
    throw Error('Timeout ' + script + '\n' + await evaluate('document.body.innerText.slice(-1500)'));
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const shot = async name => {
    await until("!document.querySelector('[data-splash-screen]') && !document.querySelector('[role=dialog][aria-label=Loading]')");
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await sleep(500);
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  const setValue = (selector, value) => evaluate(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(value)});
    e.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const rect = selector => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width }; })()`);
  const noOverflow = async tag => {
    const geometry = await evaluate(`(() => { const s = document.querySelector('[data-pathways-space]'); return { doc: document.documentElement.scrollWidth, width: innerWidth, space: s.scrollWidth, client: s.clientWidth }; })()`);
    assert.ok(geometry.doc <= geometry.width + 1 && geometry.space <= geometry.client + 1, tag + ' horizontal overflow ' + JSON.stringify(geometry));
  };
  const layout = async (tag, width) => {
    const list = await rect('[data-pathway-list]');
    const steps = await rect('[data-pathway-steps]');
    const end = await rect('[data-pathway-end]');
    if (width <= 480) {
      assert.ok(Math.abs(list.x - steps.x) < 3 && Math.abs(steps.x - end.x) < 3, tag + ' must stack at 480: ' + JSON.stringify({ list, steps, end }));
      assert.ok(list.bottom <= steps.y + 3 && steps.bottom <= end.y + 3, tag + ' order list > steps > end: ' + JSON.stringify({ list, steps, end }));
    } else {
      assert.ok(Math.abs(list.y - steps.y) < 4, tag + ' list and steps share a row at 1280: ' + JSON.stringify({ list, steps }));
      const rtl = await evaluate("document.documentElement.dir === 'rtl'");
      assert.ok(rtl ? list.x > steps.x : list.x < steps.x, tag + ' list sits at the start edge');
      console.log(tag, 'end column beside steps:', Math.abs(end.y - steps.y) < 4);
    }
  };
  const tab = index => evaluate(`document.querySelectorAll('[data-pathways-space] [role=tab]')[${index}].click()`);

  (async () => {
    win.setMinimumSize(320, 400);
    win.show(); win.focus(); win.webContents.focus();
    win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await sleep(2500);
    for (const book of [
      { id: 'k306-ar-pdf', title: AR_TITLE, author: 'عبد الله عزام', digitalFormat: 'PDF', filePath: AR_PDF },
      { id: 'k306-en-pdf', title: EN_TITLE, author: 'Brian Boyd', digitalFormat: 'PDF', filePath: EN_PDF },
    ]) await evaluate(`window.electronAPI.addBook(${JSON.stringify({ ...book, workType: 'book', bookType: 'digital', createdAt: new Date().toISOString() })})`);

    for (const lang of ['ar', 'en']) for (const theme of ['light', 'dark']) for (const width of [1280, 480]) {
      const tag = `${lang}-${theme}-${width}`;
      console.log('CASE', tag);
      win.setContentSize(width, 900);
      await evaluate(`localStorage.setItem('baglib-lang','${lang}');localStorage.setItem('baglib-theme','${theme}')`);
      await win.loadURL('http://localhost:3000');
      await until(`document.documentElement.lang === '${lang}' && !!document.querySelector('footer')`);
      await sleep(2500);
      // A clean slate for this case: no pathways and no personal templates.
      await evaluate(`(async () => { const api = window.electronAPI.pathways; for (const row of await api.list()) await api.remove(row.id); for (const row of await api.templates()) await api.removeTemplate(row.id); })()`);
      await click('[data-nav-item="pathways"]');
      await until('!!document.querySelector("[data-pathways-space] [role=tab]")');
      await sleep(400);

      // 1. Empty state from the shared primitive, one layout.
      assert.equal(await evaluate('document.querySelectorAll("[data-pathway-row]").length'), 0);
      assert.equal(await evaluate('document.querySelectorAll("[data-pathways-space] [role=tab]").length'), 4);
      await noOverflow(tag + ' empty');
      await layout(tag + ' empty', width);
      await shot('empty-' + tag);

      // 2. Template gallery: three ready-made templates and an empty "my templates" state.
      await tab(3);
      await until('!!document.querySelector("[data-template-gallery]")');
      assert.equal(await evaluate('document.querySelectorAll("[data-template-gallery] [data-template-card]").length'), 3);
      assert.equal(await evaluate('document.querySelectorAll("[data-template-mine] [data-template-card]").length'), 0);
      await noOverflow(tag + ' gallery');
      await shot('gallery-' + tag);

      // 3. Create a curriculum from the staged template with one click.
      await click('[data-template-use="staged"]');
      await until('!!document.querySelector("[data-pathway-title]")');
      assert.equal(await evaluate('document.querySelectorAll("[data-pathway-row]").length'), 1);
      assert.equal(await evaluate('document.querySelectorAll("[data-pathway-item-kind=step]").length'), 6);
      assert.ok(await evaluate('!!document.querySelector("[data-feedback-toast]")'));
      assert.equal(await evaluate('!!document.querySelector("[data-pathway-continue-main]")'), false, 'no source yet, so no continue button');
      assert.ok(await evaluate('!!document.querySelector("[data-pathway-next]")'));

      // 4. Add the real Arabic PDF to the first section through the picker; the next step now opens it.
      const firstSection = await evaluate('document.querySelector("[data-pathway-steps] h4").textContent');
      await setValue('input[list=pathway-sections]', firstSection);
      await evaluate('document.querySelector("[data-pathway-steps] details summary").click()');
      await setValue('[data-study-link-picker] input', '/books الدفاع');
      await until(`[...document.querySelectorAll('[data-study-link-picker] button')].some(b => b.textContent.includes('الدفاع'))`);
      await evaluate(`[...document.querySelectorAll('[data-study-link-picker] button')].find(b => b.textContent.includes('الدفاع')).click()`);
      await until('!!document.querySelector("[data-pathway-continue-main]")');
      assert.equal(await evaluate('document.querySelectorAll("[data-pathway-continue]").length'), 1);
      await noOverflow(tag + ' curriculum');
      await layout(tag + ' curriculum', width);
      await shot('curriculum-' + tag);

      // 5. Context menu on a step: actions are hidden behind it, not always visible.
      await evaluate(`(() => { const li = document.querySelector('[data-pathway-item-kind=step]'); const r = li.getBoundingClientRect(); li.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); })()`);
      await until('!!document.querySelector("[data-baglib-menu]")');
      assert.ok(await evaluate('document.querySelectorAll("[data-baglib-menu] [role=menuitem]").length') >= 4);
      await shot('menu-' + tag);
      await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
      await evaluate('document.querySelector("[data-baglib-menu]")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
      await until('!document.querySelector("[data-baglib-menu]")', 5000).catch(() => click('[data-pathway-title]'));

      // 6. Follow the first step into the real Arabic PDF.
      await click('[data-pathway-continue-main]');
      await until("!!document.querySelector('[data-reader-markup-bar]') && document.querySelectorAll('.textLayer span').length > 0", 120000);
      await shot('reader-' + tag);

      // 7. Back in the space: progress, then "Save as my template" and reuse.
      await win.loadURL('http://localhost:3000');
      await until(`document.documentElement.lang === '${lang}' && !!document.querySelector('footer')`);
      await sleep(2000);
      await click('[data-nav-item="pathways"]');
      await until('!!document.querySelector("[data-pathway-row]")');
      await click('[data-pathway-row] button[aria-current]');
      await until('!!document.querySelector("[data-pathway-title]")');
      await click('[data-pathway-item-kind=step] input[type=checkbox]');
      await until('document.querySelector("[data-pathway-progress] [role=progressbar]")?.getAttribute("aria-valuenow") === "1"');
      assert.equal(await evaluate('document.querySelector("[data-pathway-row] [role=progressbar]").getAttribute("aria-valuenow")'), '1');
      await click('[data-pathway-save-template]');
      await until('!!document.querySelector("[data-feedback-toast]")');
      const saved = await evaluate('window.electronAPI.pathways.templates()');
      assert.equal(saved.length, 1);
      assert.equal(saved[0].kind, 'curriculum');
      assert.equal(saved[0].outline.split('\n').filter(line => !line.startsWith('#')).length, 6);
      await tab(3);
      await until('document.querySelectorAll("[data-template-mine] [data-template-card]").length === 1');
      await noOverflow(tag + ' my template');
      await shot('my-template-' + tag);
      await click('[data-template-mine] [data-template-use]');
      await until('document.querySelectorAll("[data-pathway-row]").length === 2');
      const fresh = await evaluate('window.electronAPI.pathways.list()');
      assert.deepEqual(fresh.map(row => row.done).sort(), [0, 1]);
      await shot('copy-' + tag);
      console.log(tag, 'curriculum from template, first step into the real Arabic PDF, saved and reused as a personal template');
    }
    assert.deepEqual(errors, []);
    console.log('KEY-306 live matrix passed 8/8');
    app.exit(0);
  })().catch(async error => {
    console.error(error, errors);
    await shot('failure').catch(() => {});
    app.exit(1);
  });
});
require('../../dist/main/index.js');
