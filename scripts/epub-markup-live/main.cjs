const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_MARKUP_LIVE_DIR || process.env.BAGLIB_DATA_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));

const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
const labels = {
  ar: { library: 'المكتبة', read: 'قراءة', knowledge: 'الملاحظات والمعرفة' },
  en: { library: 'Library', read: 'Read', knowledge: 'Notes & Knowledge' },
};

let started = false;

app.on('browser-window-created', (_, owner) => {
  if (started) return;
  started = true;

  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) consoleLines.push(message.slice(0, 400));
  });

  const evaluate = code =>
    owner.webContents.executeJavaScript(code, true).catch(error => {
      throw new Error(`${error.message}: ${code.slice(0, 200)}`);
    });

  owner.webContents.on('did-finish-load', () => { evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });

  const until = async (code, tries = 200) => {
    for (let index = 0; index < tries; index++) {
      try {
        if (await evaluate(code)) return;
      } catch {}
      await pause(250);
    }
    throw new Error(`Timed out: ${code}`);
  };

  const shot = async name => {
    await pause(500);
    owner.webContents.invalidate();
    await pause(300);
    const png = await owner.webContents.capturePage();
    fs.writeFileSync(path.join(directory, `${name}.png`), png.toPNG());
  };

  const key = (value, extra = '') =>
    evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(value)},bubbles:true${extra}}))`);

  const chooseTool = async tool => {
    if (!await evaluate(`!!document.querySelector('[data-markup-tool-button="${tool}"]')`)) {
      await evaluate("document.querySelector('[data-markup-palette]').click()");
      await until(`!!document.querySelector('[data-markup-tool-button="${tool}"]')`);
    }
    await evaluate(`document.querySelector('[data-markup-tool-button="${tool}"]').click()`);
  };

  const load = async (language, width = 1280, height = 900) => {
    owner.setContentSize(width, height);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) {
      await pause(200);
    }
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`);
    await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await key('Escape');
    await pause(1000);
  };

  (async () => {
    const results = {};
    const arabicEpub = path.join(directory, 'arabic-test.epub');
    const englishEpub = path.join(directory, 'english-test.epub');
    const textbookEpub = path.join(directory, 'english-textbook.epub');

    await load('ar');
    await until('!!window.electronAPI?.addBook');

    // Register test EPUB books in database
    await evaluate(`window.electronAPI.addBook({
      id: 'epub-ar-work',
      title: 'العلم والعمل',
      author: 'أبو حامد الغزالي',
      workType: 'book',
      bookType: 'digital',
      digitalFormat: 'EPUB',
      filePath: ${JSON.stringify(arabicEpub)}
    })`);

    await evaluate(`window.electronAPI.addBook({
      id: 'epub-en-work',
      title: 'Why Would Feminists Trust the Police',
      author: 'Leah Cowan',
      workType: 'book',
      bookType: 'digital',
      digitalFormat: 'EPUB',
      filePath: ${JSON.stringify(englishEpub)}
    })`);

    await evaluate(`window.electronAPI.addBook({
      id: 'epub-en-textbook',
      title: 'Fundamentals of Cost Accounting',
      author: 'Lanen & Anderson',
      workType: 'book',
      bookType: 'digital',
      digitalFormat: 'EPUB',
      filePath: ${JSON.stringify(textbookEpub)}
    })`);

    // ==========================================
    // 1. ARABIC EPUB TESTS (RTL)
    // ==========================================
    for (const language of ['ar', 'en']) {
      const isArabic = language === 'ar';
      const targetWorkId = isArabic ? 'epub-ar-work' : 'epub-en-work';
      const targetTitle = isArabic ? 'العلم والعمل' : 'Feminists';

      await load(language, 1280, 900);

      // Navigate to library and open the book
      await evaluate(`document.querySelector('[data-nav-item][aria-label=${JSON.stringify(labels[language].library)}]')?.click()`);
      await until(`[...document.querySelectorAll('button')].some(b=>b.title===${JSON.stringify(labels[language].read)}||b.textContent.trim()===${JSON.stringify(labels[language].read)})`);

      // Open book reader
      await evaluate(`(()=>{
        const read = ${JSON.stringify(labels[language].read)};
        const isRead = b => b.title === read || b.textContent.trim() === read;
        const titleNodes = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.includes(${JSON.stringify(targetTitle)}));
        for (const title of titleNodes) {
          let node = title;
          while (node && ![...node.querySelectorAll('button')].some(isRead)) node = node.parentElement;
          if (node) {
            const btn = [...node.querySelectorAll('button')].find(isRead);
            if (btn) { btn.click(); return; }
          }
        }
        throw new Error('Could not find book read button for ' + ${JSON.stringify(targetTitle)});
      })()`);

      // Wait for reflowable reader to render
      await until("!!document.querySelector('[data-epub-marks-status]')", 150);
      await pause(1500);

      // Verify ADR-012 Safe Save notice in EPUB reader
      const noticeStatus = await evaluate("document.querySelector('[data-epub-marks-status]')?.textContent || ''");
      const expectedNotice = isArabic ? 'العلامات محفوظة في باجليب' : 'Marks are kept in BagLib';
      assert.ok(noticeStatus.includes(expectedNotice), `Expected notice "${expectedNotice}", got "${noticeStatus}"`);
      results[`notice_${language}`] = noticeStatus;

      // Verify save button/policy is hidden for EPUB
      const hasSavePdfPolicy = await evaluate("!!document.querySelector('[data-file-save-policy]') || !!document.querySelector('[data-save-status]')");
      assert.strictEqual(hasSavePdfPolicy, false, 'File save policy menu should be absent in EPUB reader');

      // If initial page is a cover image with no text paragraphs, advance to text content
      for (let adv = 0; adv < 10; adv++) {
        const textParagraphs = await evaluate("[...document.querySelectorAll('.prose p')].filter(p => p.textContent.trim().length > 15).length");
        if (textParagraphs >= 3) break;
        await key('PageDown');
        await pause(800);
        await until("!document.querySelector('.animate-spin')", 50);
      }

      // ==========================================
      // CREATE MARKS (Highlight, Underline, Strike, Note, Bookmark)
      // ==========================================
      const selectRange = (pIndex, fromStart = true) => evaluate(`(()=>{
        try {
          const paragraphs = [...document.querySelectorAll('.prose p')].filter(p => p.textContent.trim().length > 15);
          if (paragraphs.length <= ${pIndex}) {
            const allP = [...document.querySelectorAll('p')].map(p => p.textContent.slice(0, 30));
            return 'ERROR: total paragraphs=' + paragraphs.length + ' allP=' + JSON.stringify(allP) + ' body=' + document.body.innerText.slice(0, 200);
          }
          const p = paragraphs[${pIndex}];
          const textNode = ${fromStart} ? p.firstChild : p.lastChild;
          const actualTextNode = textNode && textNode.nodeType === Node.TEXT_NODE ? textNode : (textNode ? textNode.firstChild || textNode : p);
          const text = actualTextNode.textContent || '';
          const range = document.createRange();
          range.setStart(actualTextNode, 0);
          range.setEnd(actualTextNode, Math.min(text.length, 25));
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          return 'OK: ' + range.toString();
        } catch (e) {
          return 'EXCEPTION: ' + e.message;
        }
      })()`);

      // 1. Highlight
      await chooseTool('highlight');
      await pause(300);
      const res1 = await selectRange(0, true);
      assert.match(res1, /^OK:/);
      console.log('[epub-markup-live] res1:', res1);
      await pause(1000);

      // 2. Underline
      await chooseTool('underline');
      await pause(300);
      const res2 = await selectRange(1, true);
      assert.match(res2, /^OK:/);
      console.log('[epub-markup-live] res2:', res2);
      await pause(1000);

      // 3. Strike
      await chooseTool('strike');
      await pause(300);
      const res3 = await selectRange(1, false);
      assert.match(res3, /^OK:/);
      console.log('[epub-markup-live] res3:', res3);
      await pause(1000);

      // Reset tool to select
      await chooseTool('select');
      await pause(300);

      // Verify marks were persisted to SQLite with valid CFI locations
      const savedMarks = await evaluate(`window.electronAPI.knowledge.getByWork(${JSON.stringify(targetWorkId)})`);
      assert.ok(savedMarks.length >= 3, `Expected at least 3 marks in SQLite, found ${savedMarks.length}`);

      for (const mark of savedMarks) {
        assert.ok(mark.location, 'Mark location must not be empty');
        assert.ok(mark.location.includes('cfi'), `Mark location must contain CFI, got: ${mark.location}`);
      }

      // Check underline and strike styles
      const underlineMark = savedMarks.find(m => m.location.includes('underline'));
      const strikeMark = savedMarks.find(m => m.location.includes('strike'));
      assert.ok(underlineMark, 'Underline mark must be saved with style: underline');
      assert.ok(strikeMark, 'Strike mark must be saved with style: strike');

      // Verify DOM marks rendered with correct styling
      const markElements = await evaluate(`(()=>{
        return [...document.querySelectorAll('mark.baglib-highlight')].map(m => ({
          text: m.textContent,
          style: m.getAttribute('data-mark-style'),
          decor: m.style.textDecoration,
          bg: m.style.backgroundColor
        }));
      })()`);
      assert.ok(markElements.length >= 2, `Expected rendered marks in DOM, found ${markElements.length}`);

      // Reveal top bar via pointer hover (clientY <= 44px) so markup toolbar is visible in screenshot
      await evaluate("window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 20, bubbles: true }))");
      await pause(400);
      await shot(`epub-${language}-markup-1280`);

      // Test 480px responsive layout with marks visible and toolbar revealed
      owner.setContentSize(480, 800);
      await pause(1000);
      await until("!document.querySelector('.animate-spin')", 100);
      await evaluate("window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 20, bubbles: true }))");
      await pause(400);
      await shot(`epub-${language}-markup-480`);

      // Verify toolbar can also be toggled without mouse via viewport tap/click (accessibility check)
      const toolbarBeforeTap = await evaluate("!document.querySelector('[data-reader-markup-bar]')?.closest('.opacity-0')");
      await evaluate(`(()=>{
        const prose = document.querySelector('.prose');
        if (prose) prose.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      })()`);
      await pause(300);
      const toolbarAfterTap = await evaluate("!document.querySelector('[data-reader-markup-bar]')?.closest('.opacity-0')");
      results[`a11y_tap_toggle_${language}`] = { before: toolbarBeforeTap, after: toolbarAfterTap };

      // Restore 1280px and wait for repagination to settle
      owner.setContentSize(1280, 900);
      await pause(1000);
      await until("!document.querySelector('.animate-spin')", 100);
      await pause(500);

      // ==========================================
      // MARK POPOVER: Details, Color, Comments
      // ==========================================
      if (isArabic) {
        // Click first mark to open PdfMarkPopover
        await evaluate("document.querySelector('mark.baglib-highlight')?.click()");
        await until("!!document.querySelector('[role=\"dialog\"]')", 100);
        await pause(600);

        // Switch to comments tab
        await evaluate("document.querySelector('[data-mark-tab=\"comments\"]')?.click()");
        await until("!!document.querySelector('[data-comment-new]')", 80);
        await pause(400);

        // Add a comment to the thread
        await evaluate(`(()=>{
          const textarea = document.querySelector('[data-comment-new]');
          if (textarea) {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'فائدة منهجية من المتن');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
          }
        })()`);
        await pause(300);
        await evaluate("document.querySelector('[data-comment-add]')?.click()");
        await until("document.querySelectorAll('[data-comment-thread]').length >= 1", 80);
        await pause(500);

        await shot('epub-mark-popover-comments');

        // Close popover
        await evaluate("document.querySelector('[data-mark-popover-close]')?.click() || document.querySelector('[role=\"dialog\"] button')?.click()");
        await pause(500);

        // ==========================================
        // MARKS LIST: Grouped by Chapter
        // ==========================================
        // Open Knowledge Drawer
        await evaluate("document.querySelector('[data-reader-panel-toggle]').click()");
        await until("!!document.querySelector('[data-reader-panel-tab=knowledge]')");
        await evaluate("document.querySelector('[data-reader-panel-tab=knowledge]').click()");
        await until("!!document.querySelector('[data-marks-chapter-section]') || !!document.querySelector('[data-marks-list]')", 100);
        await pause(800);

        const chapterSections = await evaluate(`(()=>{
          return [...document.querySelectorAll('[data-marks-chapter-section]')].map(s => s.getAttribute('data-marks-chapter-section'));
        })()`);
        results.chapterSections = chapterSections;
        assert.ok(chapterSections.length >= 1, 'Marks list must display at least one chapter section in EPUB');

        await shot('epub-marks-grouped-by-chapter');

        // Close knowledge drawer
        await key('Escape');
        await pause(500);

        // ==========================================
        // UNDO / REDO (Ctrl+Z / Ctrl+Shift+Z)
        // ==========================================
        const countBeforeUndo = (await evaluate(`window.electronAPI.knowledge.getByWork(${JSON.stringify(targetWorkId)})`)).length;
        console.log('[epub-markup-live] countBeforeUndo:', countBeforeUndo);

        // Undo 1: Undoes the comment added to the mark in the popover
        const undo1 = await evaluate(`window.electronAPI.materialSave.undo(${JSON.stringify(targetWorkId)})`);
        console.log('[epub-markup-live] undo1 (comment):', undo1);
        assert.ok(undo1.ok, 'First undo must succeed');
        assert.ok(undo1.data.action.includes('comment'), 'First undo should undo the comment');

        // Undo 2: Undoes the last mark (strike)
        const undo2 = await evaluate(`window.electronAPI.materialSave.undo(${JSON.stringify(targetWorkId)})`);
        console.log('[epub-markup-live] undo2 (mark):', undo2);
        assert.ok(undo2.ok, 'Second undo must succeed');
        await pause(500);

        const countAfterUndo = (await evaluate(`window.electronAPI.knowledge.getByWork(${JSON.stringify(targetWorkId)})`)).length;
        console.log('[epub-markup-live] countAfterUndo:', countAfterUndo);
        assert.ok(countAfterUndo < countBeforeUndo, `Expected marks count to decrease after undoing mark (before: ${countBeforeUndo}, after: ${countAfterUndo})`);

        // Redo 1: Restores the mark
        const redo1 = await evaluate(`window.electronAPI.materialSave.redo(${JSON.stringify(targetWorkId)})`);
        console.log('[epub-markup-live] redo1 (mark):', redo1);
        assert.ok(redo1.ok, 'First redo must succeed');
        await pause(500);

        const countAfterRedo = (await evaluate(`window.electronAPI.knowledge.getByWork(${JSON.stringify(targetWorkId)})`)).length;
        assert.strictEqual(countAfterRedo, countBeforeUndo, 'Expected marks count to be restored after redo');

        // Redo 2: Restores the comment
        const redo2 = await evaluate(`window.electronAPI.materialSave.redo(${JSON.stringify(targetWorkId)})`);
        console.log('[epub-markup-live] redo2 (comment):', redo2);
        assert.ok(redo2.ok, 'Second redo must succeed');
        assert.strictEqual(countAfterRedo, countBeforeUndo, 'Expected marks count to be restored after redo');
      }
    }

    // ==========================================
    // 3. REAL ENGLISH TEXTBOOK EPUB TEST (Fundamentals of Cost Accounting)
    // ==========================================
    await load('en', 1280, 900);

    // Navigate to library and open the textbook
    await evaluate("document.querySelector('[data-nav-item][aria-label=\"Library\"]')?.click()");
    await until("[...document.querySelectorAll('button')].some(b=>b.title==='Read'||b.textContent.trim()==='Read')");

    await evaluate(`(()=>{
      const isRead = b => b.title === 'Read' || b.textContent.trim() === 'Read';
      const titleNodes = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.includes('Cost Accounting'));
      for (const title of titleNodes) {
        let node = title;
        while (node && ![...node.querySelectorAll('button')].some(isRead)) node = node.parentElement;
        if (node) {
          const btn = [...node.querySelectorAll('button')].find(isRead);
          if (btn) { btn.click(); return; }
        }
      }
      throw new Error('Could not find read button for Fundamentals of Cost Accounting');
    })()`);

    // Wait for textbook reader to render
    await until("!!document.querySelector('[data-epub-marks-status]')", 250);
    await pause(2000);

    // Verify ADR-012 Safe Save notice in textbook EPUB reader
    const textbookNotice = await evaluate("document.querySelector('[data-epub-marks-status]')?.textContent || ''");
    assert.ok(textbookNotice.includes('Marks are kept in BagLib'), `Expected textbook notice, got: ${textbookNotice}`);
    results.notice_textbook = textbookNotice;

    // Verify save button/policy is hidden for textbook EPUB
    const textbookSavePolicy = await evaluate("!!document.querySelector('[data-file-save-policy]') || !!document.querySelector('[data-save-status]')");
    assert.strictEqual(textbookSavePolicy, false, 'File save policy menu should be absent in textbook EPUB reader');

    // Advance to text content in a later chapter
    for (let adv = 0; adv < 15; adv++) {
      const pCount = await evaluate("[...document.querySelectorAll('.prose p')].filter(p => p.textContent.trim().length > 20).length");
      if (pCount >= 2) break;
      await key('PageDown');
      await pause(800);
      await until("!document.querySelector('.animate-spin')", 60);
    }

    // Add Highlight in textbook
    await chooseTool('highlight');
    await pause(300);
    const textbookSelect = await evaluate(`(()=>{
      try {
        const paragraphs = [...document.querySelectorAll('.prose p')].filter(p => p.textContent.trim().length > 20);
        if (paragraphs.length === 0) return 'ERROR: no paragraphs';
        const p = paragraphs[0];
        const textNode = p.firstChild || p;
        const text = textNode.textContent || '';
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, Math.min(text.length, 30));
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return 'OK: ' + range.toString();
      } catch (e) { return 'ERR: ' + e.message; }
    })()`);
    console.log('[epub-markup-live] textbook highlight select:', textbookSelect);
    await pause(1000);

    // Add a Note to the mark via knowledge API
    const initialTextbookMarks = await evaluate("window.electronAPI.knowledge.getByWork('epub-en-textbook')");
    assert.ok(initialTextbookMarks.length >= 1, `Expected at least 1 mark in textbook, found ${initialTextbookMarks.length}`);
    const textbookMarkId = initialTextbookMarks[0].id;

    // Update note content on the mark
    await evaluate(`window.electronAPI.knowledge.save({
      id: ${JSON.stringify(textbookMarkId)},
      workId: 'epub-en-textbook',
      type: 'highlight',
      location: ${JSON.stringify(initialTextbookMarks[0].location)},
      noteContent: 'Cost accounting analysis of cost behavior and value creation',
      actor: 'reader'
    })`);
    await pause(500);

    // Reveal toolbar via hover
    await evaluate("window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 20, bubbles: true }))");
    await pause(400);
    await shot('epub-en-textbook-1280');

    // Open Knowledge Drawer to check Marks list grouped by chapter
    await evaluate("document.querySelector('[data-reader-panel-toggle]').click()");
        await until("!!document.querySelector('[data-reader-panel-tab=knowledge]')");
        await evaluate("document.querySelector('[data-reader-panel-tab=knowledge]').click()");
    await until("!!document.querySelector('[data-reader-side-panel]')", 100);
    await pause(800);

    const textbookChapterGroups = await evaluate(`(()=>{
      return [...document.querySelectorAll('[data-marks-chapter-header]')].map(el => el.textContent.trim());
    })()`);
    console.log('[epub-markup-live] textbook chapter groups:', textbookChapterGroups);
    assert.ok(textbookChapterGroups.length >= 1, 'Expected at least 1 chapter group header in Marks list');
    results.textbookChapterGroups = textbookChapterGroups;
    await shot('epub-en-textbook-marks-grouped');

    // Test Jump Back from Marks list
    const pageBeforeJump = await evaluate("document.querySelector('[data-page-number]')?.getAttribute('data-page-number') || ''");
    // Advance away
    await key('PageDown');
    await pause(800);
    await until("!document.querySelector('.animate-spin')", 60);

    // Click mark in Marks list to jump back
    await evaluate("document.querySelector('[data-marks-row]')?.click()");
    await pause(1000);
    const pageAfterJump = await evaluate("document.querySelector('[data-page-number]')?.getAttribute('data-page-number') || ''");
    results.textbookJump = { before: pageBeforeJump, after: pageAfterJump };

    // Close Knowledge Drawer
    await key('Escape');
    await pause(400);

    // Undo the textbook operations (first note content, second highlight mark)
    const textbookUndo1 = await evaluate("window.electronAPI.materialSave.undo('epub-en-textbook')");
    console.log('[epub-markup-live] textbook undo 1 (note):', textbookUndo1);
    assert.ok(textbookUndo1.ok, 'Textbook undo 1 must succeed');

    const textbookUndo2 = await evaluate("window.electronAPI.materialSave.undo('epub-en-textbook')");
    console.log('[epub-markup-live] textbook undo 2 (mark):', textbookUndo2);
    assert.ok(textbookUndo2.ok, 'Textbook undo 2 must succeed');

    const marksAfterUndo = await evaluate("window.electronAPI.knowledge.getByWork('epub-en-textbook')");
    console.log('[epub-markup-live] textbook marks after undo:', marksAfterUndo.length);
    assert.strictEqual(marksAfterUndo.length, 0, 'Textbook marks count must decrease to 0 after undos');

    // Save test results summary to disk
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2));
    console.log('[epub-markup-live] All live assertions passed successfully!');
    app.quit();
  })().catch(err => {
    console.error('[epub-markup-live] Test failure:', err);
    app.exit(1);
  });
});

require('../../dist/main/index.js');
