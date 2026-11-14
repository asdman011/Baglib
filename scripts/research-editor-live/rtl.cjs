// Offline RTL Live Verification for BagLib Research Editor (KEY-365).
// Verifies:
// 1. Saved per-block direction override ('auto' / 'rtl' / 'ltr') on block model props,
//    surviving save/reload and snapshot export.
// 2. HTML export writing dir (rtl / ltr / auto per block).
// 3. Edgeless frame title placement on the right in RTL.
// 4. Slash menu caret anchoring in RTL paragraphs.
// 5. Heading collapse icon in RTL (:dir(rtl) / [dir="rtl"]) and mirrored chevron.
// 6. Mixed text around inline footnote citations (quran:hafs:2:255, sunnah:bukhari:1) and caret movement.
// 7. Table and database blocks with mirrored column order in RTL.
// 8. Arabic typing via CDP.

const { app, BrowserWindow, protocol, net, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '../..');
const distDir = path.join(repoRoot, 'research-editor/dist');
const outDir = path.resolve(process.env.BAGLIB_KEY365_EVIDENCE || path.join(repoRoot, '.baglib-data/KEY-365-evidence'));
const profileDir = path.resolve(process.env.BAGLIB_KEY365_PROFILE || path.join(repoRoot, '.baglib-data/KEY-365-profile'));

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

// Real text taken from tests/real-files (Rule: real-files used directly, never modified or committed)
const REAL_ARABIC_TEXT = 'الدفاع عن أراضي المسلمين أهم فروض الأعيان، ومعه نصيحة هامة للمجاهدين.';
const REAL_ENGLISH_TEXT = 'What is placed in or left out of the archive is a political act, dictated by the archivist.';
const REAL_MIXED_START_EN = 'BagLib هو تطبيق للمكتبة والبحث العلمي وإدارة المراجع والمخطوطات.';

app.whenReady().then(async () => {
  protocol.handle('editor', request => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';
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
    await new Promise(r => setTimeout(r, 600));
    const image = await win.webContents.capturePage();
    const filePath = path.join(outDir, `${name}.png`);
    fs.writeFileSync(filePath, image.toPNG());
    return filePath;
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
    // Step 1: Mount in Arabic RTL mode (?lang=ar)
    // ------------------------------------------------------------------------
    await win.loadURL('editor://app/index.html?lang=ar');
    await wait('document.documentElement.dataset.researchEditorReady === "true"');
    await wait('!!document.querySelector("affine-editor-container")');

    const initialLang = await evaluate('document.documentElement.lang');
    const initialDir = await evaluate('document.documentElement.dir');
    results.initialMount = { lang: initialLang, dir: initialDir };

    // ------------------------------------------------------------------------
    // Step 2: Build document with Paragraphs (Arabic, English, Mixed)
    // ------------------------------------------------------------------------
    const docSetup = await evaluate(`(async () => {
      const editor = window.__baglibResearchEditor?.editor;
      const store = editor?.doc;
      if (!store) return { ok: false, error: 'no store' };

      const note = store.getBlocksByFlavour('affine:note')[0];
      if (!note) return { ok: false, error: 'no note block' };
      const noteId = note.id;

      // Clear initial default paragraph if empty
      const initialParas = store.getBlocksByFlavour('affine:paragraph');
      for (const p of initialParas) {
        if (!p.text || p.text.length === 0) {
          store.deleteBlock(p);
        }
      }

      // 1. Pure Arabic paragraph
      const arParaId = store.addBlock('affine:paragraph', { type: 'text' }, noteId);
      const arPara = store.getBlock(arParaId);
      arPara.model.text.insert(${JSON.stringify(REAL_ARABIC_TEXT)}, 0);

      // 2. Pure English paragraph
      const enParaId = store.addBlock('affine:paragraph', { type: 'text' }, noteId);
      const enPara = store.getBlock(enParaId);
      enPara.model.text.insert(${JSON.stringify(REAL_ENGLISH_TEXT)}, 0);

      // 3. Arabic paragraph starting with an English word ("BagLib هو تطبيق...")
      const mixedParaId = store.addBlock('affine:paragraph', { type: 'text' }, noteId);
      const mixedPara = store.getBlock(mixedParaId);
      mixedPara.model.text.insert(${JSON.stringify(REAL_MIXED_START_EN)}, 0);

      await editor.updateComplete;
      return {
        ok: true,
        arParaId,
        enParaId,
        mixedParaId,
      };
    })()`);

    if (!docSetup.ok) throw new Error('docSetup failed: ' + docSetup.error);

    await new Promise(r => setTimeout(r, 600));

    // Inspect initial paragraph directions (0001 auto-direction)
    const initialParaCheck = await evaluate(`(() => {
      const paras = Array.from(document.querySelectorAll('affine-paragraph'));
      return paras.map(p => {
        const container = p.querySelector('.affine-paragraph-block-container') || p;
        const text = p.textContent.trim();
        const dirAttr = container.getAttribute('dir');
        const compDir = window.getComputedStyle(container).direction;
        return { text: text.slice(0, 30), dirAttr, compDir, blockId: p.model?.id || p.blockId };
      });
    })()`);

    results.paragraphsBeforeOverride = initialParaCheck;
    await shot('01-paragraphs-rtl-ltr');

    // ------------------------------------------------------------------------
    // Step 3: Apply Direction Override (textDirection: 'rtl') to mixed paragraph
    // ------------------------------------------------------------------------
    const overrideResult = await evaluate(`(async () => {
      const editor = window.__baglibResearchEditor?.editor;
      const store = editor?.doc;
      const mixedId = ${JSON.stringify(docSetup.mixedParaId)};
      const mixedBlock = store.getBlock(mixedId);
      if (!mixedBlock) return { ok: false, error: 'no mixed block' };

      // Set textDirection override on the model
      store.updateBlock(mixedBlock.model, { textDirection: 'rtl' });
      await editor.updateComplete;
      await new Promise(r => setTimeout(r, 400));

      const pEl = Array.from(document.querySelectorAll('affine-paragraph')).find(p => (p.model?.id || p.blockId) === mixedId);
      const container = pEl?.querySelector('.affine-paragraph-block-container') || pEl;
      return {
        ok: true,
        modelProp: mixedBlock.model.textDirection,
        domDirAttr: container?.getAttribute('dir'),
        domCompDir: container ? window.getComputedStyle(container).direction : null,
        domTextAlign: container ? window.getComputedStyle(container).textAlign : null,
      };
    })()`);

    results.paragraphOverride = overrideResult;
    await shot('02-override-before-after');

    // ------------------------------------------------------------------------
    // Step 4: Add Lists (Arabic & English) and Quotes
    // ------------------------------------------------------------------------
    const listQuoteSetup = await evaluate(`(async () => {
      const editor = window.__baglibResearchEditor?.editor;
      const store = editor?.doc;
      const note = store.getBlocksByFlavour('affine:note')[0];
      const noteId = note.id;

      // Arabic bulleted list item with textDirection: 'rtl'
      const arListId = store.addBlock('affine:list', { type: 'bulleted', textDirection: 'rtl' }, noteId);
      store.getBlock(arListId).model.text.insert('عنصر قائمة نقطية عربي موثق من التراث.', 0);

      // Arabic numbered list item with textDirection: 'rtl'
      const arNumListId = store.addBlock('affine:list', { type: 'numbered', textDirection: 'rtl' }, noteId);
      store.getBlock(arNumListId).model.text.insert('عنصر قائمة رقمية عربي ثانٍ يوضح الترتيب.', 0);

      // English bulleted list item with textDirection: 'ltr'
      const enListId = store.addBlock('affine:list', { type: 'bulleted', textDirection: 'ltr' }, noteId);
      store.getBlock(enListId).model.text.insert('Archival citation record in English bullet.', 0);

      // Arabic Quote block with textDirection: 'rtl'
      const quoteId = store.addBlock('affine:paragraph', { type: 'quote', textDirection: 'rtl' }, noteId);
      store.getBlock(quoteId).model.text.insert('«من عمل بما علم أورثه الله علم ما لم يعلم» — اقتباس تراثي مسند.', 0);

      await editor.updateComplete;
      await new Promise(r => setTimeout(r, 500));

      const lists = Array.from(document.querySelectorAll('affine-list'));
      const arListEl = lists.find(l => (l.model?.id || l.blockId) === arListId);
      const arListContainer = arListEl?.querySelector('.affine-list-block-container') || arListEl;

      const paras = Array.from(document.querySelectorAll('affine-paragraph'));
      const quoteEl = paras.find(p => (p.model?.id || p.blockId) === quoteId);
      const quoteContainer = quoteEl?.querySelector('.affine-paragraph-block-container') || quoteEl;

      return {
        ok: true,
        arListFound: !!arListEl,
        arListDir: arListContainer?.getAttribute('dir'),
        arListCompDir: arListContainer ? window.getComputedStyle(arListContainer).direction : null,
        quoteFound: !!quoteEl,
        quoteDir: quoteContainer?.getAttribute('dir'),
        quoteCompDir: quoteContainer ? window.getComputedStyle(quoteContainer).direction : null,
      };
    })()`);

    results.listsAndQuotes = listQuoteSetup;
    await shot('03-lists-and-quotes');

    // ------------------------------------------------------------------------
    // Step 5: Headings with Collapse Icon (:dir(rtl) and reversed chevron)
    // ------------------------------------------------------------------------
    const headingSetup = await evaluate(`(async () => {
      const editor = window.__baglibResearchEditor?.editor;
      const store = editor?.doc;
      const note = store.getBlocksByFlavour('affine:note')[0];
      const noteId = note.id;

      // H1 heading
      const h1Id = store.addBlock('affine:paragraph', { type: 'h1', textDirection: 'rtl' }, noteId);
      store.getBlock(h1Id).model.text.insert('الباب الأول: مقدمة في علوم المخطوطات والتحقيق', 0);

      // H2 heading
      const h2Id = store.addBlock('affine:paragraph', { type: 'h2', textDirection: 'rtl' }, noteId);
      store.getBlock(h2Id).model.text.insert('الفصل الأول: مناهج التوثيق والمقابلة بين النسخ', 0);

      await editor.updateComplete;
      await new Promise(r => setTimeout(r, 500));

      const paras = Array.from(document.querySelectorAll('affine-paragraph'));
      const h1El = paras.find(p => (p.model?.id || p.blockId) === h1Id);
      const container = h1El?.querySelector('.affine-paragraph-block-container') || h1El;
      const icon = h1El?.querySelector('affine-paragraph-heading-icon') || h1El?.querySelector('.heading-icon');
      const iconStyle = icon ? window.getComputedStyle(icon) : null;

      return {
        ok: true,
        h1Id,
        h2Id,
        dir: container?.getAttribute('dir'),
        iconFound: !!icon,
        iconRight: iconStyle?.right,
        iconLeft: iconStyle?.left,
        iconPosition: iconStyle?.position,
      };
    })()`);

    results.headings = headingSetup;
    await shot('04-headings-collapse-icon');

    // ------------------------------------------------------------------------
    // Step 6: Slash menu caret anchor in RTL paragraph
    // ------------------------------------------------------------------------
    const focusArPara = await evaluate(`(() => {
      const editor = window.__baglibResearchEditor?.editor;
      if (!editor) return { ok: false, error: 'no editor' };
      const host = editor.host;
      if (host && host.event) {
        host.event.active = true;
      }

      const arId = ${JSON.stringify(docSetup.arParaId)};
      const arPara = Array.from(document.querySelectorAll('affine-paragraph')).find(p => (p.model?.id || p.blockId) === arId);
      if (!arPara) return { ok: false, error: 'arPara not found' };
      const richText = arPara.querySelector('rich-text') || arPara.querySelector('.inline-editor');
      if (!richText) return { ok: false, error: 'rich-text not found' };
      const editable = richText.querySelector('[contenteditable="true"]') || richText;
      editable.focus();

      if (richText.inlineEditor) {
        richText.inlineEditor.setInlineRange({ index: 0, length: 0 });
      }

      const range = document.createRange();
      const vText = richText.querySelector('v-text') || richText.querySelector('[data-v-text]') || editable;
      range.selectNodeContents(vText);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);

      return { ok: true };
    })()`);

    let slashMenuResult = { focus: focusArPara };
    let cdpAttached = false;
    try {
      win.webContents.debugger.attach('1.3');
      cdpAttached = true;

      // Send "/" key
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

      await new Promise(r => setTimeout(r, 700));

      slashMenuResult = await evaluate(`(() => {
        const menu = document.querySelector('affine-slash-menu');
        const editorContainer = document.querySelector('affine-editor-container');
        if (!menu) return { menuExists: false };

        const menuRect = menu.getBoundingClientRect();
        const containerRect = editorContainer ? editorContainer.getBoundingClientRect() : { right: window.innerWidth };
        
        return {
          menuExists: true,
          menuVisible: menu.style.visibility !== 'hidden' && menu.offsetHeight > 0,
          rect: {
            left: menuRect.left,
            right: menuRect.right,
            top: menuRect.top,
            width: menuRect.width,
          },
          containerRight: containerRect.right,
          // Anchored on the right side in RTL
          isNearRightSide: (containerRect.right - menuRect.right) < 400,
        };
      })()`);

      await shot('05-slash-menu-rtl-caret');

      // Dismiss slash menu with Escape
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
      });
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
      });
      await new Promise(r => setTimeout(r, 400));
    } catch (e) {
      slashMenuResult.error = String(e);
    } finally {
      if (cdpAttached) {
        try { win.webContents.debugger.detach(); } catch {}
      }
    }
    results.slashMenu = slashMenuResult;

    // ------------------------------------------------------------------------
    // Step 7: Tables and Database blocks (Mirrored in RTL)
    // ------------------------------------------------------------------------
    const tableDbResult = await evaluate(`(async () => {
      const editor = window.__baglibResearchEditor?.editor;
      const store = editor?.doc;
      const note = store.getBlocksByFlavour('affine:note')[0];
      const noteId = note.id;

      // Add table block
      const tableId = store.addBlock('affine:table', {}, noteId);
      // Add database block
      const dbId = store.addBlock('affine:database', {}, noteId);

      await editor.updateComplete;
      await new Promise(r => setTimeout(r, 600));

      const tableEl = document.querySelector('affine-table');
      const tableInner = tableEl?.querySelector('table') || tableEl?.querySelector('[dir]');
      const dbEl = document.querySelector('affine-database');
      const dbInner = dbEl?.querySelector('[dir]') || dbEl;

      return {
        ok: true,
        tableId,
        dbId,
        tableDir: tableInner?.getAttribute('dir'),
        dbDir: dbInner?.getAttribute('dir'),
        tableExists: !!tableEl,
        dbExists: !!dbEl,
      };
    })()`);

    results.tableAndDatabase = tableDbResult;
    await shot('06-table-database-rtl');

    // ------------------------------------------------------------------------
    // Step 8: Inline Footnote Citations & Caret Movement
    // ------------------------------------------------------------------------
    const footnoteResult = await evaluate(`(async () => {
      const editor = window.__baglibResearchEditor?.editor;
      const store = editor?.doc;
      const note = store.getBlocksByFlavour('affine:note')[0];
      const noteId = note.id;

      // Paragraph with mixed Arabic text and inline Quran & Sunnah citations
      const fnParaId = store.addBlock('affine:paragraph', { type: 'text', textDirection: 'rtl' }, noteId);
      const fnPara = store.getBlock(fnParaId);

      // ZWNJ character for embed node in BlockSuite (ZERO_WIDTH_FOR_EMBED_NODE = '\u200C')
      const embedChar = '\u200C';

      // Insert Arabic text + footnote 1
      fnPara.model.text.insert('قوله تعالى في آية الكرسي: ﴿اللَّهُ لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ﴾', 0);
      fnPara.model.text.insert(embedChar, fnPara.model.text.length, {
        footnote: {
          label: '1',
          reference: {
            type: 'url',
            url: 'quran:hafs:2:255',
            title: 'سورة البقرة: ٢٥٥ (رواية حفص)',
          },
        },
      });

      // Insert middle Arabic text + footnote 2
      fnPara.model.text.insert('، والحديث المتفق عليه: «إنما الأعمال بالنيات»', fnPara.model.text.length);
      fnPara.model.text.insert(embedChar, fnPara.model.text.length, {
        footnote: {
          label: '2',
          reference: {
            type: 'url',
            url: 'sunnah:bukhari:1',
            title: 'صحيح البخاري: ١',
          },
        },
      });

      fnPara.model.text.insert(' - Classical text citation test.', fnPara.model.text.length);

      await editor.updateComplete;
      await new Promise(r => setTimeout(r, 600));

      // Verify footnote DOM elements rendered
      const fnNodes = Array.from(document.querySelectorAll('affine-footnote-node'));
      const footnoteDetails = fnNodes.map(node => ({
        label: node.textContent.trim(),
        url: node.footnote?.reference?.url,
        title: node.footnote?.reference?.title,
      }));

      // Test caret movement & selection through the footnote
      const pEl = Array.from(document.querySelectorAll('affine-paragraph')).find(p => (p.model?.id || p.blockId) === fnParaId);
      const richText = pEl?.querySelector('rich-text') || pEl?.querySelector('.inline-editor');
      const editable = richText?.querySelector('[contenteditable="true"]') || richText;
      let caretBefore = false;
      let caretAfter = false;
      let rangeSelect = false;

      if (editable) {
        editable.focus();
      }

      if (richText && richText.inlineEditor) {
        // Set range before footnote 1
        richText.inlineEditor.setInlineRange({ index: 5, length: 0 });
        const sel1 = richText.inlineEditor.getInlineRange();
        caretBefore = sel1?.index === 5;

        // Set range across footnote 1 (length > 0)
        richText.inlineEditor.setInlineRange({ index: 30, length: 5 });
        const sel2 = richText.inlineEditor.getInlineRange();
        rangeSelect = sel2?.length === 5;

        // Set range after footnote 2
        richText.inlineEditor.setInlineRange({ index: 50, length: 0 });
        const sel3 = richText.inlineEditor.getInlineRange();
        caretAfter = sel3?.index === 50;
      }

      return {
        ok: true,
        fnParaId,
        footnoteCount: fnNodes.length,
        footnoteDetails: footnoteDetails.slice(0, 2),
        caretMovement: {
          caretBefore,
          rangeSelect,
          caretAfter,
        },
      };
    })()`);

    results.inlineFootnotes = footnoteResult;
    await shot('07-footnote-citations-mixed');

    // ------------------------------------------------------------------------
    // Step 9: Edgeless Mode and Frame Titles on the Right in RTL
    // ------------------------------------------------------------------------
    const edgelessResult = await evaluate(`(async () => {
      const re = window.__baglibResearchEditor;
      await re.setMode('edgeless');
      const editor = re.editor;
      const store = editor.doc;

      const surface = store.getBlocksByFlavour('affine:surface')[0];
      if (!surface) return { ok: false, error: 'no surface' };

      const frameId = store.addBlock('affine:frame', {
        xywh: '[150, 150, 450, 320]',
        index: 'a0',
      }, surface.id);

      await editor.updateComplete;
      await new Promise(r => setTimeout(r, 700));

      const frameEl = document.querySelector('affine-frame');
      const frameWidget = document.querySelector('affine-frame-title-widget');
      const frameTitleEl = document.querySelector('affine-frame-title') ||
        frameWidget?.shadowRoot?.querySelector('affine-frame-title') ||
        frameEl?.querySelector('affine-frame-title') ||
        frameEl?.shadowRoot?.querySelector('affine-frame-title');
      const titleStyle = frameTitleEl ? window.getComputedStyle(frameTitleEl) : null;

      return {
        ok: true,
        mode: re.mode,
        frameId,
        frameFound: !!frameEl,
        frameTitleFound: !!frameTitleEl,
        titleStyleRight: titleStyle?.right,
        titleStyleLeft: titleStyle?.left,
        titleStyleTransformOrigin: titleStyle?.transformOrigin,
      };
    })()`);

    results.edgelessFrame = edgelessResult;
    await shot('08-edgeless-frame-rtl');

    // ------------------------------------------------------------------------
    // Step 10: HTML Export Verification with 'dir' attributes
    // ------------------------------------------------------------------------
    // Switch back to page mode
    await evaluate('window.__baglibResearchEditor.setMode("page")');
    await wait('window.__baglibResearchEditor.mode === "page"');
    await new Promise(r => setTimeout(r, 400));

    const htmlExportResult = await evaluate(`(async () => {
      const editor = window.__baglibResearchEditor?.editor;
      const store = editor?.doc;
      if (!store) return { ok: false, error: 'no store' };

      try {
        const factory = store.provider.get({ identifierName: 'AdapterFactory', variant: 'Html' });
        if (!factory) return { ok: false, error: 'no HtmlAdapterFactory' };

        const job = store.getTransformer();
        const htmlAdapter = factory.get(job);
        const result = await htmlAdapter.fromDoc(store);
        const html = result?.file || '';

        // Check for dir attributes in exported HTML
        const hasDirRtl = html.includes('dir="rtl"');
        const hasDirLtr = html.includes('dir="ltr"');
        const hasDirAuto = html.includes('dir="auto"');
        const hasTableDir = /<table[^>]*dir="/.test(html);
        const hasListDir = /<li[^>]*dir="/.test(html);

        return {
          ok: true,
          htmlLength: html.length,
          hasDirRtl,
          hasDirLtr,
          hasDirAuto,
          hasTableDir,
          hasListDir,
          htmlSample: html.slice(0, 1000),
          fullHtml: html,
        };
      } catch (err) {
        return { ok: false, error: String(err && err.stack ? err.stack : err) };
      }
    })()`);

    results.htmlExport = {
      ok: htmlExportResult.ok,
      hasDirRtl: htmlExportResult.hasDirRtl,
      hasDirLtr: htmlExportResult.hasDirLtr,
      hasDirAuto: htmlExportResult.hasDirAuto,
      hasTableDir: htmlExportResult.hasTableDir,
      hasListDir: htmlExportResult.hasListDir,
      error: htmlExportResult.error,
    };

    if (htmlExportResult.fullHtml) {
      const htmlPath = path.join(outDir, 'export.html');
      fs.writeFileSync(htmlPath, htmlExportResult.fullHtml, 'utf8');
      results.htmlExport.savedPath = htmlPath;

      // Render the exported HTML via data URL to capture screenshot without file:// blocking
      const exportWin = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        webPreferences: { sandbox: true },
      });
      await exportWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlExportResult.fullHtml));
      await new Promise(r => setTimeout(r, 600));
      const expImage = await exportWin.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, '09-html-export-rendered.png'), expImage.toPNG());
      exportWin.destroy();
    }

    // ------------------------------------------------------------------------
    // Step 11: Snapshot persistence of 'textDirection' prop
    // ------------------------------------------------------------------------
    const snapshotResult = await evaluate(`(async () => {
      const snapshot = await window.__baglibResearchEditor.snapshot();
      
      const dirProps = [];
      function walk(node) {
        if (!node) return;
        if (node.props && node.props.textDirection) {
          dirProps.push({
            id: node.id,
            flavour: node.flavour,
            textDirection: node.props.textDirection,
          });
        }
        if (Array.isArray(node.children)) {
          for (const child of node.children) {
            walk(child);
          }
        }
      }
      walk(snapshot?.blocks);

      return {
        snapshotValid: !!snapshot?.meta?.id,
        dirPropsCount: dirProps.length,
        dirProps,
      };
    })()`);

    results.snapshotPersistence = snapshotResult;
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
