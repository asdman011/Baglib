// Live verification harness for KEY-274: EPUB Markup Tools, Marks List, and Undo/Redo.
// Verifies ADR-012 byte-identical preservation of EPUB files, RTL/LTR layout, and CFI anchoring.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';
import { zipSync, strToU8 } from 'fflate';

function getFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function createArabicEpubBuffer() {
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:arabic-test-epub</dc:identifier>
    <dc:title>العلم والعمل</dc:title>
    <dc:creator>أبو حامد الغزالي</dc:creator>
    <dc:language>ar</dc:language>
  </metadata>
  <manifest>
    <item id="chap1" href="chap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chap2" href="chap2.xhtml" media-type="application/xhtml+xml"/>
    <item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="toc">
    <itemref idref="chap1"/>
    <itemref idref="chap2"/>
  </spine>
</package>`;

  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:arabic-test-epub"/></head>
  <docTitle><text>العلم والعمل</text></docTitle>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel><text>الفصل الأول: فضل العلم</text></navLabel>
      <content src="chap1.xhtml"/>
    </navPoint>
    <navPoint id="navpoint-2" playOrder="2">
      <navLabel><text>الفصل الثاني: ثمرة العمل</text></navLabel>
      <content src="chap2.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;

  const chap1 = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" dir="rtl" lang="ar">
<head><title>الفصل الأول: فضل العلم</title></head>
<body>
  <h1>الفصل الأول: فضل العلم</h1>
  <p>العلم يرفع بيتًا لا عماد له والجهل يهدم بيت العز والشرف وطلب العلم فريضة محكمة.</p>
  <p>قال الإمام أبو حامد الغزالي: اعلم أن العلم من غير عمل جنون، والعمل بغير علم لا يكون.</p>
  <p>وقد أجمع العلماء على أن أشرف العلوم ما قاد إلى خشية الله تعالى ومعرفة حدوده.</p>
</body>
</html>`;

  const chap2 = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" dir="rtl" lang="ar">
<head><title>الفصل الثاني: ثمرة العمل</title></head>
<body>
  <h1>الفصل الثاني: ثمرة العمل</h1>
  <p>والعمل بالعلم هو الثمرة الحقيقية التي تثبت بها المعرفة وتزكو بها النفس.</p>
  <p>ومن رزق العلم والعمل فقد حاز سعادة الدارين ووفق لخير المسالك.</p>
  <p>فكن حريصًا على مطابقة قولك لفعلك في السر والعلن وفي جميع الأحوال.</p>
</body>
</html>`;

  return Buffer.from(zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(containerXml),
    'OEBPS/content.opf': strToU8(contentOpf),
    'OEBPS/toc.ncx': strToU8(tocNcx),
    'OEBPS/chap1.xhtml': strToU8(chap1),
    'OEBPS/chap2.xhtml': strToU8(chap2),
  }, { level: 0 }));
}

async function main() {
  const directory = fs.mkdtempSync(path.resolve('.baglib-data/epub-markup-live-'));
  const evidenceDir = path.resolve('.baglib-data/key274-evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });

  console.log(`[epub-markup-live] Using temporary data directory: ${directory}`);

  // 1. Prepare Arabic EPUB
  const arabicEpubPath = path.join(directory, 'arabic-test.epub');
  fs.writeFileSync(arabicEpubPath, createArabicEpubBuffer());

  // 2. Prepare English EPUBs (from real files: small text and large textbook)
  const realEnglishSmallEpub = path.resolve(
    'tests/real-files/epub/en/Why Would Feminists Trust the Police -- Leah Cowan -- Verso 2024 -- Anna’s Archive.epub'
  );
  const realEnglishTextbookEpub = path.resolve(
    'tests/real-files/epub/en/Fundamentals of Cost Accounting - Lanen, William;Anderson, Shanno.epub'
  );
  const englishEpubPath = path.join(directory, 'english-test.epub');
  const englishTextbookPath = path.join(directory, 'english-textbook.epub');
  fs.copyFileSync(realEnglishSmallEpub, englishEpubPath);
  fs.copyFileSync(realEnglishTextbookEpub, englishTextbookPath);

  // 3. Record Initial SHA-256 Hashes
  const initialArabicHash = getFileHash(arabicEpubPath);
  const initialEnglishHash = getFileHash(englishEpubPath);
  const initialTextbookHash = getFileHash(englishTextbookPath);
  console.log(`[epub-markup-live] Initial Arabic EPUB Hash:   ${initialArabicHash}`);
  console.log(`[epub-markup-live] Initial English Small Hash:  ${initialEnglishHash}`);
  console.log(`[epub-markup-live] Initial English Textbook:    ${initialTextbookHash}`);

  // 4. Connect to running renderer on port 3000

  // 5. Spawn Electron Test Runner
  const env = {
    ...process.env,
    BAGLIB_DATA_DIR: directory,
    BAGLIB_MARKUP_LIVE_DIR: directory,
  };
  delete env.ELECTRON_RUN_AS_NODE;

  console.log('[epub-markup-live] Launching Electron harness...');
  const child = spawn(
    electron,
    [
      'scripts/epub-markup-live/main.cjs',
      `--user-data-dir=${directory}`,
      '--disable-features=CalculateNativeWinOcclusion',
    ],
    { env, stdio: 'inherit', windowsHide: true }
  );

  const timeoutTimer = setTimeout(() => {
    console.error('[epub-markup-live] Test timed out after 300 seconds!');
    child.kill();
  }, 300000);

  child.on('exit', (code) => {
    clearTimeout(timeoutTimer);
    console.log(`[epub-markup-live] Electron process exited with code ${code}`);

    // 6. Verify EPUB File Hashes Remained 100% Byte-Identical (ADR-012)
    const finalArabicHash = getFileHash(arabicEpubPath);
    const finalEnglishHash = getFileHash(englishEpubPath);
    const finalTextbookHash = getFileHash(englishTextbookPath);

    console.log(`[epub-markup-live] Final Arabic EPUB Hash:   ${finalArabicHash}`);
    console.log(`[epub-markup-live] Final English Small Hash:  ${finalEnglishHash}`);
    console.log(`[epub-markup-live] Final English Textbook:    ${finalTextbookHash}`);

    if (finalArabicHash !== initialArabicHash) {
      console.error('[epub-markup-live] CRITICAL ERROR: Arabic EPUB was modified on disk! Violates ADR-012.');
      process.exitCode = 1;
      return;
    }
    if (finalEnglishHash !== initialEnglishHash) {
      console.error('[epub-markup-live] CRITICAL ERROR: English Small EPUB was modified on disk! Violates ADR-012.');
      process.exitCode = 1;
      return;
    }
    if (finalTextbookHash !== initialTextbookHash) {
      console.error('[epub-markup-live] CRITICAL ERROR: English Textbook EPUB was modified on disk! Violates ADR-012.');
      process.exitCode = 1;
      return;
    }

    console.log('[epub-markup-live] ADR-012 Safe Save Verified: All 3 EPUB files are 100% byte-identical!');

    // 7. Copy evidence screenshots
    const files = fs.readdirSync(directory);
    let screenshotCount = 0;
    for (const file of files) {
      if (file.endsWith('.png') || file.endsWith('.json')) {
        fs.copyFileSync(path.join(directory, file), path.join(evidenceDir, file));
        screenshotCount++;
      }
    }
    console.log(`[epub-markup-live] Copied ${screenshotCount} evidence files to ${evidenceDir}`);

    // Clean up temporary profile
    try {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          fs.rmSync(path.join(directory, entry.name), { recursive: true, force: true });
        }
      }
    } catch {}

    process.exitCode = code ?? 0;
  });
}

main().catch((err) => {
  console.error('[epub-markup-live] Unexpected harness error:', err);
  process.exitCode = 1;
});
