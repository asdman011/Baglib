const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_NOTES_PROFILE || path.resolve('.baglib-data/key304-profile');
const evidence = process.env.BAGLIB_NOTES_EVIDENCE || path.resolve('.baglib-data/KEY-304-evidence');

app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
app.setAsDefaultProtocolClient = () => {
  throw new Error('No protocol registration in live check');
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let started = false;

app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;

  win.webContents.on('console-message', (_, level, message) => {
    console.log(`[renderer log level=${level}] ${message}`);
  });

  const evaluate = (code) => win.webContents.executeJavaScript(code, true);

  const until = async (code, timeoutMs = 30000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await evaluate(code)) return;
      } catch {}
      await pause(150);
    }
    throw new Error(`Timeout waiting for: ${code}`);
  };

  const fix1Dir = path.join(evidence, 'fix1');
  if (!fs.existsSync(fix1Dir)) {
    fs.mkdirSync(fix1Dir, { recursive: true });
  }

  const shot = async (name) => {
    win.show();
    win.focus();
    win.webContents.focus();
    await pause(350);
    const image = await win.webContents.capturePage();
    const filePath = path.join(evidence, `${name}.png`);
    fs.writeFileSync(filePath, image.toPNG());
    console.log(`[shot] ${name}.png saved (${image.getSize().width}x${image.getSize().height})`);
  };

  const shotFix1 = async (name) => {
    win.show();
    win.focus();
    win.webContents.focus();
    await pause(350);
    const image = await win.webContents.capturePage();
    const filePath = path.join(fix1Dir, `${name}.png`);
    fs.writeFileSync(filePath, image.toPNG());
    console.log(`[shot-fix1] ${name}.png saved (${image.getSize().width}x${image.getSize().height})`);
  };

  const setDimensions = async (width, height) => {
    win.setMinimumSize(320, 300);
    win.setContentSize(width, height);
    win.setSize(width, height);
    await pause(300);
  };

  const setLanguage = async (targetLang) => {
    const current = await evaluate('document.documentElement.getAttribute("lang") || "ar"');
    if (current !== targetLang) {
      console.log(`[live] Switching language from ${current} to ${targetLang}...`);
      await evaluate(`
        (() => {
          const btn = document.querySelector('header button[aria-label*="Language"], header button[aria-label*="اللغة"], header button[title*="Language"], header button[title*="اللغة"]');
          if (btn) btn.click();
        })()
      `);
      await pause(400);
    }
    await until(`document.documentElement.getAttribute("lang") === "${targetLang}"`);
    const actualLang = await evaluate('document.documentElement.getAttribute("lang")');
    const actualDir = await evaluate('document.documentElement.getAttribute("dir")');
    assert.equal(actualLang, targetLang, `HTML lang attribute must be ${targetLang}`);
    assert.equal(actualDir, targetLang === 'ar' ? 'rtl' : 'ltr', `HTML dir attribute must match ${targetLang}`);
    await pause(250);
  };

  const setTheme = async (targetTheme) => {
    const isDark = await evaluate('document.documentElement.classList.contains("dark")');
    const wantsDark = targetTheme === 'dark';
    if (isDark !== wantsDark) {
      console.log(`[live] Switching theme to ${targetTheme}...`);
      await evaluate(`
        (() => {
          const btn = document.querySelector('header button[aria-label*="Theme"], header button[aria-label*="المظهر"], header button[title*="Theme"], header button[title*="المظهر"]');
          if (btn) btn.click();
        })()
      `);
      await pause(350);
    }
    await until(`"${targetTheme}" === "dark" ? document.documentElement.classList.contains("dark") : !document.documentElement.classList.contains("dark")`);
    await pause(200);
  };

  const navToNotes = async () => {
    console.log('[live] navToNotes executing...');
    const result = await evaluate(`
      (() => {
        window.dispatchEvent(new CustomEvent('baglib:study-note-open'));
        return {
          viewMode: document.body.innerHTML.includes('data-notes-overview') ? 'found' : 'not found',
          headerCount: document.querySelectorAll('header').length
        };
      })()
    `);
    console.log('[live] navToNotes dispatch result:', result);
    await until('!!document.querySelector("[data-notes-overview]")', 15000);
    await pause(500);
  };

  (async () => {
    try {
      win.setMinimumSize(320, 400);
      win.setContentSize(1280, 850);
      win.show();
      win.focus();

      console.log('[live] Waiting for application initial load...');
      await until('!!window.electronAPI && !!document.querySelector("footer")');
      console.log('[live] App shell loaded.');

      // 1. Seed Real Arabic PDF & Real English PDF
      console.log('[live] Seeding real files from tests/real-files/...');
      const arPdfPath = path.resolve('tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf');
      const enPdfPath = path.resolve('tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf');

      await evaluate(`
        (async () => {
          try {
            await window.electronAPI.addBook({
              id: 'real-ar-pdf',
              title: 'الدفاع عن أراضي المسلمين أهم فروض الأعيان',
              author: 'عبد الله عزام',
              workType: 'book',
              bookType: 'digital',
              digitalFormat: 'PDF',
              filePath: ${JSON.stringify(arPdfPath)},
              categories: ['دراسات إسلامية', 'فقه'],
              tags: ['#جهاد', '#فقه'],
              readingStatus: 'reading',
              createdAt: new Date().toISOString(),
            });

            await window.electronAPI.addBook({
              id: 'real-en-pdf',
              title: 'Why Lyrics Last: Evolution, Cognition, and Shakespeare',
              author: 'Brian Boyd',
              workType: 'book',
              bookType: 'digital',
              digitalFormat: 'PDF',
              filePath: ${JSON.stringify(enPdfPath)},
              categories: ['Literature', 'Philosophy'],
              tags: ['#shakespeare', '#cognition'],
              readingStatus: 'unread',
              createdAt: new Date().toISOString(),
            });
          } catch (e) {
            console.log('[seed books err]', e);
          }
        })()
      `);

      // 2. Seed Study Notes from real Arabic passage with question capture enabled
      console.log('[live] Creating notes from real passages and enabling question capture...');
      await evaluate(`
        (async () => {
          try {
            await window.electronAPI.knowledgeHistory.setCapture(true);

            await window.electronAPI.studyNotes.save({
              id: 'note-ar-defense',
              title: 'تأصيل فرضية الدفاع عن أراضي المسلمين',
              content: 'إن الحمد لله نحمده ونستعينه ونستغفره ونعوذ بالله من شرور أنفسنا ومن سيئات أعمالنا. هذا تأصيل شرعي مستمد من نصوص الفقهاء الأربعة في وجوب الدفاع عن الثغور وأراضي المسلمين وحمايتها عند نزول العدو.\\n\\nهل يسقط الدفاع عن أراضي المسلمين بالتقصير؟',
              aliases: ['أراضي المسلمين', 'فروض الأعيان'],
              tags: ['فقه', 'جهاد', 'تأصيل'],
              workId: 'real-ar-pdf',
            });

            await window.electronAPI.studyNotes.save({
              id: 'note-en-lyrics',
              title: 'Cognitive Patterns in Shakespearean Sonnets',
              content: 'Exploring Brian Boyd analysis of evolutionary memory and attention capture in lyrical structures [[note:note-ar-defense|الدفاع عن أراضي المسلمين]].\\n\\nHow does Shakespeare structure memory and lyrical retention?',
              aliases: ['Shakespeare', 'Cognition'],
              tags: ['literature', 'cognition'],
              workId: 'real-en-pdf',
            });
          } catch (e) {
            console.log('[seed notes err]', e);
          }
        })()
      `);

      // 3. Make Knowledge Card from the note & set due for review
      console.log('[live] Creating knowledge card from note and setting due...');
      await evaluate(`
        (async () => {
          try {
            const card = await window.electronAPI.knowledgeCards.save({
              front: 'ما هو حكم الدفاع عن أراضي المسلمين عند هجوم العدو؟',
              back: 'فرض عين على كل مسلم ومسلمة بالإجماع، لا يُشترط فيه إذن ولي ولا غريم.',
              sourceKind: 'note',
              sourceRef: 'note:note-ar-defense',
              sourceLabel: 'تأصيل فرضية الدفاع عن أراضي المسلمين',
              workId: 'real-ar-pdf',
              language: 'ar',
            });

            await window.electronAPI.knowledgeCards.setMemorizing(card.id, true);
          } catch (e) {
            console.log('[seed cards err]', e);
          }
        })()
      `);

      // 4. Seed Board
      console.log('[live] Creating a board...');
      await evaluate(`
        (async () => {
          try {
            await window.electronAPI.boards.save({
              id: 'board-mind-map',
              title: 'خريطة مفاهيم فقه الدفاع والأعيان',
              preset: 'mind',
              items: [
                { id: 'b-1', kind: 'card', x: 200, y: 150, w: 200, h: 90, text: 'الدفاع عن أراضي المسلمين', color: 'amber', target: 'note:note-ar-defense', label: 'الملاحظة' },
                { id: 'b-2', kind: 'sticky', x: 450, y: 100, w: 170, h: 140, text: 'إجماع الفقهاء الأربعة على فرض العين', color: 'emerald' },
                { id: 'b-3', kind: 'card', x: 450, y: 270, w: 200, h: 90, text: 'أهمية الإخلاص ونصرة الحق', color: 'sky' }
              ],
              edges: [
                { id: 'e-1', from: 'b-1', to: 'b-2', label: 'يؤيد' },
                { id: 'e-2', from: 'b-1', to: 'b-3', label: 'يشرح' }
              ],
              expectedRevision: 0,
            });
          } catch (e) {
            console.log('[seed board err]', e);
          }
        })()
      `);

      // 5. Navigate to Notes Workspace in Arabic (1280px Light)
      console.log('[live] Switching to Notes workspace (Arabic RTL 1280px)...');
      await setDimensions(1280, 850);
      await setLanguage('ar');
      await setTheme('light');
      await navToNotes();

      const dir1 = await evaluate('document.documentElement.dir');
      assert.equal(dir1, 'rtl', 'Dir must be rtl in Arabic');
      await shot('01-notes-workspace-3pane-ar-light-1280');

      // 5b. Fix 1 Verifications: Open Questions & Note Graph Button in Arabic (1280px Light)
      console.log('[live] Fix 1: Checking Open Questions list filter (Arabic)...');
      await evaluate(`
        (() => {
          const sel = document.querySelector('[data-notes-list-pane] select');
          if (sel) {
            sel.value = 'questions';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `);
      await until('!!document.querySelector("[data-notes-list-pane] [data-knowledge-tools]")');
      await pause(400);
      await shotFix1('01-open-questions-list-ar-1280');

      console.log('[live] Fix 1: Checking Note Graph Button on Note 2 (Arabic)...');
      await evaluate(`
        (() => {
          const sel = document.querySelector('[data-notes-list-pane] select');
          if (sel) {
            sel.value = 'all';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `);
      await pause(300);
      await evaluate(`
        (() => {
          const item = document.querySelector('[data-study-note="note-en-lyrics"]');
          if (item) item.click();
        })()
      `);
      await until('!!document.querySelector("[data-note-editor-pane] [data-graph-button]")');
      await pause(400);
      await shotFix1('02-note-graph-button-ar-1280');

      console.log('[live] Fix 1: Checking Open Questions tab in NoteDetailsPane (Arabic)...');
      await evaluate(`
        (() => {
          const qTab = document.querySelector('[data-note-details-pane] [data-tab-questions]');
          if (qTab) qTab.click();
        })()
      `);
      await until('!!document.querySelector("[data-note-details-pane] [data-knowledge-tools]")');
      await pause(400);
      await shotFix1('03-open-questions-pane-ar-1280');

      // 6. Switch to Cards tab
      console.log('[live] Switching to Cards tab...');
      await evaluate(`
        (() => {
          const cardsTab = document.querySelector('[data-notes-tab="cards"]');
          if (cardsTab) cardsTab.click();
        })()
      `);
      await until('!!document.querySelector("[data-saved-cards]")');
      await pause(400);
      await shot('02-cards-deck-view-ar-light-1280');

      // 7. Start SRS Review Screen
      console.log('[live] Opening dedicated Review screen...');
      await evaluate(`
        (() => {
          const revBtn = document.querySelector('[data-start-review-button], [data-start-review-header]');
          if (revBtn) revBtn.click();
        })()
      `);
      await until('!!document.querySelector("[data-srs-review-screen]")');
      await pause(500);
      await shot('03-review-screen-card-ar-light-1280');

      // 8. Test Space to reveal
      console.log('[live] Testing keyboard Space to reveal...');
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
      win.webContents.sendInputEvent({ type: 'char', keyCode: 'Space' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
      await pause(400);
      await shot('04-review-screen-revealed-ar-light-1280');

      // 9. Test Keyboard Key 3 (Good) to grade
      console.log('[live] Testing keyboard key 3 to grade...');
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: '3' });
      win.webContents.sendInputEvent({ type: 'char', keyCode: '3' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: '3' });
      await pause(600);
      await shot('05-review-screen-empty-ar-light-1280');

      // Return to Cards from empty review screen
      await evaluate(`
        (() => {
          const retBtn = document.querySelector('[data-srs-return-button], [data-srs-exit-button]');
          if (retBtn) retBtn.click();
        })()
      `);
      await pause(400);

      // 10. Switch to Boards tab (First-class view)
      console.log('[live] Switching to Boards tab...');
      await evaluate(`
        (() => {
          const boardsTab = document.querySelector('[data-notes-tab="boards"]');
          if (boardsTab) boardsTab.click();
        })()
      `);
      await until('!!document.querySelector("[data-boards]")');
      await pause(500);

      // Open the board
      await evaluate(`
        (() => {
          const entry = document.querySelector('[data-boards-entry]');
          if (entry) {
            const btn = entry.querySelector('button');
            if (btn) btn.click();
          }
        })()
      `);
      await pause(600);
      await shot('06-boards-workspace-ar-light-1280');

      // 11. Responsive at 480px (Arabic RTL)
      console.log('[live] Testing 480px responsive view (Arabic RTL)...');
      await setDimensions(480, 800);
      await pause(500);

      // Switch to Notes tab
      await evaluate(`
        (() => {
          const notesTab = document.querySelector('[data-notes-tab="notes"]');
          if (notesTab) notesTab.click();
        })()
      `);
      await pause(400);

      // If in editor on mobile, click back to show list
      await evaluate(`
        (() => {
          const back = document.querySelector('[data-notes-back-button]');
          if (back) back.click();
        })()
      `);
      await pause(400);
      await shot('07-notes-list-ar-480');

      // Tap note to open stacked editor view
      await evaluate(`
        (() => {
          const noteItem = document.querySelector('[data-study-note="note-ar-defense"]');
          if (noteItem) noteItem.click();
        })()
      `);
      await pause(400);
      await shot('08-notes-editor-stacked-ar-480');

      // Dedicated review screen at 480px
      await evaluate(`
        (() => {
          window.dispatchEvent(new CustomEvent('baglib:start-review'));
        })()
      `);
      await pause(400);
      await shot('09-review-screen-ar-480');

      // Return to main notes
      await evaluate(`
        (() => {
          const exitBtn = document.querySelector('[data-srs-exit-button], [data-srs-return-button]');
          if (exitBtn) exitBtn.click();
        })()
      `);
      await pause(300);

      // 12. Switch to English LTR Dark Mode at 1280px
      console.log('[live] Switching to English LTR Dark Mode (1280px)...');
      await setDimensions(1280, 850);
      await setLanguage('en');
      await setTheme('dark');
      await navToNotes();

      // Confirm dir is ltr
      const dirEn = await evaluate('document.documentElement.dir');
      console.log(`[live] Current document direction: ${dirEn}`);

      // Notes tab in English Dark
      await evaluate(`
        (() => {
          const notesTab = document.querySelector('[data-notes-tab="notes"]');
          if (notesTab) notesTab.click();
        })()
      `);
      await pause(500);
      await shot('10-notes-workspace-en-dark-1280');

      // 12b. Fix 1 Verifications: Open Questions & Note Graph Button in English Dark (1280px)
      console.log('[live] Fix 1: Checking Open Questions list filter (English Dark)...');
      await evaluate(`
        (() => {
          const sel = document.querySelector('[data-notes-list-pane] select');
          if (sel) {
            sel.value = 'questions';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `);
      await until('!!document.querySelector("[data-notes-list-pane] [data-knowledge-tools]")');
      await pause(400);
      await shotFix1('04-open-questions-en-dark-1280');

      console.log('[live] Fix 1: Checking Note Graph Button on Note 2 (English Dark)...');
      await evaluate(`
        (() => {
          const sel = document.querySelector('[data-notes-list-pane] select');
          if (sel) {
            sel.value = 'all';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `);
      await pause(300);
      await evaluate(`
        (() => {
          const item = document.querySelector('[data-study-note="note-en-lyrics"]');
          if (item) item.click();
        })()
      `);
      await until('!!document.querySelector("[data-note-editor-pane] [data-graph-button]")');
      await pause(400);
      await shotFix1('05-note-graph-button-en-dark-1280');

      // Cards tab in English Dark
      await evaluate(`
        (() => {
          const cardsTab = document.querySelector('[data-notes-tab="cards"]');
          if (cardsTab) cardsTab.click();
        })()
      `);
      await pause(400);
      await shot('11-cards-deck-view-en-dark-1280');

      // Boards tab in English Dark
      await evaluate(`
        (() => {
          const boardsTab = document.querySelector('[data-notes-tab="boards"]');
          if (boardsTab) boardsTab.click();
        })()
      `);
      await pause(400);
      await shot('12-boards-workspace-en-dark-1280');

      // 13. Responsive at 480px (English LTR Dark)
      console.log('[live] Testing 480px responsive view (English LTR Dark)...');
      await setDimensions(480, 800);
      await pause(500);
      await pause(500);

      // Notes list at 480
      await evaluate(`
        (() => {
          const notesTab = document.querySelector('[data-notes-tab="notes"]');
          if (notesTab) notesTab.click();
          const back = document.querySelector('[data-notes-back-button]');
          if (back) back.click();
        })()
      `);
      await pause(400);
      await shot('13-notes-list-en-dark-480');

      // Notes editor at 480
      await evaluate(`
        (() => {
          const noteItem = document.querySelector('[data-study-note]');
          if (noteItem) noteItem.click();
        })()
      `);
      await pause(400);
      await shot('14-notes-editor-en-dark-480');

      console.log('[live] All 14 live checks and screenshots completed successfully!');
      app.exit(0);
    } catch (err) {
      console.error('[live error]', err);
      app.exit(1);
    }
  })();
});

// Require main process to bootstrap
require('../../dist/main/index.js');
