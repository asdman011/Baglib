// KEY-450 live verification script in Electron (ar & en, real files, YouTube + web link embeds).
const { app, shell, session, net } = require('electron');
const externalCalls = [];
shell.openExternal = async url => {
  externalCalls.push(url);
};
process.on('uncaughtException', error => {
  console.error(error);
  app.exit(1);
});
process.on('unhandledRejection', error => {
  console.error(error);
  app.exit(1);
});

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY450_PROFILE;
const evidence = process.env.BAGLIB_KEY450_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => {
  console.error('KEY-450 hard timeout');
  app.exit(1);
}, 200_000).unref();

// Build a valid 64x36 RGB PNG buffer so Chromium decodes it with naturalWidth=64, naturalHeight=36.
function makeSolidPng(width, height, r, g, b) {
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([len, typeAndData, crc]);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const THUMB_PNG_AR = makeSolidPng(64, 36, 32, 118, 92);
const THUMB_PNG_EN = makeSolidPng(64, 36, 44, 88, 156);
const YT_THUMB_PNG = makeSolidPng(64, 36, 210, 38, 38);
const ICON_PNG = makeSolidPng(16, 16, 180, 140, 40);

const YT_VIDEO_ID = 'dQw4w9WgXcQ';
const YT_WATCH_URL = `https://www.youtube.com/watch?v=${YT_VIDEO_ID}`;
const YT_EMBED_URL = `https://www.youtube.com/embed/${YT_VIDEO_ID}`;
const YT_THUMB_URL = `https://i.ytimg.com/vi/${YT_VIDEO_ID}/hqdefault.jpg`;

const youtubeEmbedReferers = [];

// Intercept main-process globalThis.fetch for deterministic fixture responses (and offline simulation).
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith('https://offline.example.org/')) {
    throw new Error('getaddrinfo ENOTFOUND offline.example.org');
  }
  if (url.startsWith('https://www.youtube.com/oembed') || url.startsWith('https://youtube.com/oembed')) {
    return new Response(
      JSON.stringify({
        title: 'محاضرة تحقيق المخطوطات — BagLib Paleography Lecture',
        author_name: 'BagLib Research Channel',
        author_url: 'https://www.youtube.com/@baglib',
        thumbnail_url: YT_THUMB_URL,
      }),
      { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }
    );
  }
  if (url === YT_WATCH_URL) {
    return new Response(
      `<!doctype html><html><head>
        <meta property="og:title" content="محاضرة تحقيق المخطوطات — BagLib Paleography Lecture" />
        <meta property="og:description" content="شرح منهج المقابلة وضبط الحواشي في بيئة BagLib" />
        <meta property="og:image" content="${YT_THUMB_URL}" />
      </head><body></body></html>`,
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  }
  if (url === 'https://scholarly.example.org/ar/manuscript-review') {
    return new Response(
      `<!doctype html><html lang="ar" dir="rtl"><head>
        <meta property="og:title" content="فهرس المخطوطات العربية المحققة" />
        <meta property="og:description" content="دليل رقمي لمقابلة النسخ الخطية وفحص الإسناد" />
        <meta property="og:image" content="https://scholarly.example.org/assets/thumb-ar.png" />
        <link rel="icon" href="https://scholarly.example.org/assets/icon.png" />
      </head><body></body></html>`,
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  }
  if (url === 'https://scholarly.example.org/en/manuscript-review') {
    return new Response(
      `<!doctype html><html lang="en" dir="ltr"><head>
        <meta property="og:title" content="Critical Edition &amp; Manuscript Catalog" />
        <meta property="og:description" content="Comparative apparatus and witness collation guide for BagLib" />
        <meta property="og:image" content="https://scholarly.example.org/assets/thumb-en.png" />
        <link rel="icon" href="https://scholarly.example.org/assets/icon.png" />
      </head><body></body></html>`,
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  }
  return originalFetch(input, init);
};

let running = false;
const consoleErrors = [];
const cspViolations = [];

app.whenReady().then(() => {
  // Serve HTTPS fixture thumbnails and the YouTube embed iframe after Chromium's CSP + ContentShieldService run.
  session.defaultSession.protocol.handle('https', request => {
    const url = request.url;
    if (url === YT_THUMB_URL) {
      return new Response(YT_THUMB_PNG, {
        status: 200,
        headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
      });
    }
    if (url === 'https://scholarly.example.org/assets/thumb-ar.png') {
      return new Response(THUMB_PNG_AR, {
        status: 200,
        headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
      });
    }
    if (url === 'https://scholarly.example.org/assets/thumb-en.png') {
      return new Response(THUMB_PNG_EN, {
        status: 200,
        headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
      });
    }
    if (url === 'https://scholarly.example.org/assets/icon.png') {
      return new Response(ICON_PNG, {
        status: 200,
        headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
      });
    }
    if (url.startsWith(YT_EMBED_URL)) {
      youtubeEmbedReferers.push(request.headers.get('referer') || '');
      return new Response(
        `<!doctype html><html><head><meta charset="utf-8"><title>YouTube Embed Player</title></head>
         <body style="margin:0;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
           <div id="player-ready" data-video-id="${YT_VIDEO_ID}">▶ YouTube Player (${YT_VIDEO_ID})</div>
         </body></html>`,
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
      );
    }
    return net.fetch(request, { bypassCustomProtocolHandlers: true });
  });
});

app.on('browser-window-created', (_, win) => {
  win.webContents.on('console-message', (_e, level, message) => {
    if (/Content Security Policy|violates the following Content Security Policy/i.test(message)) {
      cspViolations.push(message);
    }
    if (level >= 3) {
      consoleErrors.push(message);
    }
  });
  win.webContents.on('did-finish-load', () => {
    if (running || win.webContents.getURL().startsWith('devtools:')) return;
    running = true;
    run(win).catch(async error => {
      console.error(error);
      fs.writeFileSync(
        path.join(evidence, 'failure.txt'),
        (error.stack || String(error)) +
          '\nconsoleErrors=' +
          JSON.stringify(consoleErrors) +
          '\ncspViolations=' +
          JSON.stringify(cspViolations)
      );
      try {
        fs.writeFileSync(path.join(evidence, 'failure.png'), (await win.webContents.capturePage()).toPNG());
      } catch {}
      app.exit(1);
    });
  });
});

async function run(win) {
  win.setSize(1440, 960);
  const bounded = (promise, label) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Evaluation timeout: ' + label)), 12000);
      promise.then(
        value => {
          clearTimeout(timer);
          resolve(value);
        },
        error => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  const evaluate = code => bounded(win.webContents.executeJavaScript(code, true), code);
  const frame = () => win.webContents.mainFrame.frames.find(f => f.url.includes('/research-editor/'));
  const edit = code => {
    const f = frame();
    assert.ok(f, 'editor iframe');
    return bounded(f.executeJavaScript(code, true), code);
  };
  async function until(code, child = false, tries = 200) {
    for (let i = 0; i < tries; i++) {
      try {
        if (await (child ? edit(code) : evaluate(code))) return;
      } catch {}
      await pause(120);
    }
    throw new Error('Timed out: ' + code);
  }
  const shot = async name => {
    await pause(350);
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };

  await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=notes]")');
  await evaluate(`(async () => {
    await window.electronAPI.settings.set("onboarding.v1", { seen: true });
    await window.electronAPI.settings.set("workspace.tabs.v1", null);
    await window.electronAPI.settings.set("workspace.closed.v1", null);
  })()`);
  await evaluate('location.reload()');
  await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=notes]")');

  // Import real ar and en PDFs from tests/real-files/manifest.json
  const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
  const arPdf = manifest.files.find(f => f.kind === 'pdf' && f.lang === 'ar' && f.textLayer === 'yes');
  const enPdf = manifest.files.find(f => f.kind === 'pdf' && f.lang === 'en' && f.textLayer === 'yes');
  assert.ok(arPdf && enPdf, 'real ar and en PDFs found in manifest');
  await evaluate(
    `window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(path.resolve('tests/real-files', arPdf.path))} })`
  );
  await evaluate(
    `window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(path.resolve('tests/real-files', enPdf.path))} })`
  );
  const books = await evaluate('window.electronAPI.getAllBooks()');
  const arBook = books.find(b => b.filePath === path.resolve('tests/real-files', arPdf.path));
  const enBook = books.find(b => b.filePath === path.resolve('tests/real-files', enPdf.path));
  assert.ok(arBook && enBook, 'real ar and en PDFs imported');

  // Verify IPC allow-list rejects disallowed schemes/hosts from renderer
  for (const disallowed of ['file:///C:/Windows/win.ini', 'javascript:alert(1)', 'http://127.0.0.1:9999/secret']) {
    const res = await evaluate(`window.electronAPI.researchEditor.linkPreview(${JSON.stringify(disallowed)})`);
    assert.equal(res.title, null);
    assert.equal(res.image, null);
  }

  const results = [];
  for (const lang of ['ar', 'en']) {
    await evaluate(`window.electronAPI.settings.set('workspace.tabs.v1', null)`);
    await evaluate(`localStorage.setItem('baglib-lang', ${JSON.stringify(lang)})`);
    await evaluate('location.reload()');
    await until('!!document.querySelector("[data-nav-item=notes-editor]")');

    const ms = await evaluate(`window.electronAPI.manuscripts.create('KEY-450 Manuscript ${lang}', 'research')`);
    const chapter = await evaluate(
      `window.electronAPI.manuscripts.createDocument(${JSON.stringify(ms.id)}, 'KEY-450 ${lang}')`
    );
    await evaluate('document.querySelector("[data-nav-item=notes-editor]").click()');
    await until('window.__baglibResearchEditor?.ready', true);
    await until(
      `!![...document.querySelectorAll('.research-sidebar-manuscript-row')].find(el => el.textContent.includes('KEY-450 Manuscript ${lang}'))`
    );
    await evaluate(
      `[...document.querySelectorAll('.research-sidebar-manuscript-row')].find(el => el.textContent.includes('KEY-450 Manuscript ${lang}')).click()`
    );
    await until(
      `!![...document.querySelectorAll('.research-sidebar-tree-row')].find(el => el.textContent.includes('KEY-450 ${lang}'))`
    );
    await evaluate(
      `[...document.querySelectorAll('.research-sidebar-tree-row')].find(el => el.textContent.includes('KEY-450 ${lang}')).click()`
    );
    await until(`window.__baglibResearchEditor.editor.doc.id === ${JSON.stringify(chapter.id)}`, true);

    // Stay in Page mode so both embed blocks and their thumbnails/iframe render in the document flow.
    await evaluate(`document.querySelectorAll('.research-mode-btn')[0].click()`);
    await until(`window.__baglibResearchEditor.mode === 'page'`, true);

    const webUrl = `https://scholarly.example.org/${lang}/manuscript-review`;
    const offlineUrl = `https://offline.example.org/${lang}/offline-study`;
    const bookId = lang === 'ar' ? arBook.id : enBook.id;

    // Insert:
    // 1. YouTube link in Embed view (affine:embed-youtube)
    // 2. Normal web link in Embed view (affine:embed-iframe)
    // 3. Normal web link in Card view (affine:bookmark)
    // 4. Offline link in Embed view (affine:embed-iframe) to verify graceful offline fallback
    // 5. Real PDF source quote block (baglib:book-quote)
    await edit(`(() => {
      const e = window.__baglibResearchEditor.editor;
      const d = e.doc;
      const n = d.getModelsByFlavour('affine:note')[0];

      window.__k450Deep = function deep(root, selector) {
        const out = [...root.querySelectorAll(selector)];
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) out.push(...deep(el.shadowRoot, selector));
        }
        return out;
      };

      d.addBlock(
        'affine:embed-youtube',
        {
          url: ${JSON.stringify(YT_WATCH_URL)},
          style: 'video',
        },
        n.id
      );

      d.addBlock(
        'affine:embed-iframe',
        {
          url: ${JSON.stringify(webUrl)},
        },
        n.id
      );

      d.addBlock(
        'affine:bookmark',
        {
          url: ${JSON.stringify(webUrl)},
          style: 'horizontal',
        },
        n.id
      );

      d.addBlock(
        'affine:embed-iframe',
        {
          url: ${JSON.stringify(offlineUrl)},
        },
        n.id
      );

      d.addBlock(
        'baglib:book-quote',
        {
          url: 'book:' + ${JSON.stringify(bookId)} + '#p=1',
          label: ${JSON.stringify(lang === 'ar' ? arBook.title : enBook.title)},
          text: ${JSON.stringify(lang === 'ar' ? 'شاهد من ملف PDF حقيقي' : 'Excerpt from real PDF file')},
          grade: '',
          verses: [],
        },
        n.id
      );

      d.captureSync();
    })()`);

    // Wait until:
    // 1. YouTube iframe (#ytplayer) is present with expected src and its child frame document loaded
    // 2. YouTube thumbnail <img> has complete && naturalWidth > 0
    // 3. Normal web link in embed view (.affine-embed-iframe-preview-image) has complete && naturalWidth > 0
    // 4. Bookmark card banner <img> has complete && naturalWidth > 0
    await until(
      `(() => {
        const ytIframe = window.__k450Deep(document, 'affine-embed-youtube-block iframe#ytplayer')[0];
        const ytThumb = window.__k450Deep(document, 'affine-embed-youtube-block img.affine-embed-youtube-thumbnail')[0];
        const webEmbedImg = window.__k450Deep(document, 'affine-embed-iframe-block img.affine-embed-iframe-preview-image')[0];
        const webEmbedIcon = window.__k450Deep(document, 'affine-embed-iframe-block img.affine-embed-iframe-preview-icon')[0];
        const bookmarkImg = window.__k450Deep(document, 'bookmark-card .affine-bookmark-banner img')[0];
        return (
          ytIframe &&
          ytIframe.getAttribute('src') === ${JSON.stringify(YT_EMBED_URL)} &&
          ytThumb &&
          ytThumb.complete &&
          ytThumb.naturalWidth > 0 &&
          webEmbedImg &&
          webEmbedImg.complete &&
          webEmbedImg.naturalWidth > 0 &&
          webEmbedIcon &&
          webEmbedIcon.complete &&
          webEmbedIcon.naturalWidth > 0 &&
          bookmarkImg &&
          bookmarkImg.complete &&
          bookmarkImg.naturalWidth > 0
        );
      })()`,
      true,
      200
    );

    // Wait for the YouTube child frame inside the research-editor iframe to finish loading #player-ready
    let ytLoadedVideoId = null;
    for (let i = 0; i < 100; i++) {
      const ytChildFrame = frame()?.frames?.find(f => f.url.startsWith(YT_EMBED_URL));
      if (ytChildFrame) {
        try {
          ytLoadedVideoId = await bounded(
            ytChildFrame.executeJavaScript('document.getElementById("player-ready")?.dataset?.videoId || null', true),
            'ytChildFrame'
          );
          if (ytLoadedVideoId === YT_VIDEO_ID) break;
        } catch {}
      }
      await pause(100);
    }
    assert.equal(ytLoadedVideoId, YT_VIDEO_ID, 'YouTube embed iframe document loaded and rendered player');

    const state = await edit(`(() => {
      const ytBlock = window.__k450Deep(document, 'affine-embed-youtube-block')[0];
      const ytIframe = window.__k450Deep(document, 'affine-embed-youtube-block iframe#ytplayer')[0];
      const ytThumb = window.__k450Deep(document, 'affine-embed-youtube-block img.affine-embed-youtube-thumbnail')[0];
      const ytTitle = window.__k450Deep(document, '.affine-embed-youtube-content-title-text')[0]?.textContent?.trim();

      const embedBlocks = window.__k450Deep(document, 'affine-embed-iframe-block');
      const webEmbedImg = window.__k450Deep(document, 'affine-embed-iframe-block img.affine-embed-iframe-preview-image')[0];
      const webEmbedIcon = window.__k450Deep(document, 'affine-embed-iframe-block img.affine-embed-iframe-preview-icon')[0];
      const titles = window.__k450Deep(document, '.affine-embed-iframe-preview-title').map(el => el.textContent?.trim());
      const hosts = window.__k450Deep(document, '.affine-embed-iframe-preview-host').map(el => el.textContent?.trim());
      const errorCards = window.__k450Deep(document, 'embed-iframe-error-card');

      const bookmarkImg = window.__k450Deep(document, 'bookmark-card .affine-bookmark-banner img')[0];

      return {
        dir: document.documentElement.dir,
        lang: document.documentElement.lang,
        ytIframeSrc: ytIframe?.getAttribute('src'),
        ytIframeSandbox: ytIframe?.getAttribute('sandbox'),
        ytIframeReferrerPolicy: ytIframe?.getAttribute('referrerpolicy'),
        ytIframeHasCredentialless: ytIframe?.hasAttribute('credentialless'),
        ytThumbNaturalWidth: ytThumb?.naturalWidth ?? 0,
        ytTitle,
        webEmbedImgNaturalWidth: webEmbedImg?.naturalWidth ?? 0,
        webEmbedIconNaturalWidth: webEmbedIcon?.naturalWidth ?? 0,
        bookmarkImgNaturalWidth: bookmarkImg?.naturalWidth ?? 0,
        embedBlockCount: embedBlocks.length,
        titles,
        hosts,
        errorCardCount: errorCards.length,
      };
    })()`);

    assert.equal(state.ytIframeSrc, YT_EMBED_URL, 'YouTube iframe src matches expected embed URL');
    assert.equal(state.ytIframeHasCredentialless, false, 'YouTube iframe does not set credentialless');
    assert.equal(state.ytIframeReferrerPolicy, 'strict-origin-when-cross-origin');
    assert.ok(state.ytIframeSandbox.includes('allow-scripts'), 'YouTube iframe remains sandboxed');
    assert.ok(state.ytIframeSandbox.includes('allow-same-origin'), 'YouTube iframe sandbox allows same-origin');
    assert.ok(state.ytThumbNaturalWidth > 0, 'YouTube thumbnail <img> loaded with naturalWidth > 0');
    assert.ok(state.ytTitle.includes('BagLib Paleography Lecture'), 'YouTube title loaded via main linkPreview');
    assert.ok(state.webEmbedImgNaturalWidth > 0, 'Normal web link embed thumbnail <img> loaded with naturalWidth > 0');
    assert.ok(state.webEmbedIconNaturalWidth > 0, 'Normal web link embed favicon <img> loaded with naturalWidth > 0');
    assert.ok(state.bookmarkImgNaturalWidth > 0, 'Bookmark card thumbnail <img> loaded with naturalWidth > 0');
    assert.equal(state.errorCardCount, 0, 'Offline link embed falls back gracefully to plain card with 0 error cards');
    assert.ok(state.hosts.includes('offline.example.org'), 'Offline fallback card displays hostname');
    assert.ok(
      youtubeEmbedReferers.length > 0,
      'YouTube embed iframe request was served over https://www.youtube.com/embed/'
    );

    // Verify snapshot export succeeds with affine:embed-iframe and affine:embed-youtube blocks
    const snapshotOk = await edit(`(async () => {
      const snap = await window.__baglibResearchEditor.snapshot();
      return !!snap;
    })()`);
    assert.equal(snapshotOk, true, 'Manuscript snapshot exports cleanly with embed blocks');

    // Verify clicking the web embed preview card opens external link via shell.openExternal (KEY-433)
    const beforeExternal = externalCalls.length;
    await edit(`window.__k450Deep(document, '.affine-embed-iframe-preview-card')[0].click()`);
    await pause(250);
    assert.deepEqual(
      externalCalls.slice(beforeExternal),
      [webUrl],
      `Clicking embed preview card opens ${webUrl} in system browser`
    );

    await shot(`embeds-${lang}`);
    results.push({ lang, ...state });
  }

  assert.equal(cspViolations.length, 0, 'Zero CSP violations: ' + JSON.stringify(cspViolations));
  assert.equal(consoleErrors.length, 0, 'Zero console errors: ' + JSON.stringify(consoleErrors));

  fs.writeFileSync(
    path.join(evidence, 'result.json'),
    JSON.stringify({ results, externalCalls, youtubeEmbedReferers, cspViolations, consoleErrors }, null, 2)
  );
  console.log('KEY-450 LIVE PASS', JSON.stringify(results));
  app.exit(0);
}

require(path.resolve('dist/main/index.js'));
