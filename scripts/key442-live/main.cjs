// KEY-442 live verification in Electron (ar & en, real Arabic & English PDFs, stubbed local OpenAI-compatible server).
// Tests: custom loopback model treated as local (no consent prompt), PDF AI + learning mode (hints/off), remote consent + revocation, direct IPC guards.
const { app } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY442_PROFILE;
const evidence = process.env.BAGLIB_KEY442_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('KEY-442 hard timeout'); app.exit(1); }, 220_000).unref();

let stubPort = 0;
const stubCalls = [];

function startStubCustomServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          const system = parsed.messages?.find(m => m.role === 'system')?.content || '';
          const user = parsed.messages?.find(m => m.role === 'user')?.content || '';
          const isHints = system.includes('LEARNING MODE — HINTS ONLY:');
          const isAr = /Arabic|العربية/u.test(system);
          let firstPage = 1;
          let firstQuote = '';
          try {
            const payload = JSON.parse(user);
            const p = payload.pages?.[0];
            if (p && typeof p.text === 'string' && p.text.trim().length > 0) {
              firstPage = p.page || 1;
              firstQuote = p.text.slice(0, 40).trim();
            }
          } catch {}
          stubCalls.push({ isHints, isAr, user: user.slice(0, 160) });
          const content = JSON.stringify({
            answer: isHints
              ? (isAr ? 'تلميح: راجع الصفحة المحددة وابحث عن الفكرة الأساسية.' : 'Hint: review the selected page and identify the main argument.')
              : (isAr ? 'الإجابة الكاملة: هذا تلخيص موثق من النص.' : 'Full answer: this is the grounded summary from the text.'),
            abstained: !firstQuote,
            citations: firstQuote ? [{ page: firstPage, quote: firstQuote }] : [],
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ choices: [{ message: { content } }] }));
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'stub-local-model' }] }));
    });
    server.listen(0, '127.0.0.1', () => {
      stubPort = server.address().port;
      resolve(server);
    });
  });
}

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
      let domInfo = '';
      try {
        domInfo = await win.webContents.executeJavaScript('JSON.stringify({ url: location.href, controls: document.querySelector("[data-ai-privacy-controls]")?.textContent, err: document.querySelector("[data-pdf-ai-error]")?.textContent })', true);
      } catch {}
      fs.writeFileSync(path.join(evidence, 'failure.txt'), (error.stack || String(error)) + '\n' + domInfo + '\n' + JSON.stringify(errors));
      try {
        fs.writeFileSync(path.join(evidence, 'failure.png'), (await win.webContents.capturePage()).toPNG());
      } catch {}
      app.exit(1);
    });
  });
});

async function run(win, errors) {
  const stubServer = await startStubCustomServer();
  try {
    win.setSize(1280, 900);
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
    const click = async selector => {
      await until('!!document.querySelector(' + JSON.stringify(selector) + ')');
      await evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
      await pause(180);
    };
    const shot = async name => {
      await pause(280);
      win.webContents.invalidate();
      await pause(180);
      fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
    };

    await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=notes]")');
    await evaluate('window.electronAPI.settings.set("onboarding.v1", { seen: true })');

    const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
    const files = ['ar', 'en'].map(lang => manifest.files.find(f => f.kind === 'pdf' && f.lang === lang && f.textLayer === 'yes'));
    for (const file of files) {
      assert.ok(file, 'Missing manifest PDF');
      await evaluate('window.electronAPI.importDigitalFile({ filePath: ' + JSON.stringify(path.resolve('tests/real-files', file.path)) + ' })');
    }
    const books = await evaluate('window.electronAPI.getAllBooks()');

    // Configure custom loopback OpenAI-compatible server (must be treated as local, no remote consent needed)
    await evaluate(`window.electronAPI.ai.saveSettings({
      enabled: true,
      provider: 'custom',
      customBaseUrl: 'http://127.0.0.1:${stubPort}/v1',
      customModel: 'stub-local-model',
      remoteConsent: undefined,
      learningModes: { revision: 'off', reader: 'hints', quran: 'hints', sunnah: 'hints', notes: 'hints', researchEditor: 'hints' }
    })`);

    for (const lang of ['ar', 'en']) {
      await evaluate('(async()=>{await window.electronAPI.settings.set("workspace.tabs.v1",null);await window.electronAPI.settings.set("workspace.closed.v1",null);localStorage.setItem("baglib-lang",' + JSON.stringify(lang) + ')})()');
      await evaluate('location.reload()');
      await pause(900);
      await until('document.documentElement.lang === ' + JSON.stringify(lang) + ' && !!document.querySelector("[data-nav-item=notes]")');
      assert.equal(await evaluate('document.documentElement.dir'), lang === 'ar' ? 'rtl' : 'ltr');

      const file = files[lang === 'ar' ? 0 : 1];
      const book = books.find(b => b.filePath === path.resolve('tests/real-files', file.path));
      assert.ok(book, 'Imported book not found');

      app.emit('open-url', { preventDefault() {} }, 'baglib:book:' + book.id + '@' + book.sourceId + '#p=1');
      await until('!!document.querySelector("[data-reader-source]")');

      // Open AI Research Assistant Drawer from reader overflow menu
      await click('[data-pdf-header-more]');
      await evaluate(`(() => {
        const items = Array.from(document.querySelectorAll("[role=menuitem]"));
        const target = items.find(e => /AI|الذكاء/i.test(e.textContent || ''));
        if (!target) throw new Error('Missing AI menu item');
        target.click();
      })()`);
      await until('!!document.querySelector("[data-ai-privacy-controls]")');

      // 1. Custom loopback endpoint must be treated as local (no consent prompt, no revoke button)
      const privacyText = await evaluate('document.querySelector("[data-ai-privacy-controls]")?.textContent || ""');
      assert.ok(
        lang === 'ar' ? /هذا الحاسوب|محلي/.test(privacyText) : /locally|this computer/i.test(privacyText),
        `Expected local-model notice in ${lang}, got: ${privacyText}`
      );
      assert.equal(await evaluate('!!document.querySelector("[data-ai-privacy-revoke]")'), false, 'Local custom model must not show revoke button');
      await shot(`01-local-custom-${lang}`);

      // 2. Direct IPC pdf-collab:ask with custom local model works in hints mode (and blocks when reader=off)
      const pdfSession = await evaluate(`window.electronAPI.pdfEditor.open({ workId: ${JSON.stringify(book.workId || book.id)}, sourceId: ${JSON.stringify(book.sourceId)} })`);
      assert.ok(pdfSession?.ok && pdfSession.data?.id, 'Failed to open PDF editor session');
      const callsBefore = stubCalls.length;
      const askHints = await evaluate(`window.electronAPI.pdfCollaboration.ask(${JSON.stringify(pdfSession.data.id)}, 'What is the main point?', ${JSON.stringify(lang)}, false, undefined, { mode: 'qa', fromPage: 1, toPage: 1 })`);
      assert.equal(askHints.ok, true, 'Custom local model should succeed without allowRemote: ' + JSON.stringify(askHints));
      assert.equal(stubCalls.length, callsBefore + 1);
      assert.equal(stubCalls[stubCalls.length - 1].isHints, true, 'PDF AI should use hints mode by default');

      // Learning mode 'off' blocks pdf-collab:ask before calling provider
      await evaluate(`window.electronAPI.ai.saveSettings({ learningModes: { revision: 'off', reader: 'off', quran: 'hints', sunnah: 'hints', notes: 'hints', researchEditor: 'hints' } })`);
      const askOff = await evaluate(`window.electronAPI.pdfCollaboration.ask(${JSON.stringify(pdfSession.data.id)}, 'What is the main point?', ${JSON.stringify(lang)}, false, undefined, { mode: 'qa', fromPage: 1, toPage: 1 })`);
      assert.deepEqual(askOff, { ok: false, error: 'learning-mode-off' });
      assert.equal(stubCalls.length, callsBefore + 1, 'Off learning mode must not call provider');

      // Restore reader=hints
      await evaluate(`window.electronAPI.ai.saveSettings({ learningModes: { revision: 'off', reader: 'hints', quran: 'hints', sunnah: 'hints', notes: 'hints', researchEditor: 'hints' } })`);

      // 3. Remote provider without consent -> asks consent; allow -> saves; revoke -> clears & blocks direct IPC
      await evaluate(`window.electronAPI.ai.saveSettings({ provider: 'openai', apiKey: 'stub-key', remoteConsent: undefined })`);
      await evaluate(`window.dispatchEvent(new Event('baglib:ai-settings-changed'))`);
      await pause(250);
      const remoteText = await evaluate('document.querySelector("[data-ai-privacy-controls]")?.textContent || ""');
      assert.ok(remoteText.includes('api.openai.com'), `Expected endpoint display in ${lang}, got: ${remoteText}`);
      await shot(`02-remote-asks-${lang}`);

      // Direct IPC with allowRemote=true must still fail when persisted remoteConsent is missing
      const unconsentedDirect = await evaluate(`window.electronAPI.pdfCollaboration.ask(${JSON.stringify(pdfSession.data.id)}, 'Question?', ${JSON.stringify(lang)}, true, undefined, { mode: 'qa', fromPage: 1, toPage: 1 })`);
      assert.deepEqual(unconsentedDirect, { ok: false, error: 'permission-denied' });

      // Grant consent then revoke via AiPrivacyControls button
      await evaluate(`window.electronAPI.ai.saveSettings({ remoteConsent: 'openai' })`);
      await evaluate(`window.dispatchEvent(new Event('baglib:ai-settings-changed'))`);
      await until('!!document.querySelector("[data-ai-privacy-revoke]")');
      await evaluate('document.querySelector("[data-ai-privacy-revoke]").click()');
      await until('!document.querySelector("[data-ai-privacy-revoke]")');
      const afterRevoke = await evaluate('(async () => (await window.electronAPI.ai.getSettings()).remoteConsent)()');
      assert.equal(afterRevoke, undefined, 'Revoke must clear remoteConsent');
      await shot(`03-revoked-${lang}`);

      // Restore custom local model for next language
      await evaluate(`window.electronAPI.ai.saveSettings({
        provider: 'custom',
        customBaseUrl: 'http://127.0.0.1:${stubPort}/v1',
        customModel: 'stub-local-model',
        remoteConsent: undefined
      })`);
    }

    await evaluate('window.electronAPI.settings.set("workspace.tabs.v1", null)');
    assert.equal(errors.length, 0, 'Renderer errors: ' + errors.join('; '));
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({
      ok: true,
      errors,
      stubCallsCount: stubCalls.length,
    }, null, 2));
    app.exit(0);
  } finally {
    stubServer.close();
  }
}

process.env.BAGLIB_LIVE_OFFSCREEN = '1';
require(path.resolve('dist/main/index.js'));
