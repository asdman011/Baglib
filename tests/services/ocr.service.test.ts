import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { ocrService } from '../../src/main/services/ocr/ocr.service';
import { readPreferredEngine, savePreferredEngine } from '../../src/main/services/ocr/ocr-preference';
import { DEFAULT_OCR_ENGINE } from '../../src/shared/types/ocr';

const runPowerShellScript = (script: string, timeout = 30000): Promise<string> => {
  return new Promise((resolve, reject) => {
    const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Sta',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encodedCommand,
      ],
      {
        windowsHide: true,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const rawMessage = (stderr || stdout || error.message || '').trim();
          reject(new Error(rawMessage));
          return;
        }
        resolve((stdout || '').trim());
      }
    );
  });
};

describe('KEY-141 OcrService Integration & Recognition Engine', () => {
  it('reports PaddleOCR-VL-1.6 engine info and CPU device', async () => {
    const info = await ocrService.getEngineInfo();
    assert.equal(info.id, 'paddleocr_vl');
    assert.equal(info.name, 'PaddleOCR-VL-1.6');
    assert.equal(info.parameters, '0.9B');
    assert.ok(info.device.includes('CPU'));
    assert.ok(Array.isArray(info.supportedLanguages));
    assert.ok(info.existingFilesCount !== undefined && info.existingFilesCount >= 13);
    assert.ok(info.downloadedMb !== undefined && info.downloadedMb > 0);
  });

  it('does not report the engine ready when the Python packages are absent', async () => {
    const worker = path.resolve(__dirname, '../../assets/ocr/paddle_vl_worker.py');
    const python = path.resolve(__dirname, '../../.baglib-data/pdf-engine/venv/Scripts/python.exe');
    if (!fs.existsSync(python)) return;

    // -S leaves site-packages off the import path, as on a venv without torch
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(python, ['-S', worker, '--info'], (error, out) => (error ? reject(error) : resolve(out)));
    });
    const info = JSON.parse(stdout);
    assert.equal(info.runtimeReady, false);
    assert.ok(info.missingPackages.includes('torch'));
    assert.ok(info.missingPackages.includes('transformers'));
  });

  it('labels the OS engine and the reason when the worker cannot run', async () => {
    if (process.platform !== 'win32') return;

    const testImgPath = path.join(os.tmpdir(), `ocr_service_fallback_${Date.now()}.png`);
    const safeImgPath = testImgPath.replace(/'/g, "''");
    const previousPython = process.env.BAGLIB_OCR_PYTHON;
    process.env.BAGLIB_OCR_PYTHON = path.join(os.tmpdir(), 'baglib-no-such-python.exe');

    try {
      await runPowerShellScript(`
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 500, 150
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Arial', 24, [System.Drawing.FontStyle]::Bold)
$g.DrawString('Baglib OCR Engine', $font, [System.Drawing.Brushes]::Black, 20.0, 40.0)
$bmp.Save('${safeImgPath}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
`);
      const info = await ocrService.getEngineInfo();
      assert.equal(info.runtimeReady, false);
      assert.deepEqual(info.missingPackages, ['python']);

      const result = await ocrService.recognizeImage(testImgPath, 1, 'en-US');
      assert.equal(result.engine, 'windows_media_ocr');
      assert.equal(result.requestedEngine, 'ocrmypdf');
      assert.equal(result.fallbackReason, 'runtime-missing');
      assert.deepEqual(result.missingPackages, ['python']);
      assert.ok(result.text.includes('Baglib'));

      // Choosing PaddleOCR-VL must name PaddleOCR-VL, not move on to OCRmyPDF
      const paddle = await ocrService.recognizeImage(testImgPath, 1, 'en-US', 'paddleocr_vl');
      assert.equal(paddle.engine, 'windows_media_ocr');
      assert.equal(paddle.requestedEngine, 'paddleocr_vl');
    } finally {
      if (previousPython === undefined) delete process.env.BAGLIB_OCR_PYTHON;
      else process.env.BAGLIB_OCR_PYTHON = previousPython;
      fs.rmSync(testImgPath, { force: true });
    }
  });

  it('offers OCRmyPDF first and reports each engine separately', async () => {
    const previousPython = process.env.BAGLIB_OCR_PYTHON;
    process.env.BAGLIB_OCR_PYTHON = path.join(os.tmpdir(), 'baglib-no-such-python.exe');
    try {
      const engines = await ocrService.getEngines();
      assert.deepEqual(engines.map(engine => engine.id), ['ocrmypdf', 'paddleocr_vl']);
      assert.ok(engines.every(engine => !engine.runtimeReady));
      assert.ok(engines.every(engine => engine.missingPackages.includes('python')));
    } finally {
      if (previousPython === undefined) delete process.env.BAGLIB_OCR_PYTHON;
      else process.env.BAGLIB_OCR_PYTHON = previousPython;
    }
  });

  it('defaults to OCRmyPDF and keeps a saved choice', () => {
    const store = new Map<string, unknown>();
    const settings = {
      get: <T,>(key: string) => store.get(key) as T | undefined,
      set: <T,>(key: string, value: T) => { store.set(key, value); },
    };

    assert.equal(DEFAULT_OCR_ENGINE, 'ocrmypdf');
    assert.equal(readPreferredEngine(settings), 'ocrmypdf');

    savePreferredEngine(settings, 'paddleocr_vl');
    assert.equal(readPreferredEngine(settings), 'paddleocr_vl');

    assert.throws(() => savePreferredEngine(settings, 'tesseract'));
    assert.equal(readPreferredEngine(settings), 'paddleocr_vl');

    store.set('ocr.engine.v1', 'retired-engine');
    assert.equal(readPreferredEngine(settings), 'ocrmypdf');
  });

  it('falls back to the default when settings cannot be read', () => {
    assert.equal(readPreferredEngine({ get: () => { throw new Error('no database'); } }), 'ocrmypdf');
  });

  it('detects OS support correctly', () => {
    const supported = ocrService.isSupported();
    assert.equal(typeof supported, 'boolean');
    if (process.platform === 'win32') {
      assert.equal(supported, true);
    }
  });

  it('retrieves available OS OCR languages including English and Arabic', async () => {
    const langs = await ocrService.getAvailableLanguages();
    assert.ok(Array.isArray(langs));
    assert.ok(langs.length > 0);

    if (process.platform === 'win32') {
      assert.ok(langs.includes('en-US'), 'Should include en-US');
      assert.ok(langs.includes('ar-SA'), 'Should include ar-SA');
    }
  });

  it('runs OCR on an image and extracts structured bounding boxes', async () => {
    if (process.platform !== 'win32') return;

    const escapePsSingle = (s: string) => s.replace(/'/g, "''");
    const testImgPath = path.join(os.tmpdir(), `ocr_service_test_${Date.now()}.png`);
    const safeImgPath = escapePsSingle(testImgPath);

    try {
      // 1. Generate test image with English text via System.Drawing
      const genScript = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 500, 150
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Arial', 24, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::Black
$g.DrawString('Baglib OCR Engine', $font, $brush, 20.0, 40.0)
$bmp.Save('${safeImgPath}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output 'OK'
`;
      await runPowerShellScript(genScript);
      assert.ok(fs.existsSync(testImgPath));

      // 2. Run OCR via OcrService
      const result = await ocrService.recognizeImage(testImgPath, 1, 'en-US');

      assert.equal(result.pageNumber, 1);
      assert.ok(result.engine === 'ocrmypdf' || result.engine === 'windows_media_ocr');
      assert.ok(result.width >= 500);
      assert.ok(result.height >= 150);
      assert.ok(result.text.includes('Baglib'), `Expected 'Baglib' in '${result.text}'`);
      assert.ok(result.text.includes('OCR'), `Expected 'OCR' in '${result.text}'`);

      assert.ok(result.lines.length >= 1);
      assert.ok(result.words.length >= 2);

      const firstWord = result.words[0];
      assert.ok(firstWord.text.length > 0);
      assert.ok(firstWord.bbox.width > 0);
      assert.ok(firstWord.bbox.height > 0);
      assert.ok(typeof firstWord.bbox.x === 'number');
      assert.ok(typeof firstWord.bbox.y === 'number');
    } finally {
      if (fs.existsSync(testImgPath)) {
        try {
          fs.unlinkSync(testImgPath);
        } catch {
          // ignore
        }
      }
    }
  });

  it('runs OCR on an image with Arabic text and returns Arabic words with coordinates', async () => {
    if (process.platform !== 'win32') return;

    const escapePsSingle = (s: string) => s.replace(/'/g, "''");
    const testImgPath = path.join(os.tmpdir(), `ocr_service_ar_${Date.now()}.png`);
    const safeImgPath = escapePsSingle(testImgPath);

    try {
      // 1. Generate test image with Arabic text
      const genScript = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 500, 150
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Traditional Arabic', 36, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::Black
$format = New-Object System.Drawing.StringFormat
$format.FormatFlags = [System.Drawing.StringFormatFlags]::DirectionRightToLeft
$rect = New-Object System.Drawing.RectangleF 20.0, 30.0, 460.0, 90.0
$text = [char]0x0645 + [char]0x0643 + [char]0x062A + [char]0x0628 + [char]0x0629 + ' ' + [char]0x0628 + [char]0x063A + [char]0x062F + [char]0x0627 + [char]0x062F
$g.DrawString($text, $font, $brush, $rect, $format)
$bmp.Save('${safeImgPath}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output 'OK'
`;
      await runPowerShellScript(genScript);
      assert.ok(fs.existsSync(testImgPath));

      // 2. Run OCR via OcrService with ar-SA
      const result = await ocrService.recognizeImage(testImgPath, 1, 'ar-SA');

      assert.equal(result.pageNumber, 1);
      assert.ok(result.engine === 'ocrmypdf' || result.engine === 'windows_media_ocr');
      assert.ok(result.text.includes('مكتبة') || result.text.includes('بغداد'));
      assert.ok(result.words.length >= 1);
    } finally {
      if (fs.existsSync(testImgPath)) {
        try {
          fs.unlinkSync(testImgPath);
        } catch {
          // ignore
        }
      }
    }
  });

  it('runs multi-page recognizeDocument with progress reporting', async () => {
    if (process.platform !== 'win32') return;

    const escapePsSingle = (s: string) => s.replace(/'/g, "''");
    const testImgPath = path.join(os.tmpdir(), `ocr_service_doc_${Date.now()}.png`);
    const safeImgPath = escapePsSingle(testImgPath);

    try {
      const genScript = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 400, 100
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Arial', 20)
$brush = [System.Drawing.Brushes]::Black
$g.DrawString('Page One Content', $font, $brush, 10.0, 20.0)
$bmp.Save('${safeImgPath}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output 'OK'
`;
      await runPowerShellScript(genScript);

      const progressUpdates: unknown[] = [];
      const docResult = await ocrService.recognizeDocument(
        {
          filePath: testImgPath,
          startPage: 1,
          endPage: 1,
          language: 'en-US',
          autoIndexFts: false,
        },
        payload => {
          progressUpdates.push(payload);
        }
      );

      assert.equal(docResult.totalPages, 1);
      assert.ok(docResult.pages.length === 1);
      assert.ok(progressUpdates.length >= 1);
      assert.equal(progressUpdates[progressUpdates.length - 1].status, 'completed');
      assert.equal(progressUpdates[progressUpdates.length - 1].percentage, 100);
    } finally {
      if (fs.existsSync(testImgPath)) {
        try {
          fs.unlinkSync(testImgPath);
        } catch {
          // ignore
        }
      }
    }
  });
});
