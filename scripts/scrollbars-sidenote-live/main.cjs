const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_K315_PROFILE || path.resolve('.baglib-data/k315-profile');
const evidence = process.env.BAGLIB_K315_EVIDENCE || path.resolve('.baglib-data/KEY-315-evidence');

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
    if (level >= 3) {
      console.log(`[renderer error] ${message}`);
    }
  });

  const evaluate = (code) => win.webContents.executeJavaScript(code, true);
  // KEY-317: throwaway profiles would show the KEY-307 first-run guide, which takes focus.
  win.webContents.on('did-finish-load', () => { win.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });

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

  const setLocale = async (targetLang, targetTheme) => {
    await evaluate(`
      (() => {
        const currentLang = document.documentElement.getAttribute('lang') || 'ar';
        if (currentLang !== '${targetLang}') {
          const langBtn = Array.from(document.querySelectorAll('button')).find(
            b => b.title && (b.title.includes('Language') || b.title.includes('اللغة') || b.title.includes('English') || b.title.includes('العربية'))
          );
          if (langBtn) langBtn.click();
        }
        const isDark = document.documentElement.classList.contains('dark');
        const currentTheme = isDark ? 'dark' : 'light';
        if (currentTheme !== '${targetTheme}') {
          const themeBtn = Array.from(document.querySelectorAll('button')).find(
            b => b.title && (b.title.includes('Theme') || b.title.includes('المظهر') || b.title.includes('Dark') || b.title.includes('Light'))
          );
          if (themeBtn) themeBtn.click();
        }
      })()
    `);
    await pause(450);
    await until(`document.documentElement.getAttribute('lang') === '${targetLang}'`);
    await until(`'${targetTheme}' === 'dark' ? document.documentElement.classList.contains('dark') : !document.documentElement.classList.contains('dark')`);
  };

  const navToView = async (viewId) => {
    if (viewId === 'notes') {
      await evaluate(`window.dispatchEvent(new CustomEvent('baglib:study-note-open'))`);
      await until('!!document.querySelector("[data-notes-overview]")', 15000);
      await pause(400);
      return;
    }
    const labelsByView = {
      library: ['المكتبة', 'Library'],
      settings: ['الإعدادات', 'Settings'],
      support: ['الدعم والمساعدة', 'Support & Help', 'Support'],
    };
    const targets = labelsByView[viewId] || [viewId];
    await evaluate(`
      (() => {
        const targets = ${JSON.stringify(targets)};
        const btns = Array.from(document.querySelectorAll('aside button, button'));
        const match = btns.find(b => {
          const aria = b.getAttribute('aria-label') || '';
          const txt = b.textContent || '';
          return targets.some(t => aria === t || txt.includes(t));
        });
        if (match) match.click();
      })()
    `);
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
      await evaluate(`
        (() => {
          const splash = document.querySelector('[data-splash-screen], [data-testid="startup-splash"]');
          if (splash) splash.remove();
        })()
      `);
      await pause(500);
      console.log('[live] App shell loaded.');

      // 1. Seed Real Files + extra books & notes so Library, Reader, Notes, Settings, and Modal all scroll
      const arPdfPath = path.resolve(
        'tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf'
      );
      const enPdfPath = path.resolve(
        'tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf'
      );
      assert.ok(fs.existsSync(arPdfPath), `Real Arabic PDF missing: ${arPdfPath}`);
      assert.ok(fs.existsSync(enPdfPath), `Real English PDF missing: ${enPdfPath}`);

      const booksToSeed = [
        {
          id: 'real-ar-pdf',
          title: 'الدفاع عن أراضي المسلمين أهم فروض الأعيان',
          author: 'عبد الله عزام',
          workType: 'book',
          bookType: 'digital',
          digitalFormat: 'PDF',
          filePath: arPdfPath,
          categories: ['فقه', 'دراسات إسلامية'],
          tags: ['#فقه'],
          readingStatus: 'reading',
          readingProgress: 35,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'real-en-pdf',
          title: 'Why Lyrics Last: Evolution, Cognition, and Shakespeare',
          author: 'Brian Boyd',
          workType: 'book',
          bookType: 'digital',
          digitalFormat: 'PDF',
          filePath: enPdfPath,
          categories: ['Literature', 'Cognition'],
          tags: ['#shakespeare'],
          readingStatus: 'reading',
          readingProgress: 20,
          createdAt: new Date(Date.now() - 3600_000).toISOString(),
        },
      ];

      for (let i = 1; i <= 28; i++) {
        booksToSeed.push({
          id: `extra-book-${i}`,
          title: i % 2 === 0 ? `Scholarly Volume ${i}: Manuscript Studies` : `مجلد تراثي وموسوعة علمية رقم ${i}`,
          author: i % 2 === 0 ? 'Ibn Khaldun' : 'ابن خلدون',
          workType: 'book',
          bookType: i % 3 === 0 ? 'physical' : 'digital',
          digitalFormat: 'PDF',
          categories: [i % 2 === 0 ? 'History' : 'تاريخ'],
          tags: ['#history'],
          readingStatus: 'unread',
          createdAt: new Date(Date.now() - i * 86400_000).toISOString(),
        });
      }

      await evaluate(`
        (async () => {
          const books = ${JSON.stringify(booksToSeed)};
          for (const b of books) {
            try {
              await window.electronAPI.addBook(b);
            } catch (e) {
              console.error('[seed addBook error]', e && e.message ? e.message : e);
            }
          }
        })()
      `);

      // Seed 20 study notes using studyNotes.save so Notes list, editor, and Reader Notes tab scroll
      for (let i = 1; i <= 20; i++) {
        const noteTitle = i % 2 === 0 ? `Research Note #${i}: Classical Philology` : `ملاحظة بحثية رقم ${i}: تحقيق المخطوطات`;
        const noteBody = Array.from({ length: 16 }, (_, lineIdx) =>
          i % 2 === 0
            ? `Paragraph ${lineIdx + 1}: Detailed analytical commentary on page ${lineIdx + 1} of Why Lyrics Last.`
            : `الفقرة ${lineIdx + 1}: تعليق علمي مفصل حول مسائل التحقيق الفقهي واللغوي في الصفحة ${lineIdx + 1}.`
        ).join('\n\n');
        await evaluate(`window.electronAPI.studyNotes.save(${JSON.stringify({
          id: `k315-note-${i}`,
          title: noteTitle,
          content: noteBody,
          tags: ['research', 'تحقيق'],
          aliases: [],
          workId: i % 2 === 0 ? 'real-en-pdf' : 'real-ar-pdf',
        })})`);
      }
      await win.loadURL('http://localhost:3000');
      await until('!!window.electronAPI && !!document.querySelector("footer")', 25000);
      await evaluate(`
        (() => {
          const splash = document.querySelector('[data-splash-screen], [data-testid="startup-splash"]');
          if (splash) splash.remove();
        })()
      `);
      await pause(800);

      const summary = {
        scrollbars: {},
        sideNote: {},
      };

      for (const lang of ['ar', 'en']) {
        for (const theme of ['dark', 'light']) {
          win.setContentSize(1280, 850);
          await pause(300);
          await setLocale(lang, theme);

          // Verify CSS scrollbar tokens on :root / .dark in live Chromium
          const tokenCheck = await evaluate(`(() => {
            const style = getComputedStyle(document.documentElement);
            return {
              thumb: style.getPropertyValue('--scrollbar-thumb').trim(),
              thumbHover: style.getPropertyValue('--scrollbar-thumb-hover').trim(),
              track: style.getPropertyValue('--scrollbar-track').trim(),
            };
          })()`);
          assert.ok(tokenCheck.thumb.length > 0, `Scrollbar thumb token missing in ${lang}-${theme}`);
          assert.ok(tokenCheck.thumbHover.length > 0, `Scrollbar hover token missing in ${lang}-${theme}`);
          summary.scrollbars[`${lang}-${theme}-tokens`] = tokenCheck;

          // A. Library view (scrollable grid + filter rail)
          await navToView('library');
          await until("document.querySelectorAll('[data-library-book-card]').length >= 10", 20000);
          await evaluate(`(() => {
            const scroller = document.querySelector('[data-library-scroll-container]');
            if (scroller) scroller.scrollTop = 180;
          })()`);
          await pause(350);
          await shot(`01-library-${lang}-${theme}-1280`);

          // B. Modal check: open BookDetailModal from a card's ⋯ menu (or SupportSheet)
          await evaluate(`(() => {
            const detailBtn = Array.from(document.querySelectorAll('button')).find(
              b => (b.textContent || '').includes('تفاصيل') || (b.textContent || '').includes('Details')
            );
            if (detailBtn) detailBtn.click();
          })()`);
          await pause(450);
          await shot(`02-modal-${lang}-${theme}-1280`);
          await evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
          await pause(350);

          // C. Notes workspace (scrollable note list + editor)
          await navToView('notes');
          await pause(500);
          await shot(`03-notes-${lang}-${theme}-1280`);

          // D. Settings view (scrollable settings directory)
          await navToView('settings');
          await pause(400);
          await evaluate(`(() => {
            const settingsScroller = document.querySelector('main > div.overflow-y-auto');
            if (settingsScroller) settingsScroller.scrollTop = 160;
          })()`);
          await pause(300);
          await shot(`04-settings-${lang}-${theme}-1280`);

          // E. Reader view (real PDF in ar/en + side panel + Side-Note Tab states!)
          await navToView('library');
          await until("document.querySelectorAll('[data-library-book-card]').length >= 2", 20000);
          await evaluate(`(() => {
            const scroller = document.querySelector('[data-library-scroll-container]');
            if (scroller) scroller.scrollTop = 0;
            localStorage.setItem('baglib.companion.v1', JSON.stringify({ open: false, noteId: null, stamp: true, topPercent: 50, edge: 'end' }));
            window.dispatchEvent(new Event('baglib:companion-position'));
          })()`);
          await pause(250);
          const targetBookTitle = lang === 'ar' ? 'الدفاع عن أراضي المسلمين' : 'Why Lyrics Last';
          await evaluate(`(() => {
            const allCards = [...document.querySelectorAll('[data-library-book-card]')];
            const matchingCard = allCards.find(c => (c.getAttribute('aria-label') || c.textContent || '').includes(${JSON.stringify(targetBookTitle)}));
            if (matchingCard) {
              matchingCard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              const readBtn = matchingCard.querySelector('[data-card-read-button]') || matchingCard.querySelector('button');
              if (readBtn) { readBtn.click(); return; }
            }
            const readBtns = [...document.querySelectorAll('button')].filter(b => {
              const txt = (b.textContent || '').trim();
              return txt === 'قراءة' || txt === 'Read';
            });
            if (readBtns[0]) readBtns[0].click();
          })()`);
          await until('!!document.querySelector("[data-companion-toggle]")', 20000);
          await until('document.querySelectorAll(".pdf-page-container canvas, [data-pdf-instant-preview]").length > 0', 25000);
          await pause(1000);

          // Open reader side panel and select Notes tab so side-panel scrollbar is visible
          await evaluate(`(() => {
            const panelToggle = document.querySelector('[data-reader-panel-toggle]');
            if (panelToggle && !document.querySelector('[data-reader-side-panel]')) {
              panelToggle.click();
            }
          })()`);
          await pause(350);
          await evaluate(`(() => {
            const notesTab = document.querySelector('[data-reader-panel-tab="notes"]');
            if (notesTab) notesTab.click();
          })()`);
          await pause(350);

          // 1. Check side-note tab at rest at 1280px
          const rest1280 = await evaluate(`(() => {
            const btn = document.querySelector('[data-companion-toggle]');
            if (!btn) return null;
            const rect = btn.getBoundingClientRect();
            const controls = [...document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="tab"]')]
              .filter(el => el !== btn && !el.hasAttribute('data-companion-toggle') && !el.hasAttribute('data-nav-peek-trigger-edge'));
            const overlapping = controls.filter(el => {
              const r = el.getBoundingClientRect();
              if (r.width <= 0 || r.height <= 0) return false;
              return r.right > rect.left && r.left < rect.right && r.bottom > rect.top && r.top < rect.bottom;
            });
            const navPeekEdge = document.querySelector('[data-nav-peek-trigger-edge]');
            const navPeekOverlap = navPeekEdge ? (() => {
              const nr = navPeekEdge.getBoundingClientRect();
              return nr.right > rect.left && nr.left < rect.right && nr.bottom > rect.top && nr.top < rect.bottom;
            })() : false;
            return {
              state: btn.getAttribute('data-state'),
              edge: btn.getAttribute('data-edge'),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              text: (btn.textContent || '').trim(),
              overlappingCount: overlapping.length,
              navPeekOverlap,
            };
          })()`);
          assert.ok(rest1280, `Side-note toggle missing in reader ${lang}-${theme}-1280`);
          assert.equal(rest1280.state, 'rest');
          assert.equal(rest1280.edge, 'end');
          assert.ok(rest1280.width >= 8 && rest1280.width <= 12, `Expected rest width 8-12px, got ${rest1280.width}px`);
          assert.equal(rest1280.text, '', 'Expected no visible text at rest');
          assert.equal(rest1280.overlappingCount, 0, `Side-note tip covered ${rest1280.overlappingCount} controls at 1280px`);
          assert.equal(rest1280.navPeekOverlap, false, 'Side-note tip must not collide with KEY-310 nav peek edge');
          summary.sideNote[`${lang}-${theme}-1280-rest`] = rest1280;
          await shot(`05-reader-sidenote-rest-${lang}-${theme}-1280`);

          // 2. Focus side-note tab via keyboard -> slides out into 32px icon button with tooltip
          await evaluate(`(() => {
            const btn = document.querySelector('[data-companion-toggle]');
            if (btn) btn.focus();
          })()`);
          await pause(250);
          const expanded1280 = await evaluate(`(() => {
            const btn = document.querySelector('[data-companion-toggle]');
            const tip = document.querySelector('[data-companion-tooltip]');
            const rect = btn.getBoundingClientRect();
            return {
              state: btn.getAttribute('data-state'),
              width: Math.round(rect.width),
              tooltipVisible: !!tip,
              tooltipText: tip ? tip.textContent.trim() : '',
            };
          })()`);
          assert.equal(expanded1280.state, 'expanded');
          assert.equal(expanded1280.width, 32);
          assert.equal(expanded1280.tooltipVisible, true);
          assert.ok(expanded1280.tooltipText.length > 0);
          summary.sideNote[`${lang}-${theme}-1280-expanded`] = expanded1280;
          await shot(`06-reader-sidenote-expanded-${lang}-${theme}-1280`);

          // 3. Test keyboard repositioning (Alt+ArrowDown) and position memory
          await evaluate(`(() => {
            const btn = document.querySelector('[data-companion-toggle]');
            if (btn) {
              btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
            }
          })()`);
          await pause(200);
          const rememberedTop = await evaluate(`JSON.parse(localStorage.getItem('baglib.companion.v1') || '{}').topPercent`);
          assert.equal(rememberedTop, 55, 'Expected Alt+ArrowDown to update remembered topPercent from 50 to 55');

          // Blur back to rest before testing 480px
          await evaluate(`(() => {
            const btn = document.querySelector('[data-companion-toggle]');
            if (btn) btn.blur();
          })()`);
          await pause(200);

          // 4. Resize to 480px and verify side-note tip never covers interactive controls at 480px
          win.setContentSize(480, 800);
          await pause(600);
          const rest480 = await evaluate(`(() => {
            const btn = document.querySelector('[data-companion-toggle]');
            if (!btn) return null;
            const rect = btn.getBoundingClientRect();
            const controls = [...document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="tab"]')]
              .filter(el => el !== btn && !el.hasAttribute('data-companion-toggle') && !el.hasAttribute('data-nav-peek-trigger-edge'));
            const overlapping = controls.filter(el => {
              const r = el.getBoundingClientRect();
              if (r.width <= 0 || r.height <= 0) return false;
              return r.right > rect.left && r.left < rect.right && r.bottom > rect.top && r.top < rect.bottom;
            });
            return {
              state: btn.getAttribute('data-state'),
              edge: btn.getAttribute('data-edge'),
              width: Math.round(rect.width),
              topPercent: Number(btn.getAttribute('data-top-percent')),
              overlappingCount: overlapping.length,
              overlappingTags: overlapping.map(el => el.tagName + ':' + (el.getAttribute('aria-label') || el.textContent || '').slice(0, 30)),
            };
          })()`);
          assert.ok(rest480, `Side-note toggle missing at 480px in ${lang}-${theme}`);
          assert.equal(rest480.state, 'rest');
          assert.ok(rest480.width >= 8 && rest480.width <= 12);
          assert.equal(
            rest480.overlappingCount,
            0,
            `Side-note tip covered ${rest480.overlappingCount} controls at 480px in ${lang}-${theme}: ${JSON.stringify(rest480.overlappingTags)}`
          );
          summary.sideNote[`${lang}-${theme}-480-rest`] = rest480;
          await shot(`07-reader-sidenote-rest-${lang}-${theme}-480`);

          // Close bottom sheet if open at 480px, then restore 1280px
          await evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
          win.setContentSize(1280, 850);
          await pause(400);

          // 5. Open side-note via click, verify pane opens, then close it
          await evaluate(`document.querySelector('[data-companion-toggle]').click()`);
          await until('!!document.querySelector("[data-companion-pane]")');
          await pause(300);
          await shot(`08-reader-sidenote-open-${lang}-${theme}-1280`);
          await evaluate(`(() => {
            const closeBtn = document.querySelector('[data-companion-pane] header button');
            if (closeBtn) closeBtn.click();
          })()`);
          await until('!document.querySelector("[data-companion-pane]") && !!document.querySelector("[data-companion-toggle]")');
        }
      }

      fs.writeFileSync(path.join(evidence, 'summary.json'), JSON.stringify(summary, null, 2));
      console.log('[live] All KEY-315 assertions passed! Summary saved.');
      app.quit();
    } catch (err) {
      console.error('[live] KEY-315 check failed:', err);
      app.exit(1);
    }
  })();
});

require('../../dist/main/index.js');
