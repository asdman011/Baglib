// KEY-407 live check: card frames follow the app theme (no white strip), and built-in note type
// and field names are localised. Runs in one language and one theme per launch.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_POLISH_PROFILE;
const evidence = process.env.BAGLIB_POLISH_EVIDENCE;
const language = process.env.BAGLIB_POLISH_LANG || 'ar';
const theme = process.env.BAGLIB_POLISH_THEME || 'dark';
const tag = `${language}-${theme}`;

app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));

const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
let started = false;

app.on('browser-window-created', (_, owner) => {
  if (started) return;
  started = true;

  const errors = [];
  owner.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) errors.push(message.slice(0, 400));
  });
  owner.webContents.on('did-finish-load', () => {
    owner.webContents
      .executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})")
      .catch(() => {});
  });

  const evaluate = code =>
    owner.webContents.executeJavaScript(code, true).catch(error => {
      throw new Error(`${error.message}: ${code.slice(0, 240)}`);
    });
  const until = async (code, tries = 150) => {
    for (let index = 0; index < tries; index++) {
      try {
        if (await evaluate(`(async()=>(${code}))()`)) return;
      } catch {
        /* retry */
      }
      await pause(200);
    }
    throw new Error(`Timed out: ${code}`);
  };
  const shot = async name => {
    await pause(500);
    owner.webContents.invalidate();
    await pause(300);
    fs.writeFileSync(path.join(evidence, `${name}-${tag}.png`), (await owner.webContents.capturePage()).toPNG());
  };

  // Share of near-white pixels inside the visible card frame. In dark mode the old CSS painted a
  // white strip; a theme-aware frame has almost none.
  const frameWhiteShare = async selector => {
    // Wait until the sandboxed frame has loaded and reported its height (the renderer sets
    // style.height only from the frame's own resize message), then let it paint.
    await until(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});return !!f && !!f.style.height;})()`);
    await pause(1200);
    owner.webContents.invalidate();
    await pause(400);
    const rect = await evaluate(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});if(!f)return null;
      f.scrollIntoView({block:'center'});const r=f.getBoundingClientRect();
      return {x:Math.round(r.left),y:Math.round(r.top),width:Math.round(r.width),height:Math.round(Math.min(r.height,400))};})()`);
    assert.ok(rect && rect.width > 20 && rect.height > 20, `card frame ${selector} is visible`);
    await pause(600);
    const image = await owner.webContents.capturePage(rect);
    const bitmap = image.toBitmap();
    let white = 0;
    const total = bitmap.length / 4;
    for (let i = 0; i < bitmap.length; i += 4) {
      if (bitmap[i] > 235 && bitmap[i + 1] > 235 && bitmap[i + 2] > 235) white += 1;
    }
    return white / total;
  };

  // The app starts its own load of the renderer; a racing loadURL can be aborted (ERR_FAILED), so retry.
  const loadApp = async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.loadURL('http://localhost:3000');
        return;
      } catch (error) {
        if (attempt >= 4) throw error;
        await pause(1000);
      }
    }
  };

  (async () => {
    const results = { language, theme };
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) {
      await pause(200);
    }
    await loadApp();
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','${theme}')`);
    await loadApp();
    await until('!!window.electronAPI?.cardNotes && !!document.querySelector("footer")');
    await pause(800);
    results.appIsDark = await evaluate(`document.documentElement.classList.contains('dark')`);
    assert.equal(results.appIsDark, theme === 'dark', 'app theme applied');

    // A deck with one Basic card, created through IPC; everything after this goes through the UI.
    const deckName = language === 'ar' ? `مراجعة ${theme}` : `Review ${theme}`;
    const deck = await evaluate(`window.electronAPI.knowledgeCards.createDeck({ name: ${JSON.stringify(deckName)} })`);
    const front = language === 'ar' ? 'ما أعظم آية في كتاب الله؟' : 'Which is the greatest ayah?';
    const back = language === 'ar' ? 'آية الكرسي' : 'Ayat al-Kursi';
    await evaluate(
      `window.electronAPI.cardNotes.saveNote({ noteTypeId: 'stock-basic', fields: { Front: ${JSON.stringify(front)}, Back: ${JSON.stringify(back)} }, deckId: ${JSON.stringify(deck.id)} })`
    );

    // Knowledge Cards area.
    await evaluate(`document.querySelector('[data-nav-item="notes"]')?.click()`);
    await until(`!!document.querySelector('button[data-notes-tab="cards"]')`);
    await evaluate(`document.querySelector('button[data-notes-tab="cards"]').click()`);
    await until(`!!document.querySelector('[data-saved-cards]') && !!document.querySelector('[data-deck-manager]')`);

    // 1. Deck name placeholder is localised.
    results.deckPlaceholder = await evaluate(
      `document.querySelector('[data-deck-manager] input[placeholder*="::"]')?.getAttribute('placeholder') ?? null`
    );
    assert.equal(results.deckPlaceholder, language === 'ar' ? 'الأصل::الفرع' : 'Parent::Child');

    // 2. Note types manager shows localised built-in names.
    await evaluate(`document.querySelector('button[data-note-types-btn]').click()`);
    await until(`!!document.querySelector('[data-close-note-types-modal]')`);
    const managerText = await evaluate(`document.querySelector('[data-close-note-types-modal]').closest('[role="dialog"],div.fixed')?.innerText ?? document.body.innerText`);
    results.managerShowsLocalised =
      language === 'ar'
        ? managerText.includes('أساسية') && managerText.includes('القرآن الكريم') && !/\nBasic\n/u.test(managerText)
        : managerText.includes('Basic') && managerText.includes('Quran');
    assert.ok(results.managerShowsLocalised, 'note types manager shows localised built-in names');
    await shot('01-note-types');
    await evaluate(`document.querySelector('button[data-close-note-types-modal]').click()`);
    await until(`!document.querySelector('[data-close-note-types-modal]')`);

    // 3. Note editor: localised type and field labels, and a theme-aware preview frame.
    await evaluate(`document.querySelector('button[data-new-note-btn]').click()`);
    await until(`!!document.querySelector('[data-save-note-btn]') && !!document.querySelector('textarea[data-field-name="Front"]')`);
    await evaluate(`(()=>{
      const set=(el,v)=>{const s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
      set(document.querySelector('textarea[data-field-name="Front"]'), ${JSON.stringify(front)});
      set(document.querySelector('textarea[data-field-name="Back"]'), ${JSON.stringify(back)});
    })()`);
    await until(`!!document.querySelector('iframe[data-card-frame]')`);
    results.editorTypeOption = await evaluate(
      `document.querySelector('[data-note-type-select]').selectedOptions[0]?.textContent?.trim() ?? ''`
    );
    results.editorFieldLabel = await evaluate(
      `document.querySelector('textarea[data-field-name="Front"]').closest('.space-y-1\\\\.5')?.querySelector('label span')?.textContent ?? ''`
    );
    if (language === 'ar') {
      assert.ok(results.editorTypeOption.startsWith('أساسية'), `type option localised: ${results.editorTypeOption}`);
      assert.equal(results.editorFieldLabel, 'الوجه الأمامي');
    } else {
      assert.ok(results.editorTypeOption.startsWith('Basic'));
      assert.equal(results.editorFieldLabel, 'Front');
    }
    results.editorFrameTheme = await evaluate(`document.querySelector('iframe[data-card-frame]').getAttribute('data-card-theme')`);
    assert.equal(results.editorFrameTheme, theme);
    results.editorFrameWhiteShare = await frameWhiteShare('iframe[data-card-frame]');
    if (theme === 'dark') assert.ok(results.editorFrameWhiteShare < 0.05, `no white strip in editor preview (${results.editorFrameWhiteShare})`);
    await shot('02-note-editor');
    await evaluate(`document.querySelector('button[data-close-note-editor]').click()`);
    await until(`!document.querySelector('[data-save-note-btn]')`);

    // 4. Review screen of the deck: theme-aware card frame.
    await until(`!!document.querySelector('[data-deck-study=${JSON.stringify(deck.id)}]')`);
    await evaluate(`document.querySelector('[data-deck-study=${JSON.stringify(deck.id)}]').click()`);
    await until(`!!document.querySelector('[data-srs-review-screen]') && !!document.querySelector('[data-srs-review-screen] iframe[data-card-frame]')`);
    results.reviewFrameTheme = await evaluate(
      `document.querySelector('[data-srs-review-screen] iframe[data-card-frame]').getAttribute('data-card-theme')`
    );
    assert.equal(results.reviewFrameTheme, theme);
    results.reviewFrameWhiteShare = await frameWhiteShare('[data-srs-review-screen] iframe[data-card-frame]');
    if (theme === 'dark') assert.ok(results.reviewFrameWhiteShare < 0.05, `no white strip on review card (${results.reviewFrameWhiteShare})`);
    await shot('03-review-card');

    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon/u.test(line));
    fs.writeFileSync(path.join(evidence, `results-${tag}.json`), JSON.stringify(results, null, 2));
    console.log(`[live-${tag}] passed`, JSON.stringify(results));
    app.exit(0);
  })().catch(error => {
    console.error(`[live-${tag}] FAILED`, error);
    try {
      fs.writeFileSync(path.join(evidence, `error-${tag}.txt`), String(error && error.stack ? error.stack : error));
    } catch {
      /* ignore */
    }
    owner.webContents.capturePage().then(img => {
      fs.writeFileSync(path.join(evidence, `error-${tag}.png`), img.toPNG());
      app.exit(1);
    }, () => app.exit(1));
  });
});

require('../../dist/main/index.js');
