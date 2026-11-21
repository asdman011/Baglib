// KEY-449 live verification in Electron (ar & en, real Arabic & English PDFs in throwaway profile, stubbed Gemini & shell calls).
const electron = require('electron');
const { app } = electron;
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY449_PROFILE;
const evidence = process.env.BAGLIB_KEY449_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('KEY-449 hard timeout'); app.exit(1); }, 220_000).unref();

const stubStats = {
  geminiActionCalls: 0,
  geminiChatCalls: 0,
  shownInFolder: [],
  openedPaths: [],
};

// Stub shell.showItemInFolder and shell.openPath in main before IPC registration
electron.shell.showItemInFolder = filePath => {
  stubStats.shownInFolder.push(filePath);
};
electron.shell.openPath = async filePath => {
  stubStats.openedPaths.push(filePath);
  return '';
};

const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  if (href.startsWith('https://generativelanguage.googleapis.com/v1beta/models/') && href.endsWith(':generateContent')) {
    const body = JSON.parse(String(init.body || '{}'));
    const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
    const sysText = String(body.systemInstruction?.parts?.[0]?.text || '');
    const userText = String(body.contents?.[0]?.parts?.[0]?.text || '');

    if (hasTools) {
      stubStats.geminiActionCalls++;
      const functionCall = {
        name: 'extract_pdf_pages',
        args: {
          bookTitle: /رسالة/.test(userText) ? 'رسالة في أصول الفقه' : 'The Master and His Emissary',
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

    stubStats.geminiChatCalls++;
    assert.ok(sysText.includes('<EXECUTED_ACTIONS>'), 'Chat system prompt must include <EXECUTED_ACTIONS>');
    const match = /outputPaths=([^\s|\n]+)/u.exec(sysText);
    assert.ok(match && match[1], 'Chat system prompt <EXECUTED_ACTIONS> must include outputPaths');
    const outPath = match[1];
    const reply = /[\u0600-\u06FF]/u.test(userText)
      ? `الملف الناتج محفوظ في المسار التالي: ${outPath}`
      : `The extracted output file is saved at: ${outPath}`;
    return new Response(
      JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text: reply }] }, finishReason: 'STOP' }],
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
    const prevUndoCount = await win.webContents.executeJavaScript('document.querySelectorAll("[data-ai-action-undo]").length', true);
    const prevConfirmCount = await win.webContents.executeJavaScript('document.querySelectorAll("[data-ai-action-confirm]").length', true);
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
      await waitFor(`document.querySelectorAll("[data-ai-action-confirm]").length > ${prevConfirmCount}`, `${label} preview after consent`);
    }
    await win.webContents.executeJavaScript(`(() => {
      const btns = document.querySelectorAll('[data-ai-action-confirm]');
      btns[btns.length - 1].click();
      return true;
    })()`, true);
    await waitFor(`document.querySelectorAll("[data-ai-action-undo]").length > ${prevUndoCount}`, `${label} executed`);
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
        await window.electronAPI.ai.saveSettings({
          enabled: true,
          provider: 'gemini',
          geminiApiKey: 'stub-gemini-key',
          geminiModel: 'gemini-2.5-flash',
          learningModes: { revision: 'off', reader: 'full', quran: 'full', sunnah: 'full', notes: 'full', researchEditor: 'full' },
        });
        return true;
      })()`, true);

      const summary = {};
      for (const cfg of [
        {
          lang: 'en',
          extractCmd: 'extract pages 8 to 12 from The Master and His Emissary',
          whereCmd: 'where is the output?',
          addLibraryCmd: 'add it to my library',
        },
        {
          lang: 'ar',
          extractCmd: 'استخرج الصفحات 8 إلى 12 من رسالة في أصول الفقه',
          whereCmd: 'أين الملف الناتج؟',
          addLibraryCmd: 'أضفه إلى مكتبتي',
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

        await win.webContents.executeJavaScript(`(() => {
          const btn = document.querySelector('[data-assistant-fab]');
          if (!document.querySelector('[data-assistant-panel]') && btn) btn.click();
          return true;
        })()`, true);
        await waitFor('!!document.querySelector("[data-research-ai-input]")', `${cfg.lang} assistant open`);

        // 1. Extract pages 8 to 12
        await runActionWithConsent(cfg.extractCmd, `${cfg.lang} extract`);
        const outputPath = await waitFor(
          `document.querySelector('[data-ai-output-card]')?.getAttribute('data-ai-output-card') || ''`,
          `${cfg.lang} output card`
        );
        assert.ok(fs.existsSync(outputPath), `Extracted output file must exist on disk: ${outputPath}`);

        // 2. Click Show in folder & Open
        const prevShowCount = stubStats.shownInFolder.length;
        const prevOpenCount = stubStats.openedPaths.length;
        await win.webContents.executeJavaScript(`(() => {
          document.querySelector('[data-ai-output-show]').click();
          document.querySelector('[data-ai-output-open]').click();
          return true;
        })()`, true);
        await pause(400);
        assert.equal(stubStats.shownInFolder.length, prevShowCount + 1, `${cfg.lang} Show in folder must call shell.showItemInFolder`);
        assert.equal(stubStats.shownInFolder[prevShowCount], outputPath);
        assert.equal(stubStats.openedPaths.length, prevOpenCount + 1, `${cfg.lang} Open must call shell.openPath`);
        assert.equal(stubStats.openedPaths[prevOpenCount], outputPath);
        await snap(`01-result-card-${cfg.lang}.png`);

        // 3. Ask "where is the output?" and verify the exact path appears in the assistant reply
        const prevMsgCount = await win.webContents.executeJavaScript('document.querySelectorAll("[data-research-ai-message=\\"assistant\\"]").length', true);
        await submitAssistant(cfg.whereCmd);
        await waitFor(
          `document.querySelectorAll("[data-research-ai-message=\\"assistant\\"]").length > ${prevMsgCount}`,
          `${cfg.lang} where-is-output reply`
        );
        const whereReply = await win.webContents.executeJavaScript(`(() => {
          const msgs = document.querySelectorAll('[data-research-ai-message="assistant"]');
          return msgs[msgs.length - 1]?.textContent || '';
        })()`, true);
        assert.ok(whereReply.includes(outputPath), `${cfg.lang} reply must contain exact output path ${outputPath}, got: ${whereReply}`);

        // 4. Send "add it to my library" and verify it imports and disables the Add to library button
        const prevAddCount = await win.webContents.executeJavaScript('document.querySelectorAll("[data-research-ai-message=\\"assistant\\"]").length', true);
        await submitAssistant(cfg.addLibraryCmd);
        await waitFor(
          `document.querySelectorAll("[data-research-ai-message=\\"assistant\\"]").length > ${prevAddCount}`,
          `${cfg.lang} add-to-library reply`
        );
        const addDisabled = await waitFor(
          `document.querySelector('[data-ai-output-add-library]')?.disabled === true`,
          `${cfg.lang} Add to library button marked added`
        );
        assert.equal(addDisabled, true);
        await snap(`02-followup-${cfg.lang}.png`);

        summary[cfg.lang] = { outputPath, whereReplyOk: true, addedToLibrary: true };
      }

      summary.stubStats = stubStats;
      assert.equal(stubStats.geminiActionCalls, 2);
      assert.equal(stubStats.geminiChatCalls, 2);
      assert.equal(errors.length, 0, `Renderer errors: ${errors.join('; ')}`);

      fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ ok: true, summary, errors }, null, 2));
      console.log('KEY-449 live verification PASS');
      app.exit(0);
    } catch (error) {
      console.error('KEY-449 live verification FAILED:', error);
      fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error?.stack || error));
      try { await snap('failure.png'); } catch {}
      app.exit(1);
    }
  });
});

require(path.join(process.cwd(), 'dist/main/index.js'));
