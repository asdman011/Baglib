const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

module.exports = {
  async execute({ win, evaluate, until, shot, click, input, lang, labels, books, evidence, pause, profile }) {
    console.log('KEY-369 Scenario: starting Export/Import verification...');

    // 1. Prepare mock image asset in manuscript-assets/ via researchEditor.blobs API
    await evaluate(`(async () => {
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=';
      const binaryString = atob(pngBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      await window.electronAPI.researchEditor.blobs.set('sample-manuscript-asset', {
        bytes,
        type: 'image/png'
      });
    })()`);

    // 2. Find pre-seeded manuscript
    const manuscript = await evaluate(`(async () => {
      const list = await window.electronAPI.manuscripts.list();
      return list.find(m => m.title.includes('دراسة بلاغية'));
    })()`);
    assert.ok(manuscript, 'pre-seeded manuscript found in database');
    console.log('Using manuscript:', manuscript.id, manuscript.title);

    // 3. Test Export for all 4 formats via API
    console.log('Testing Export API for all 4 formats...');

    // A. Markdown Export
    const mdResult = await evaluate(`window.electronAPI.manuscripts.export({
      manuscriptId: ${JSON.stringify(manuscript.id)},
      format: 'markdown'
    })`);
    assert.ok(mdResult.content, 'markdown content returned');
    assert.ok(mdResult.content.includes('# الفصل الأول'), 'md includes chapter 1 title');
    assert.ok(mdResult.content.includes('اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ'), 'md includes ayah');
    assert.ok(mdResult.content.includes('عَلى قَدْرِ أَهْلِ العَزْمِ'), 'md includes poetry');
    assert.ok(mdResult.content.includes('[^1]:'), 'md includes footnotes');
    fs.writeFileSync(path.join(evidence, 'manuscript-export.md'), mdResult.content, 'utf8');

    // B. HTML Export
    const htmlResult = await evaluate(`window.electronAPI.manuscripts.export({
      manuscriptId: ${JSON.stringify(manuscript.id)},
      format: 'html'
    })`);
    assert.ok(htmlResult.content, 'html content returned');
    assert.ok(htmlResult.content.includes('<!DOCTYPE html>'), 'valid HTML5');
    assert.ok(htmlResult.content.includes('dir="rtl"'), 'HTML has RTL dir');
    assert.ok(htmlResult.content.includes('class="baglib-poetry-table"'), 'HTML has poetry table');
    assert.ok(htmlResult.content.includes('data:image/png;base64,'), 'HTML has embedded image');
    assert.ok(htmlResult.content.includes('class="chapter-footnotes"'), 'HTML has footnotes section');
    fs.writeFileSync(path.join(evidence, 'manuscript-export.html'), htmlResult.content, 'utf8');

    // C. PDF Export
    const pdfResult = await evaluate(`window.electronAPI.manuscripts.export({
      manuscriptId: ${JSON.stringify(manuscript.id)},
      format: 'pdf',
      pageSize: 'A4',
      margins: 'normal'
    })`);
    assert.ok(pdfResult.base64, 'pdf base64 returned');
    const pdfBuf = Buffer.from(pdfResult.base64, 'base64');
    assert.ok(pdfBuf.length > 5000, 'pdf buffer has content');
    assert.equal(pdfBuf.subarray(0, 5).toString('ascii'), '%PDF-', 'valid PDF header');
    fs.writeFileSync(path.join(evidence, 'manuscript-export.pdf'), pdfBuf);

    // D. DOCX Export
    const docxResult = await evaluate(`window.electronAPI.manuscripts.export({
      manuscriptId: ${JSON.stringify(manuscript.id)},
      format: 'docx',
      pageSize: 'A4',
      margins: 'normal'
    })`);
    assert.ok(docxResult.base64, 'docx base64 returned');
    const docxBuf = Buffer.from(docxResult.base64, 'base64');
    assert.ok(docxBuf.length > 5000, 'docx buffer has content');
    assert.equal(docxBuf[0], 0x50, 'valid zip header PK');
    assert.equal(docxBuf[1], 0x4b, 'valid zip header PK');
    fs.writeFileSync(path.join(evidence, 'manuscript-export.docx'), docxBuf);

    console.log('All 4 export formats generated and verified on disk in evidence directory!');

    // 4. Test Import: Quick Note and Markdown
    console.log('Testing Import API...');
    const importNoteResult = await evaluate(`window.electronAPI.manuscripts.importNote({
      manuscriptId: ${JSON.stringify(manuscript.id)},
      noteId: 'quick-note-tafsir-1'
    })`);
    assert.ok(importNoteResult.id, 'quick note imported');
    assert.equal(importNoteResult.title, 'فوائد في التفسير واللغة');

    const importMdResult = await evaluate(`window.electronAPI.manuscripts.importMarkdown({
      manuscriptId: ${JSON.stringify(manuscript.id)},
      markdown: '# فصل مستورد عبر الماركداون\\n\\nفقرة تمهيدية من ملف مستورد.\\n\\n- فائدة أولى\\n- فائدة ثانية'
    })`);
    assert.ok(importMdResult.id, 'markdown chapter imported');
    assert.equal(importMdResult.title, 'فصل مستورد عبر الماركداون');

    // 5. Navigate to Editor in UI
    await until('!!document.querySelector(\'[data-nav-item="notes-editor"]\')');
    await click('[data-nav-item="notes-editor"]');
    await pause(600);

    // Click on the manuscript in sidebar
    await until('!!document.querySelector(".research-sidebar-manuscript-row")');
    await evaluate(`(()=>{
      const row = Array.from(document.querySelectorAll('.research-sidebar-manuscript-row')).find(b => b.innerText.includes('دراسة بلاغية'));
      if (row) row.click();
    })()`);
    await pause(400);

    // Click on the first chapter document in tree
    await until('!!document.querySelector(".research-sidebar-tree-row")');
    await evaluate(`(()=>{
      const docBtn = Array.from(document.querySelectorAll('.research-sidebar-tree-row')).find(b => b.innerText.includes('الفصل الأول'));
      if (docBtn) docBtn.click();
    })()`);
    await pause(800);

    // Screenshot 1: Arabic Editor View with loaded chapter
    await shot('01-editor-initial-ar');

    // Open TopBar menu
    await until('!!document.querySelector(".research-top-btn svg.lucide-ellipsis, .research-top-btn svg.lucide-more-horizontal")');
    await evaluate(`(()=>{
      const btn = Array.from(document.querySelectorAll('.research-top-btn')).find(b => b.querySelector('svg.lucide-ellipsis, svg.lucide-more-horizontal'));
      if (btn) btn.click();
    })()`);
    await pause(400);

    // Screenshot 2: TopBar menu showing Export and Import options
    await shot('02-top-bar-menu-ar');

    // Click Export Modal option from menu
    await evaluate(`(()=>{
      const item = Array.from(document.querySelectorAll('.research-top-menu-item')).find(i => i.innerText.includes('تصدير المخطوط'));
      if (item) item.click();
    })()`);
    await pause(400);

    // Screenshot 3: Export Modal with format and scope options
    await until('!!document.querySelector(\'[role="dialog"][aria-labelledby="export-modal-title"]\')');
    await shot('03-export-modal-ar');

    // Close export modal
    await evaluate(`(()=>{
      const closeBtn = document.querySelector('[role="dialog"] button');
      if (closeBtn) closeBtn.click();
    })()`);
    await pause(300);

    // Open Import Modal from sidebar Import button
    await until('!!document.querySelector(\'button[title="استيراد"]\')');
    await click('button[title="استيراد"]');
    await pause(400);

    // Screenshot 4: Import Modal on Quick Notes tab
    await until('!!document.querySelector(\'[role="dialog"][aria-labelledby="import-modal-title"]\')');
    await shot('04-import-modal-notes-ar');

    // Switch to Markdown tab in Import Modal
    await evaluate(`(()=>{
      const tabBtn = Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => b.innerText.includes('Markdown'));
      if (tabBtn) tabBtn.click();
    })()`);
    await pause(300);

    // Screenshot 5: Import Modal on Markdown tab
    await shot('05-import-modal-markdown-ar');

    // Close import modal
    await evaluate(`(()=>{
      const cancelBtn = Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => b.innerText.includes('إلغاء'));
      if (cancelBtn) cancelBtn.click();
    })()`);
    await pause(400);

    // Switch Language to English (LTR)
    await lang('en');
    await pause(600);

    // Screenshot 6: English Editor View
    await shot('06-editor-initial-en');

    // Open Export Modal in English
    await evaluate(`(()=>{
      const btn = Array.from(document.querySelectorAll('.research-top-btn')).find(b => b.querySelector('svg.lucide-ellipsis, svg.lucide-more-horizontal'));
      if (btn) btn.click();
    })()`);
    await pause(400);
    await evaluate(`(()=>{
      const item = Array.from(document.querySelectorAll('.research-top-menu-item')).find(i => i.innerText.includes('Export Manuscript'));
      if (item) item.click();
    })()`);
    await pause(400);

    // Screenshot 7: Export Modal in English (LTR)
    await shot('07-export-modal-en');

    // Close export modal
    await evaluate(`(()=>{
      const closeBtn = document.querySelector('[role="dialog"] button');
      if (closeBtn) closeBtn.click();
    })()`);
    await pause(300);

    // Open Import Modal in English
    await evaluate(`(()=>{
      const btns = [...document.querySelectorAll('.research-sidebar button')];
      const target = btns.find(b => b.textContent.includes('Import') || b.title === 'Import');
      if (target) target.click();
    })()`);
    await pause(400);

    // Screenshot 8: Import Modal in English (LTR)
    await until('!!document.querySelector(\'[role="dialog"][aria-labelledby="import-modal-title"]\')');
    await shot('08-import-modal-en');

    // Close import modal
    await evaluate(`(()=>{
      const cancelBtn = Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => b.innerText.includes('Cancel'));
      if (cancelBtn) cancelBtn.click();
    })()`);
    await pause(300);

    // Return language to Arabic
    await lang('ar');
    await pause(400);

    return {
      exportedFiles: [
        'manuscript-export.md',
        'manuscript-export.html',
        'manuscript-export.pdf',
        'manuscript-export.docx'
      ],
      screenshots: [
        '01-editor-initial-ar.png',
        '02-top-bar-menu-ar.png',
        '03-export-modal-ar.png',
        '04-import-modal-notes-ar.png',
        '05-import-modal-markdown-ar.png',
        '06-editor-initial-en.png',
        '07-export-modal-en.png',
        '08-import-modal-en.png'
      ]
    };
  }
};
