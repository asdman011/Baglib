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

  // 1. Start with Arabic (RTL)
  await lang('ar');
  const tAr = labels.ar;

  await click('[data-nav-item=notes-editor]');
  await until('window.__baglibResearchEditor?.ready', true);

  // Create research manuscript in Arabic
  await input('[aria-label=' + JSON.stringify(tAr.manuscriptNew) + ']', 'KEY-368 دراسة المصادر واللوحة');
  await click('.manuscript-list form button[type=submit]');
  await until('!!document.querySelector("[data-manuscript-tree]")');

  // Create chapter
  await input('[aria-label=' + JSON.stringify(tAr.manuscriptChapterNew) + ']', 'الفصل الأول: تخريج وترتيب');
  await click('[data-manuscript-tree] form button[type=submit]');
  await until('!!document.querySelector("[data-document-id]")');

  const id = await evaluate('document.querySelector("[data-document-id]").dataset.documentId');
  await click('[data-document-id=' + JSON.stringify(id) + '] .manuscript-name');
  await until(`window.__baglibResearchEditor.editor.doc.id===${JSON.stringify(id)}`, true);
  await pause(400);

  // Populate editor with source blocks (Quran, Sunnah, Poetry, Book quote, plus a text paragraph)
  await edit(`(()=>{
    const e = window.__baglibResearchEditor.editor;
    const d = e.doc;
    const note = d.getModelsByFlavour('affine:note')[0];
    if (!note) throw Error('no note block');
    
    // Clear initial empty paragraphs
    for (const child of [...note.children]) {
      d.deleteBlock(child);
    }
    
    // 1. Text Paragraph
    const paraId = d.addBlock('affine:paragraph', {}, note.id);
    const paraModel = d.getBlock(paraId)?.model;
    if (paraModel && paraModel.text) {
      paraModel.text.insert('مقدمة تمهيدية في تحقيق نصوص الباب ومصادره المقارنة.', 0);
    }
    
    // 2. Quran ayah
    d.addBlock('baglib:ayah', {
      url: 'quran:hafs:2:255',
      label: 'سورة البقرة — آية ٢٥٥',
      text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ',
      grade: '',
      verses: []
    }, note.id);
    
    // 3. Prophetic Hadith
    d.addBlock('baglib:hadith', {
      url: 'sunnah:bukhari:1:1',
      label: 'صحيح البخاري — كتاب بدء الوحي',
      text: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى',
      grade: 'صحيح',
      verses: []
    }, note.id);
    
    // 4. Arabic Poetry
    d.addBlock('baglib:verse', {
      url: 'poetry:ashaar:10:0:3',
      label: 'الشعر العربي — ديوان الحماسة',
      text: '',
      grade: '',
      verses: [
        { sadr: 'إذا المرء لم يدنس من اللؤم عرضه', ajuz: 'فكل رداء يرتديه جميل' },
        { sadr: 'وإن هو لم يحمل على النفس ضيمها', ajuz: 'فليس إلى حسن الثناء سبيل' }
      ]
    }, note.id);
    
    // 5. Book Quote
    d.addBlock('baglib:book-quote', {
      url: 'book:work@source#p=15',
      label: 'المقتطفات — كتاب منهاج الطالبين',
      text: 'وهذا الحديث أصل عظيم من أصول الشريعة وقاعدة تدور عليها غالب الأحكام.',
      grade: '',
      verses: []
    }, note.id);
    
    d.captureSync();
  })()`);

  await pause(500);

  // Screenshot 01: Initial Arabic Document View
  await shot('01-canvas-page-ar');
  records.push({ step: 'document-view-ar', status: 'ok' });

  // 2. Click "Arrange Sources"
  await click('[data-action=arrange-sources]');
  await until(`window.__baglibResearchEditor.mode === 'edgeless'`, true);
  await until(`window.__baglibResearchEditor.editor.doc.getModelsByFlavour('affine:frame').length === 4`, true);
  await pause(600);

  // Verify frames
  const framesAr = await edit(`(()=>{
    const fs = window.__baglibResearchEditor.editor.doc.getModelsByFlavour('affine:frame');
    return fs.map(f => {
      const titleObj = f.title || f.props?.title;
      const childMap = f.childElementIds || f.props?.childElementIds || {};
      return {
        title: titleObj?.toString() || (typeof titleObj === 'string' ? titleObj : ''),
        childCount: f.childIds ? f.childIds.length : Object.keys(childMap).length
      };
    });
  })()`);
  console.log('[KEY-368 DEBUG] framesAr:', JSON.stringify(framesAr));
  assert.equal(framesAr.length, 4, '4 titled frames in Arabic');
  const frameTitlesAr = framesAr.map(f => f.title);
  assert.ok(frameTitlesAr.includes('القرآن الكريم'), 'Quran frame exists');
  assert.ok(frameTitlesAr.includes('السنة النبوية'), 'Sunnah frame exists');
  assert.ok(frameTitlesAr.includes('الشعر العربي'), 'Poetry frame exists');
  assert.ok(frameTitlesAr.includes('المقتطفات والمراجع'), 'Book quotes frame exists');

  // Screenshot 02: Auto-arranged sources in 4 titled frames on edgeless canvas
  await shot('02-arrange-sources-ar');
  records.push({ step: 'arrange-sources-ar', frames: framesAr, status: 'ok' });

  // 3. Click "Tasks Kanban"
  await click('[data-action=tasks-kanban]');
  await until(`window.__baglibResearchEditor.editor.doc.getModelsByFlavour('affine:database').length >= 1`, true);
  await pause(500);

  // Screenshot 03: Tasks Kanban inserted on canvas
  await shot('03-tasks-kanban-ar');
  records.push({ step: 'tasks-kanban-ar', status: 'ok' });

  // 4. Click "Undo Arrange"
  await click('[data-action=undo-arrange]');
  await until(`window.__baglibResearchEditor.mode === 'page'`, true);
  await until(`window.__baglibResearchEditor.editor.doc.getModelsByFlavour('affine:frame').length === 0`, true);
  await pause(500);

  // Screenshot 04: Undo arrange restored document view
  await shot('04-undo-arrange-ar');
  records.push({ step: 'undo-arrange-ar', status: 'ok' });

  // 5. Link a Study Board
  await click('[data-action=link-board]');
  await until('!!document.querySelector(".board-picker-modal")');
  await pause(200);

  // Click "Create and link new board"
  await click('[data-action=create-and-link-board]');
  await until('!!document.querySelector(".linked-board-badge")');
  await pause(300);

  // Click "Open study board"
  await click('[data-action=open-linked-board]');
  await until('!!document.querySelector("[data-boards]")');
  await pause(300);
  // Open the board if on gallery view
  await evaluate(`(()=>{
    const card = document.querySelector('[data-boards-entry] button') || document.querySelector('[data-boards-entry]');
    if (card) card.click();
  })()`);
  await until('!!document.querySelector(".linked-manuscript-indicator, [data-action=open-linked-manuscript]")');
  await pause(400);

  // Screenshot 05: Linked study board opened with manuscript jump indicator
  await shot('05-linked-study-board-ar');
  records.push({ step: 'linked-study-board-ar', status: 'ok' });

  // Jump back to Research Editor
  await click('[data-action=open-linked-manuscript], .linked-manuscript-indicator');
  await until('window.__baglibResearchEditor?.ready', true);
  await pause(400);

  // 6. Switch to English (LTR)
  await lang('en');
  const tEn = labels.en;
  await pause(400);

  // If chapter list is showing, select manuscript and open chapter
  const needsOpen = await evaluate('!document.querySelector("[data-action=mode-canvas]")');
  if (needsOpen) {
    if (!await evaluate('!!document.querySelector("[data-manuscript-tree]")')) {
      await click('.manuscript-projects .manuscript-name');
      await until('!!document.querySelector("[data-manuscript-tree]")');
      await pause(200);
    }
    const docId = await evaluate('document.querySelector("[data-document-id]")?.dataset.documentId');
    if (docId) {
      await click('[data-document-id=' + JSON.stringify(docId) + '] .manuscript-name');
      await until('window.__baglibResearchEditor?.ready', true);
      await until('!!document.querySelector("[data-action=mode-canvas]")');
      await pause(400);
    }
  }

  // Toggle mode to Canvas
  await click('[data-action=mode-canvas]');
  await until(`window.__baglibResearchEditor.mode === 'edgeless'`, true);
  await pause(300);

  // Click Arrange Sources in English
  await click('[data-action=arrange-sources]');
  await until(`window.__baglibResearchEditor.editor.doc.getModelsByFlavour('affine:frame').length === 4`, true);
  await pause(500);

  // Verify English frame titles
  const framesEn = await edit(`(()=>{
    const fs = window.__baglibResearchEditor.editor.doc.getModelsByFlavour('affine:frame');
    return fs.map(f => {
      const titleObj = f.title || f.props?.title;
      return titleObj?.toString() || (typeof titleObj === 'string' ? titleObj : '');
    });
  })()`);
  assert.ok(framesEn.includes('Noble Quran'), 'Noble Quran frame exists');
  assert.ok(framesEn.includes('Prophetic Sunnah'), 'Prophetic Sunnah frame exists');
  assert.ok(framesEn.includes('Arabic Poetry'), 'Arabic Poetry frame exists');
  assert.ok(framesEn.includes('Book Quotes'), 'Book Quotes frame exists');

  // Screenshot 06: English LTR canvas view with 4 frames
  await shot('06-canvas-board-en');
  records.push({ step: 'canvas-board-en', frames: framesEn, status: 'ok' });

  return records;
};
