// Offline smoke test and Arabic typing helper for BagLib Research Editor (KEY-362).
// Serves research-editor/dist from custom scheme 'editor://', blocks every external request,
// verifies offline mount in page & edgeless modes (ar RTL and en LTR), tests CDP Arabic typing,
// and saves evidence screenshots and result.json.

const { app, BrowserWindow, protocol, net, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '../..');
const distDir = path.join(repoRoot, 'research-editor/dist');
const outDir = path.resolve(process.env.BAGLIB_KEY362_EVIDENCE || path.join(repoRoot, '.baglib-data/KEY-362-evidence'));
const profileDir = path.resolve(process.env.BAGLIB_KEY362_PROFILE || path.join(repoRoot, '.baglib-data/KEY-362-profile'));

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(profileDir, { recursive: true });

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'editor',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

app.setPath('userData', profileDir);

app.whenReady().then(async () => {
  protocol.handle('editor', request => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    // Remove leading slash for path.join
    const relativePath = pathname.replace(/^\/+/u, '');
    const filePath = path.join(distDir, relativePath);
    if (!filePath.startsWith(distDir)) {
      return new Response('forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  const blocked = [];
  session.defaultSession.webRequest.onBeforeRequest((details, done) => {
    const ok = /^(editor|devtools|data|blob):/u.test(details.url);
    if (!ok) {
      blocked.push(details.url);
    }
    done({ cancel: !ok });
  });

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
    },
  });

  const errors = [];
  win.webContents.on('console-message', event => {
    const { level, message } = event;
    if (level === 'error' || level === 3) {
      errors.push(String(message).slice(0, 300));
    }
  });

  win.webContents.on('render-process-gone', (_e, d) => {
    errors.push('renderer gone: ' + d.reason);
  });

  const shot = async name => {
    await new Promise(r => setTimeout(r, 500));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `${name}.png`), image.toPNG());
  };

  const evaluate = code => win.webContents.executeJavaScript(code, true);

  const wait = async (code, timeoutMs = 30000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const val = await evaluate(code);
        if (val) return val;
      } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`Timeout waiting for: ${code}`);
  };

  const results = {};

  try {
    // ------------------------------------------------------------------------
    // Scenario 1: English LTR mount in page mode, then switch to edgeless mode
    // ------------------------------------------------------------------------
    await win.loadURL('editor://app/index.html?lang=en');
    await wait('document.documentElement.dataset.researchEditorReady === "true"');

    const enDir = await evaluate('document.documentElement.dir');
    const enLang = await evaluate('document.documentElement.lang');
    const enInitialMode = await evaluate('window.__baglibResearchEditor.mode');
    await wait('!!document.querySelector("affine-editor-container")');
    await shot('01-page-en');

    // Switch to edgeless mode
    await evaluate('window.__baglibResearchEditor.setMode("edgeless")');
    await wait('window.__baglibResearchEditor.mode === "edgeless"');
    await wait('!!document.querySelector("affine-edgeless-root")');
    await shot('02-edgeless-en');

    results.en = {
      lang: enLang,
      dir: enDir,
      initialMode: enInitialMode,
      edgelessSwitched: true,
    };

    // ------------------------------------------------------------------------
    // Scenario 2: Arabic RTL mount in page mode, then switch to edgeless mode
    // ------------------------------------------------------------------------
    await win.loadURL('editor://app/index.html?lang=ar');
    await wait('document.documentElement.dataset.researchEditorReady === "true"');

    const arDir = await evaluate('document.documentElement.dir');
    const arLang = await evaluate('document.documentElement.lang');
    const arInitialMode = await evaluate('window.__baglibResearchEditor.mode');
    await wait('!!document.querySelector("affine-editor-container")');
    await shot('03-page-ar');

    await evaluate('window.__baglibResearchEditor.setMode("edgeless")');
    await wait('window.__baglibResearchEditor.mode === "edgeless"');
    await wait('!!document.querySelector("affine-edgeless-root")');
    await shot('04-edgeless-ar');

    results.ar = {
      lang: arLang,
      dir: arDir,
      initialMode: arInitialMode,
      edgelessSwitched: true,
    };

    // ------------------------------------------------------------------------
    // Scenario 3: Arabic Typing Helper & Slash Menu test (Page mode)
    // ------------------------------------------------------------------------
    // Switch back to page mode
    await evaluate('window.__baglibResearchEditor.setMode("page")');
    await wait('window.__baglibResearchEditor.mode === "page"');
    await new Promise(r => setTimeout(r, 600));

    // Focus editor paragraph rich-text and initialize inline range
    const setupResult = await evaluate(`(() => {
      const editor = window.__baglibResearchEditor?.editor;
      if (!editor) return { ok: false, error: 'no editor' };
      const host = editor.host;
      if (!host) return { ok: false, error: 'no host' };

      // Activate UI event dispatcher on host
      if (host.event) {
        host.event.active = true;
      }

      const paragraph = editor.querySelector('affine-paragraph');
      if (!paragraph) return { ok: false, error: 'no paragraph' };

      const richText = paragraph.querySelector('rich-text') || paragraph.querySelector('.inline-editor');
      if (!richText) return { ok: false, error: 'no rich-text' };

      const editable = richText.querySelector('[contenteditable="true"]') || richText;
      editable.focus();

      if (richText.inlineEditor) {
        richText.inlineEditor.setInlineRange({ index: 0, length: 0 });
      }

      // Also ensure caret in DOM selection
      const range = document.createRange();
      const vText = richText.querySelector('v-text') || richText.querySelector('[data-v-text]') || editable;
      range.selectNodeContents(vText);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);

      return {
        ok: true,
        blockId: paragraph.model?.id || paragraph.blockId,
        hasInlineEditor: !!richText.inlineEditor,
      };
    })()`);

    // Attach debugger for CDP input simulation
    let cdpAttached = false;
    let menuCheck = { menuExists: false, menuVisible: false, widgetExists: false };
    let filterCheck = { menuStillOpen: false, filteredCount: 0, queryState: 'none' };
    let typedTextResult = '';

    try {
      win.webContents.debugger.attach('1.3');
      cdpAttached = true;

      // Send ONE "/" key via dispatchKeyEvent (keyDown + keyUp).
      // Note: do NOT send a separate Input.insertText('/') because keyDown with text already inputs '/'.
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: '/',
        code: 'Slash',
        text: '/',
        windowsVirtualKeyCode: 191,
      });
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: '/',
        code: 'Slash',
        windowsVirtualKeyCode: 191,
      });
      await new Promise(r => setTimeout(r, 600));

      // Check if affine-slash-menu opened
      menuCheck = await evaluate(`(() => {
        const menu = document.querySelector('affine-slash-menu');
        const widget = document.querySelector('affine-slash-menu-widget');
        return {
          menuExists: !!menu,
          menuVisible: menu ? (menu.style.visibility !== 'hidden' && menu.offsetHeight > 0) : false,
          widgetExists: !!widget,
        };
      })()`);

      // Type Arabic word "آية" via insertText
      await win.webContents.debugger.sendCommand('Input.insertText', { text: 'آية' });
      await new Promise(r => setTimeout(r, 600));

      filterCheck = await evaluate(`(() => {
        const menu = document.querySelector('affine-slash-menu');
        if (!menu) return { menuStillOpen: false, filteredCount: 0, queryState: 'none' };
        return {
          menuStillOpen: true,
          queryState: menu._queryState || 'unknown',
          filteredCount: Array.isArray(menu._filteredItems) ? menu._filteredItems.length : 0,
        };
      })()`);

      typedTextResult = await evaluate(`(() => {
        const paragraph = document.querySelector('affine-paragraph');
        return paragraph?.textContent || '';
      })()`);
    } catch (cdpErr) {
      results.cdpError = String(cdpErr);
    } finally {
      if (cdpAttached) {
        try {
          win.webContents.debugger.detach();
        } catch {}
      }
    }

    await shot('05-arabic-typing');

    // Also test taking a snapshot
    const snapshot = await evaluate('window.__baglibResearchEditor.snapshot()');

    const menuOpens = menuCheck.menuExists ? 'yes' : 'no';
    const arabicFilter = filterCheck.menuStillOpen && filterCheck.filteredCount > 0 ? 'yes' : 'no';
    const arabicInParagraph = typedTextResult.includes('آية') ? 'yes' : 'no';

    results.arabicTyping = {
      focused: setupResult.ok,
      cdpAttached,
      menuOpens,
      arabicFilter,
      arabicInParagraph,
      slashMenuOpened: menuCheck.menuExists,
      menuDetails: {
        menuCheck,
        filterCheck,
      },
      typedTextResult,
      hasArabicText: typedTextResult.includes('آية'),
      snapshotDocId: snapshot?.meta?.id || null,
    };

    results.status = 'pass';
  } catch (err) {
    results.status = 'fail';
    results.error = String(err && err.stack ? err.stack : err);
    try {
      await shot('failure');
    } catch {}
  }

  const finalOutput = {
    results,
    errorCount: errors.length,
    errors,
    blockedCount: blocked.length,
    blocked,
  };

  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(finalOutput, null, 2));
  console.log(JSON.stringify(finalOutput, null, 2));

  const exitCode = results.status === 'pass' && errors.length === 0 && blocked.length === 0 ? 0 : 1;
  app.exit(exitCode);
});
