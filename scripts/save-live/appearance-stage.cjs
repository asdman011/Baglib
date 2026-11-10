const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { assertSavedAppearances } = require('./appearance-assertions.cjs');
module.exports = async function appearanceStage(context) {
  const { owner, directory, python, book, evaluate, until, load, openBook, policy, drag, key, waitState, inspect, sha, emergency } = context;
  const input = JSON.parse(fs.readFileSync(path.join(directory, 'appearance-input.json')));
  const helper = path.resolve('scripts/save-live/appearance_pdf.py');
  const snapshot = () => JSON.parse(execFileSync(python, ['-I', helper, 'snapshot', book], { encoding: 'utf8', windowsHide: true }));
  const before = snapshot();
  assert.equal(before.owned.length, 0, 'fixture starts without BagLib marks');
  assert.ok(before.foreign.length >= 1);
  const originalHash = sha(book);
  await until('!!window.electronAPI && !!document.querySelector("footer")');
  console.log('AP load', input.language);
  await load(input.language);
  await evaluate(`window.electronAPI.addBook(${JSON.stringify({ id: 'save-work', title: 'علم — Save', author: '', workType: 'book', bookType: 'digital', digitalFormat: 'PDF', filePath: book })})`);
  console.log('AP load', input.language);
  await load(input.language);
  console.log('AP policy');
  await policy('manual');
  console.log('AP open');
  await openBook(input.language);
  console.log('AP opened');
  if (owner.isMaximized()) owner.unmaximize();
  owner.setContentSize(1280, 900);
  await until('innerWidth === 1280');
  owner.show(); owner.focus(); owner.webContents.focus();
  const texts = ['بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ سُكُونۡ', 'English notes and readable text.', 'سورة 2:255 Al-Baqarah'];
  for (const [index, text] of texts.entries()) {
    console.log('AP text', index);
    // Header density changes can replace the toolbar between native resize and React commit.
    await until(`(() => {
      const button = document.querySelector('[data-markup-tool-button=text]');
      if (button) {
        button.click();
        return true;
      }
      document.querySelector('[data-markup-palette],[data-markup-more]')?.click();
      return false;
    })()`);
    await until("!!document.querySelector('[data-pdf-draw-surface=text]')");
    const points = await evaluate(`(()=>{const r=document.querySelector('[data-pdf-draw-surface=text]').getBoundingClientRect();return {from:{x:Math.round(r.x+r.width*0.08),y:Math.round(r.y+r.height*${0.12 + index * 0.16})},to:{x:Math.round(r.x+r.width*0.92),y:Math.round(r.y+r.height*${0.24 + index * 0.16})}};})()`);
    assert.ok(points.from.y > 0 && points.to.y < 900, 'drag endpoints inside native viewport');
    await drag(points.from, points.to);
    await until("!!document.querySelector('[data-mark-text]')");
    await evaluate("document.querySelector('[data-mark-text]').focus()");
    owner.webContents.insertText(text);
    await until(`document.querySelector('[data-mark-text]').value === ${JSON.stringify(text)}`);
    await evaluate("document.querySelector('[data-mark-save]').click()");
    await until(`window.electronAPI.knowledge.getByWork('save-work').then(rows=>rows.filter(row=>row.noteContent?.includes(${JSON.stringify(text)})).length===1)`);
    await evaluate("document.querySelector('[data-mark-popover-close]').click()");
    await until("!document.querySelector('[data-mark-text]')");
  }
  await waitState('recorded');
  assert.equal(sha(book), originalHash, 'manual edits leave PDF unchanged before Save');
  assert.equal(emergency().length, 0);
  await evaluate('document.activeElement?.blur()');
  await key('s', { ctrl: true });
  await waitState('saved', 240);
  const first = snapshot();
  const inspected = inspect(book);
  assert.equal(inspected.owned, 3);
  assert.equal(inspected.outside, before.foreign.length);
  assert.deepEqual(first.owned.map(a => a.text).sort(), [...texts].sort());
  assert.equal(emergency().length, 1);
  assert.equal(sha(path.join(directory, 'emergency-copies', emergency()[0])), originalHash);
  fs.copyFileSync(book, path.join(input.evidence, 'first-save.pdf'));
  // Force a second actual write through normal reader UI by re-saving the unchanged text.
  await evaluate("document.querySelector('[data-pdf-mark=text]').click()");
  await until("!!document.querySelector('[data-mark-save]')");
  await evaluate("document.querySelector('[data-mark-save]').click()");
  await evaluate("document.querySelector('[data-mark-popover-close]').click()");
  await until("!document.querySelector('[data-mark-save]')");
  await waitState('recorded');
  await evaluate('document.activeElement?.blur()');
  await key('s', { ctrl: true });
  await waitState('saved', 240);
  const second = snapshot();
  assertSavedAppearances(before, first, second);
  assert.equal(emergency().length, 1);
  assert.equal(sha(path.join(directory, 'emergency-copies', emergency()[0])), sha(path.join(input.evidence, 'first-save.pdf')));
  execFileSync(python, ['-I', helper, 'render', book, path.join(input.evidence, 'pdfium-2x')], { windowsHide: true });
  const layouts = [];
  for (const width of [1280, 480]) {
    if (owner.isMaximized()) owner.unmaximize();
    owner.setContentSize(width, 900);
    await until(`innerWidth === ${width}`);
    await new Promise(resolve => setTimeout(resolve, 700));
    const layout = await evaluate("({lang:document.documentElement.lang,dir:document.documentElement.dir,width:innerWidth,scroll:document.documentElement.scrollWidth,marks:document.querySelectorAll('[data-pdf-mark=text]').length})");
    assert.equal(layout.width, width);
    assert.equal(layout.lang, input.language);
    assert.equal(layout.dir, input.language === 'ar' ? 'rtl' : 'ltr');
    assert.ok(layout.scroll <= layout.width);
    assert.equal(layout.marks, 3);
    fs.writeFileSync(path.join(input.evidence, `reader-${width}.png`), (await owner.webContents.capturePage()).toPNG());
    layouts.push(layout);
  }
  fs.writeFileSync(path.join(input.evidence, 'results.json'), JSON.stringify({ ...input, before, first, second, inspected, layouts, originalHash, backups: emergency() }, null, 2));
  console.log(JSON.stringify({ appearancePass: input.language, documentLanguage: input.documentLanguage, fonts: [first.fonts, second.fonts] }));
};
