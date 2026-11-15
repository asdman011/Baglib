const assert = require('node:assert/strict');

module.exports = async function scenario({
  win,
  evaluate,
  edit,
  until,
  shot,
  click,
  input,
  lang,
  labels,
  books,
  evidence,
  pause,
}) {
  const records = [];

  // =========================================================================
  // 1. ARABIC (RTL) TEST SUITE
  // =========================================================================
  await lang('ar');
  const tAr = labels.ar;

  await click('[data-nav-item=notes-editor]');
  await until('!!document.querySelector(".research-sidebar")');

  // Verify initial sidebar elements
  assert.ok(await evaluate('!!document.querySelector(".research-sidebar-header")'), 'sidebar header present');
  assert.ok(await evaluate('!!document.querySelector(".research-sidebar-search")'), 'sidebar search present');

  // Create new manuscript in Arabic
  await click('button[aria-label=' + JSON.stringify(tAr.researchNewManuscript) + ']');
  await until('!!document.querySelector(".research-sidebar form input")');
  await input('.research-sidebar form input', 'KEY-378 دراسة المخطوط والواجهة');
  await evaluate('document.querySelector(".research-sidebar form button[type=submit]").click()');
  await until('!!document.querySelector(".research-sidebar-manuscript-group")');

  // Add chapter to the manuscript
  const addChapterBtn = await evaluate(`(() => {
    const btn = document.querySelector('.research-sidebar-manuscript-row button[title=' + JSON.stringify(${JSON.stringify(tAr.researchNewChapter)}) + ']');
    return !!btn;
  })()`);
  assert.ok(addChapterBtn, 'add chapter button exists');

  await evaluate(`document.querySelector('.research-sidebar-manuscript-row button[title=' + JSON.stringify(${JSON.stringify(tAr.researchNewChapter)}) + ']').click()`);
  await until('!!document.querySelector(".research-sidebar-manuscript-group form input")');
  await input('.research-sidebar-manuscript-group form input', 'الفصل التمهيدي: مناهج التحقيق والتوثيق');
  await evaluate('document.querySelector(".research-sidebar-manuscript-group form button[type=submit]").click()');
  await pause(300);

  // Open the created chapter
  await until('!!document.querySelector(".research-sidebar-tree-row")');
  await evaluate('document.querySelector(".research-sidebar-tree-row").click()');
  await until('window.__baglibResearchEditor?.ready', true);
  await pause(400);

  // Inject content with headings into BlockSuite document
  await edit(`(()=>{
    const e = window.__baglibResearchEditor.editor;
    const d = e.doc;
    const note = d.getModelsByFlavour('affine:note')[0];
    if (!note) return;
    for (const child of [...note.children]) d.deleteBlock(child);

    // H1
    const h1Id = d.addBlock('affine:paragraph', { type: 'h1' }, note.id);
    d.getBlock(h1Id).model.text.insert('المبحث الأول: مدخل إلى أصول التوثيق والتحقيق الأكاديمي', 0);

    // Paragraph
    const p1Id = d.addBlock('affine:paragraph', {}, note.id);
    d.getBlock(p1Id).model.text.insert('يتناول هذا البحث دراسة منهجية للمخطوطات العربية مع المقارنة بين النسخ المعتمدة.', 0);

    // H2
    const h2Id = d.addBlock('affine:paragraph', { type: 'h2' }, note.id);
    d.getBlock(h2Id).model.text.insert('المطلب الأول: جمع الشواهد وفحص النسخ الخطية', 0);

    // Paragraph
    const p2Id = d.addBlock('affine:paragraph', {}, note.id);
    d.getBlock(p2Id).model.text.insert('تم الرجوع إلى نسخة المكتبة الظاهرية ونسخة دار الكتب المصرية للمطابقة.', 0);

    d.captureSync();
  })()`);
  await pause(400);

  // 1. TopBar tests
  await until('!!document.querySelector(".research-top-bar")');
  assert.ok(await evaluate('!!document.querySelector(".research-title-display")'), 'title display exists');

  // Star favourite toggle
  await click('button[aria-label=' + JSON.stringify(tAr.researchAddToFavourites) + ']');
  await pause(200);
  const isFav = await evaluate('document.querySelector(".research-top-bar button[aria-pressed=\\"true\\"]") !== null');
  assert.ok(isFav, 'favourite star active');

  // Mode Switch: Page -> Edgeless
  await click('button[aria-label=' + JSON.stringify(tAr.researchEdgelessMode) + ']');
  await pause(500);
  await until('!!document.querySelector(".research-zoom-controls")');
  await until('!!document.querySelector(".research-toolbar-pill")');

  // Test zoom controls
  await click('button[aria-label=' + JSON.stringify(tAr.researchZoomIn) + ']');
  await pause(100);
  await click('button[aria-label=' + JSON.stringify(tAr.researchZoomFit) + ']');
  await pause(100);

  // Take screenshot: Edgeless floating controls
  await shot('01-ar-edgeless-toolbar');
  records.push('Arabic Edgeless mode with zoom and pill toolbar verified');

  // Mode Switch: Edgeless -> Page
  await click('button[aria-label=' + JSON.stringify(tAr.researchPageMode) + ']');
  await pause(400);

  // 2. Table of Contents / Outline Rail
  await until('!!document.querySelector(".research-outline-rail")');
  await click('.research-outline-rail');
  await until('!!document.querySelector(".research-outline-popover")');
  await shot('02-ar-outline-popover');
  records.push('Arabic Outline rail and popover verified');

  // Close outline popover by clicking outside or toggling
  await click('.research-outline-rail');
  await pause(200);

  // 3. AI Floating Sparkles Button & Drawer (RE-12 BYOK)
  await until('!!document.querySelector(".research-ai-fab")');
  await click('.research-ai-fab');
  await until('!!document.querySelector(".research-ai-drawer")');

  // Send an AI prompt
  await click('.research-ai-prompt-chip');
  await until('document.querySelectorAll(".research-ai-message").length >= 2');
  await shot('03-ar-ai-drawer');
  records.push('Arabic AI FAB and BYOK drawer verified');

  // Close AI drawer
  await click('.research-ai-drawer-header button');
  await pause(200);

  // 4. Document Info Drawer
  await click('button[aria-label=' + JSON.stringify(tAr.researchViewInfo) + ']');
  await until('!!document.querySelector(".research-info-drawer")');
  await shot('04-ar-info-drawer');
  records.push('Arabic Info drawer with stats verified');

  // Close Info drawer
  await click('.research-info-header button');
  await pause(200);

  // 5. Scholarly Templates Modal
  await evaluate(`(()=>{
    const btns = [...document.querySelectorAll('.research-sidebar button')];
    const target = btns.find(b => b.textContent.includes(${JSON.stringify(tAr.researchTemplates)}));
    if (target) target.click();
  })()`);
  await until('!!document.querySelector(".research-template-card")');
  assert.equal(await evaluate('document.querySelectorAll(".research-template-item").length'), 4, '4 templates rendered');
  await shot('05-ar-templates-modal');
  records.push('Arabic Scholarly Templates modal verified (4 templates)');

  // Close templates modal
  await click('.research-template-header button');
  await pause(200);

  // 6. Version History Checkpoints Modal
  await click('button[aria-label=' + JSON.stringify(tAr.reSettings || 'Options') + ']');
  await until('!!document.querySelector(".research-top-menu")');
  await evaluate(`(()=>{
    const items = [...document.querySelectorAll('.research-top-menu-item')];
    const target = items.find(i => i.textContent.includes(${JSON.stringify(tAr.researchViewHistory)}));
    if (target) target.click();
  })()`);
  await until('!!document.querySelector(".research-history-card")');
  await shot('06-ar-history-modal');
  records.push('Arabic Version Checkpoints modal verified');

  // Close history modal
  await click('.research-history-header button');
  await pause(200);

  // Take screenshot: Complete Arabic Page Shell
  await shot('07-ar-page-shell');
  records.push('Arabic Page shell complete screenshot captured');

  // =========================================================================
  // 2. ENGLISH (LTR) TEST SUITE & MIRRORING VERIFICATION
  // =========================================================================
  await lang('en');
  const tEn = labels.en;
  await pause(400);

  // Verify LTR direction
  const isLtr = await evaluate('document.documentElement.dir === "ltr"');
  assert.ok(isLtr, 'document direction is LTR');

  // Verify sidebar on start/left and TOC on end/right
  const sidebarRect = await evaluate('(() => { const r = document.querySelector(".research-sidebar").getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; })()');
  console.log('LTR sidebarRect:', sidebarRect);
  assert.ok(sidebarRect.left < 200, 'sidebar on the left in LTR');

  await shot('08-en-page-shell');
  records.push('English LTR page shell layout verified');

  // Switch to Edgeless in English
  await click('button[aria-label=' + JSON.stringify(tEn.researchEdgelessMode) + ']');
  await pause(500);
  await until('!!document.querySelector(".research-zoom-controls")');
  await until('!!document.querySelector(".research-toolbar-pill")');

  await shot('09-en-edgeless-toolbar');
  records.push('English LTR Edgeless floating controls verified');

  return records;
};
