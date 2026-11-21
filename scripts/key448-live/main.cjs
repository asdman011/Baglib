// KEY-448 live verification in Electron (ar & en, real Arabic & English PDFs in throwaway profile, stubbed Gemini & Claude endpoints).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY448_PROFILE;
const evidence = process.env.BAGLIB_KEY448_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('KEY-448 hard timeout'); app.exit(1); }, 220_000).unref();

const nativeFetch = globalThis.fetch;
const stubStats = { geminiCalls: 0, claudeCalls: 0 };

globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  if (href.startsWith('https://generativelanguage.googleapis.com/v1beta/models/') && href.endsWith(':generateContent')) {
    stubStats.geminiCalls++;
    assert.equal(init.redirect, 'error', 'Gemini fetch must set redirect: error');
    const headers = init.headers || {};
    assert.ok(headers['x-goog-api-key'], 'Gemini fetch must include x-goog-api-key');
    const body = JSON.parse(String(init.body || '{}'));
    const decls = body.tools?.[0]?.functionDeclarations;
    assert.ok(Array.isArray(decls) && decls.length >= 10, 'Gemini tools.functionDeclarations must be present');
    assert.equal(JSON.stringify(decls).includes('additionalProperties'), false, 'Gemini schemas must strip additionalProperties');

    const prompt = String(body.contents?.[0]?.parts?.[0]?.text || '');
    const functionCall = /2:11/.test(prompt)
      ? { name: 'open_source', args: { target: 'ayah 2:11' } }
      : {
          name: 'extract_pdf_pages',
          args: {
            bookTitle: /رسالة/.test(prompt) ? 'رسالة في أصول الفقه' : 'The Master and His Emissary',
            pages: '8-12',
          },
        };
    return new Response(
      JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ functionCall }] }, finishReason: 'STOP' }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (href === 'https://api.anthropic.com/v1/messages') {
    stubStats.claudeCalls++;
    assert.equal(init.redirect, 'error', 'Claude fetch must set redirect: error');
    const headers = init.headers || {};
    assert.ok(headers['x-api-key'], 'Claude fetch must include x-api-key');
    assert.equal(headers['anthropic-version'], '2023-06-01', 'Claude fetch must include anthropic-version');
    const body = JSON.parse(String(init.body || '{}'));
    assert.ok(Array.isArray(body.tools) && body.tools.length >= 10, 'Claude tools must be present');

    const prompt = String(body.messages?.[0]?.content || '');
    const toolUse = /2:11/.test(prompt)
      ? { type: 'tool_use', id: `toolu_open_${stubStats.claudeCalls}`, name: 'open_source', input: { target: 'ayah 2:11' } }
      : {
          type: 'tool_use',
          id: `toolu_extract_${stubStats.claudeCalls}`,
          name: 'extract_pdf_pages',
          input: {
            bookTitle: /رسالة/.test(prompt) ? 'رسالة في أصول الفقه' : 'The Master and His Emissary',
            pages: '8-12',
          },
        };
    return new Response(
      JSON.stringify({
        id: `msg_stub_${stubStats.claudeCalls}`,
        type: 'message',
        role: 'assistant',
        content: [toolUse],
        stop_reason: 'tool_use',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return nativeFetch(url, init);
};

let running = false;
app.on('browser-window-created', (_, win) => {
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3 && !/ERR_CONNECTION_REFUSED|Failed to fetch/u.test(message)) errors.push(message);
  });
  win.webContents.on('render-process-gone', (_e, details) => errors.push(`gone:${details.reason}`));
  win.webContents.on('did-fail-load', (_e, code, desc) => errors.push(`load:${code}:${desc}`));

  const waitFor = async (script, label, timeout = 35_000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const value = await win.webContents.executeJavaScript(script, true);
      if (value) return value;
      await pause(250);
    }
    throw new Error(`Timed out waiting for: ${label}`);
  };

  const snap = async name => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(evidence, name), img.toPNG());
  };

  const submitAssistant = async instruction => {
    await win.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('[data-research-ai-input]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter.call(input, ${JSON.stringify(instruction)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.form.requestSubmit();
      return true;
    })()`, true);
  };

  const runActionWithConsent = async (instruction, label) => {
    const prevUndoCount = await win.webContents.executeJavaScript(
      'document.querySelectorAll("[data-ai-action-undo]").length',
      true
    );
    const prevConfirmCount = await win.webContents.executeJavaScript(
      'document.querySelectorAll("[data-ai-action-confirm]").length',
      true
    );
    await submitAssistant(instruction);
    await waitFor(
      `!!document.querySelector("[data-assistant-consent-allow]") || document.querySelectorAll("[data-ai-action-confirm]").length > ${prevConfirmCount}`,
      `${label} consent or preview`
    );
    const clickedConsent = await win.webContents.executeJavaScript(`(() => {
      const btn = document.querySelector('[data-assistant-consent-allow]');
      if (!btn) return false;
      btn.click();
      return true;
    })()`, true);
    if (clickedConsent) {
      await waitFor(
        `document.querySelectorAll("[data-ai-action-confirm]").length > ${prevConfirmCount}`,
        `${label} preview after consent`
      );
    }
    await win.webContents.executeJavaScript(`(() => {
      const btns = document.querySelectorAll('[data-ai-action-confirm]');
      btns[btns.length - 1].click();
      return true;
    })()`, true);
    await waitFor(
      `document.querySelectorAll("[data-ai-action-undo]").length > ${prevUndoCount}`,
      `${label} executed`
    );
  };

  win.webContents.once('did-finish-load', async () => {
    if (running) return;
    running = true;
    try {
      win.setSize(1280, 900);
      await waitFor('!!window.electronAPI && !!document.querySelector("nav")', 'app ready');

      const booksDir = path.join(profile, 'books');
      fs.mkdirSync(booksDir, { recursive: true });
      const arSrc = path.resolve('tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf');
      const enSrc = path.resolve('tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf');
      const arPdf = path.join(booksDir, 'ar-book.pdf');
      const enPdf = path.join(booksDir, 'en-book.pdf');
      fs.copyFileSync(arSrc, arPdf);
      fs.copyFileSync(enSrc, enPdf);

      await win.webContents.executeJavaScript(`(async () => {
        await window.electronAPI.settings.set('onboarding.v1', { seen: true });
        await window.electronAPI.settings.set('workspace.tabs.v1', null);
        await window.electronAPI.settings.set('workspace.closedTabs.v1', null);
        await window.electronAPI.settings.set('ai.learningMode', 'full');
        await window.electronAPI.addBook({
          title: 'The Master and His Emissary',
          author: 'Iain McGilchrist',
          filePath: ${JSON.stringify(enPdf)},
          digitalFormat: 'pdf',
          language: 'en',
        });
        await window.electronAPI.addBook({
          title: 'رسالة في أصول الفقه',
          author: 'ابن خلدون',
          filePath: ${JSON.stringify(arPdf)},
          digitalFormat: 'pdf',
          language: 'ar',
        });
        return true;
      })()`, true);

      const summary = { en: {}, ar: {} };
      let knownPdfCount = fs.readdirSync(booksDir).filter(f => f.endsWith('.pdf')).length;

      for (const cfg of [
        {
          lang: 'en',
          extractCmd: 'extract pages 8 to 12 from The Master and His Emissary',
          ayahCmd: 'open ayah 2:11',
        },
        {
          lang: 'ar',
          extractCmd: 'استخرج الصفحات 8 إلى 12 من رسالة في أصول الفقه',
          ayahCmd: 'افتح الآية 2:11',
        },
      ]) {
        await win.webContents.executeJavaScript(`(async () => {
          localStorage.setItem('baglib-lang', ${JSON.stringify(cfg.lang)});
          await window.electronAPI.settings.set('workspace.tabs.v1', null);
          await window.electronAPI.settings.set('workspace.closedTabs.v1', null);
          return true;
        })()`, true);
        await win.webContents.reloadIgnoringCache();
        await waitFor('!!window.electronAPI && !!document.querySelector("[data-nav-item=\\"library\\"]")', `${cfg.lang} app reloaded`);

        for (const provider of ['gemini', 'claude']) {
          await win.webContents.executeJavaScript(`(async () => {
            await window.electronAPI.ai.saveSettings({
              enabled: true,
              provider: ${JSON.stringify(provider)},
              geminiApiKey: 'stub-gemini-key',
              geminiModel: 'gemini-2.5-flash',
              claudeApiKey: 'stub-claude-key',
              claudeModel: 'claude-3-5-sonnet-20241022',
              learningModes: { revision: 'off', reader: 'full', quran: 'full', sunnah: 'full', notes: 'full', researchEditor: 'full' },
            });
            return true;
          })()`, true);

          await win.webContents.executeJavaScript(`(() => {
            const btn = document.querySelector('[data-assistant-fab]');
            if (!document.querySelector('[data-assistant-panel]') && btn) btn.click();
            return true;
          })()`, true);
          await waitFor('!!document.querySelector("[data-research-ai-input]")', `${cfg.lang} ${provider} assistant open`);

          // 1. Extract pages 8-12 -> preview -> confirm -> new PDF file
          await runActionWithConsent(cfg.extractCmd, `${cfg.lang} ${provider} extract`);
          const allPdfs = fs.readdirSync(booksDir).filter(f => f.endsWith('.pdf'));
          assert.ok(allPdfs.length > knownPdfCount, `Expected new extracted PDF for ${cfg.lang} ${provider}`);
          knownPdfCount = allPdfs.length;
          await snap(`01-${provider}-extract-${cfg.lang}.png`);

          // 2. Open ayah 2:11 -> preview -> confirm
          await runActionWithConsent(cfg.ayahCmd, `${cfg.lang} ${provider} open ayah`);
          await snap(`02-${provider}-ayah-${cfg.lang}.png`);

          summary[cfg.lang][provider] = { extracted: true, openedAyah: true };
        }
      }

      summary.stubStats = stubStats;
      assert.equal(stubStats.geminiCalls, 4, 'Expected 4 Gemini calls (2 en + 2 ar)');
      assert.equal(stubStats.claudeCalls, 4, 'Expected 4 Claude calls (2 en + 2 ar)');
      assert.equal(errors.length, 0, `Renderer errors: ${errors.join('; ')}`);

      fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ ok: true, summary, errors }, null, 2));
      console.log('KEY-448 live verification PASS');
      app.exit(0);
    } catch (error) {
      console.error('KEY-448 live verification FAILED:', error);
      fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error?.stack || error));
      try { await snap('failure.png'); } catch {}
      app.exit(1);
    }
  });
});

require(path.join(process.cwd(), 'dist/main/index.js'));
