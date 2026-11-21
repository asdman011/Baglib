// KEY-446 live verification in Electron (ar & en, real Arabic & English PDFs copied into throwaway profile, stubbed Ollama).
const { app } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY446_PROFILE;
const evidence = process.env.BAGLIB_KEY446_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('KEY-446 hard timeout'); app.exit(1); }, 220_000).unref();

let stubPort = 0;

function startStubOllama() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/chat') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          if (Array.isArray(parsed.tools) && parsed.tools.length > 0) {
            res.end(JSON.stringify({
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [{ id: 'tc-1', function: { name: 'extract_pdf_pages', arguments: { bookTitle: 'this book', pages: '8-12' } } }],
              },
            }));
          } else {
            res.end(JSON.stringify({
              message: {
                role: 'assistant',
                content: 'Based on the attached verse [1], Allah is the Ever-Living, Sustainer of all existence.',
              },
            }));
          }
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'stub-tools-model' }] }));
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

  win.webContents.once('did-finish-load', async () => {
    if (running) return;
    running = true;
    const server = await startStubOllama();
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
        await window.electronAPI.ai.saveSettings({
          enabled: true,
          provider: 'ollama',
          ollamaEndpoint: 'http://127.0.0.1:${stubPort}',
          ollamaModel: 'stub-tools-model',
          learningModes: { revision: 'off', reader: 'full', quran: 'full', sunnah: 'full', notes: 'full', researchEditor: 'full' },
        });
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

      for (const cfg of [
        { lang: 'en', bookTitle: 'The Master and His Emissary', pdfPath: enPdf, extractCmd: 'extract pages 8 to 12', ayahPrompt: 'Explain this ayah' },
        { lang: 'ar', bookTitle: 'رسالة في أصول الفقه', pdfPath: arPdf, extractCmd: 'استخرج الصفحات 8 إلى 12', ayahPrompt: 'اشرح هذه الآية' },
      ]) {
        await win.webContents.executeJavaScript(`(async () => {
          localStorage.setItem('baglib-lang', ${JSON.stringify(cfg.lang)});
          await window.electronAPI.settings.set('workspace.tabs.v1', null);
          await window.electronAPI.settings.set('workspace.closedTabs.v1', null);
          return true;
        })()`, true);
        await win.webContents.reloadIgnoringCache();
        await waitFor('!!window.electronAPI && !!document.querySelector("[data-nav-item=\\"library\\"]")', `${cfg.lang} app reloaded`);
        await win.webContents.executeJavaScript('document.querySelector("[data-nav-item=\\"library\\"]").click()', true);
        await waitFor('document.querySelectorAll("[data-library-book-card]").length >= 2', `${cfg.lang} library ready`);

        // Close assistant if open & clear chat
        await win.webContents.executeJavaScript(`(() => {
          const close = document.querySelector('[data-assistant-panel] button[aria-label*="Close"], [data-assistant-panel] button[aria-label*="إغلاق"]');
          if (close) close.click();
          return true;
        })()`, true);

        // 1. Right-click real book card -> Add to AI conversation
        await win.webContents.executeJavaScript(`(() => {
          const card = [...document.querySelectorAll('[data-library-book-card]')].find(el => el.getAttribute('aria-label')?.includes(${JSON.stringify(cfg.bookTitle)}));
          if (!card) return false;
          const r = card.getBoundingClientRect();
          card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 }));
          return true;
        })()`, true);
        await waitFor('!!document.querySelector("[role=menu]")', `${cfg.lang} book context menu`);
        const addToAiLabel = cfg.lang === 'ar' ? 'إضافة إلى محادثة الذكاء الاصطناعي' : 'Add to AI conversation';
        await win.webContents.executeJavaScript(`(() => {
          const item = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].find(el => el.textContent?.includes(${JSON.stringify(addToAiLabel)}));
          if (!item) return false;
          item.click();
          return true;
        })()`, true);

        await waitFor('!!document.querySelector("[data-assistant-panel]") && !!document.querySelector("[data-assistant-source^=\\"book:\\"]")', `${cfg.lang} assistant opened with book chip`);
        summary[cfg.lang].bookChipAttached = true;

        // 2. WITHOUT toggling Actions mode, send natural extract request -> preview -> confirm -> new file
        await submitAssistant(cfg.extractCmd);
        await waitFor('!!document.querySelector("[data-ai-action-confirm]")', `${cfg.lang} extract preview`);
        await snap(`01-preview-${cfg.lang}.png`);

        await win.webContents.executeJavaScript('document.querySelector("[data-ai-action-confirm]").click()', true);
        await waitFor('!!document.querySelector("[data-ai-action-undo]")', `${cfg.lang} extract executed`);
        const newFiles = fs.readdirSync(booksDir).filter(f => f !== 'ar-book.pdf' && f !== 'en-book.pdf' && f.endsWith('.pdf'));
        assert.ok(newFiles.length >= 1, `Expected extracted PDF in ${cfg.lang}`);
        summary[cfg.lang].extractedFiles = newFiles;
        await snap(`02-executed-${cfg.lang}.png`);

        // Remove book chip
        await win.webContents.executeJavaScript('document.querySelector("[data-assistant-source^=\\"book:\\"] button").click()', true);
        await waitFor('!document.querySelector("[data-assistant-source^=\\"book:\\"]")', `${cfg.lang} book chip removed`);

        const noteCreated = await win.webContents.executeJavaScript(`window.electronAPI.studyNotes.save({
          title: 'KEY-446 Study Note',
          content: 'This note records the primary evidence for the live cited answer check.',
          aliases: [],
          tags: ['key446']
        })`, true);
        assert.ok(noteCreated?.id, 'Expected study note');
        await win.webContents.executeJavaScript('document.querySelector("[data-assistant-add-source]").click()', true);
        await waitFor('!!document.querySelector("[data-assistant-source-search]")', `${cfg.lang} source picker`);
        const hasQuran = await win.webContents.executeJavaScript(`(async () => {
          const cat = await window.electronAPI.quran.readerCatalog();
          return !!(cat?.ok && cat.data.sources.some(s => s.kind === 'script' && s.profile === 'hafs'));
        })()`, true);
        if (hasQuran) {
          await win.webContents.executeJavaScript(`(() => {
            const input = document.querySelector('[data-assistant-source-search]');
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            setter.call(input, '2:255');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          })()`, true);
          await waitFor('!!document.querySelector("[data-assistant-pick=\\"quran:hafs:2:255\\"]")', `${cfg.lang} ayah pick`);
          await win.webContents.executeJavaScript('document.querySelector("[data-assistant-pick=\\"quran:hafs:2:255\\"]").click()', true);
          await waitFor('!!document.querySelector("[data-assistant-source=\\"quran:hafs:2:255\\"]")', `${cfg.lang} ayah chip attached`);
          summary[cfg.lang].pickedKind = 'quran';
        } else {
          await waitFor(`!!document.querySelector('[data-assistant-pick="note:${noteCreated.id}"]')`, `${cfg.lang} note pick`);
          await win.webContents.executeJavaScript(`document.querySelector('[data-assistant-pick="note:${noteCreated.id}"]').click()`, true);
          await waitFor(`!!document.querySelector('[data-assistant-source="note:${noteCreated.id}"]')`, `${cfg.lang} note chip attached`);
          summary[cfg.lang].pickedKind = 'note';
        }

        await submitAssistant(cfg.ayahPrompt);
        await waitFor('!!document.querySelector("[data-research-ai-citations]")', `${cfg.lang} cited answer`);
        summary[cfg.lang].citedAnswer = true;
        await snap(`03-cited-source-${cfg.lang}.png`);
      }

      // 4. Unsupported provider check (gemini) -> clear unsupported error with settings button
      await win.webContents.executeJavaScript(`(async () => {
        await window.electronAPI.ai.saveSettings({
          enabled: true,
          provider: 'gemini',
          geminiApiKey: 'stub-key',
          learningMode: { globalChat: 'full', library: 'full' },
        });
        return true;
      })()`, true);
      await submitAssistant('extract pages 8 to 12');
      await waitFor('!!document.querySelector("[data-assistant-consent-allow]") || document.querySelectorAll("[data-research-ai-message=\\"error\\"]").length >= 1', 'consent or unsupported provider error');
      await win.webContents.executeJavaScript('document.querySelector("[data-assistant-consent-allow]")?.click()', true);
      await waitFor('document.querySelectorAll("[data-research-ai-message=\\"error\\"]").length >= 1', 'unsupported provider error');
      const errInfo = await win.webContents.executeJavaScript(`(() => {
        const errs = document.querySelectorAll('[data-research-ai-message="error"]');
        const last = errs[errs.length - 1];
        return { text: last?.textContent || '', hasSettingsBtn: !!last?.querySelector('button') };
      })()`, true);
      assert.ok(errInfo.hasSettingsBtn, 'Expected AI Settings button on unsupported-tool error');
      summary.unsupportedProviderError = errInfo;
      await snap('04-unsupported-provider.png');

      fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ ok: true, summary, errors }, null, 2));
      assert.equal(errors.length, 0, `Renderer errors: ${errors.join('; ')}`);
      console.log('KEY-446 live verification PASS');
      server.close();
      app.exit(0);
    } catch (error) {
      console.error('KEY-446 live verification FAILED:', error);
      fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error?.stack || error));
      try { await snap('failure.png'); } catch {}
      server.close();
      app.exit(1);
    }
  });
});

require(path.join(process.cwd(), 'dist/main/index.js'));
