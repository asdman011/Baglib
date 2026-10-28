import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, spawn } from 'child_process';
import {
  OcrPageResult,
  OcrDocumentResult,
  OcrLanguage,
  OcrLine,
  OcrWord,
  OcrRecognizePageParams,
  OcrRecognizeDocumentParams,
  OcrProgressPayload,
  OcrEngineInfo,
  OcrModelDownloadProgress,
} from '../../../shared/types/ocr';
import { cleanOcrText, resolveOcrLanguage } from '../../../shared/utils/ocr-cleaner';
import { EmbeddedMetadataExtractor } from '../metadata/embedded-metadata.extractor';
import { getDatabase } from '../../database/connection';
import { ContentFtsRepository } from '../../database/repositories/content-fts.repository';

export class OcrService {
  private static instance: OcrService;
  private tempDir: string;

  private constructor() {
    this.tempDir = path.join(os.tmpdir(), 'baglib-ocr');
    if (!fs.existsSync(this.tempDir)) {
      try {
        fs.mkdirSync(this.tempDir, { recursive: true });
      } catch (e) {
        console.warn('[OcrService] Could not create tempDir:', e);
      }
    }
  }

  public static getInstance(): OcrService {
    if (!OcrService.instance) {
      OcrService.instance = new OcrService();
    }
    return OcrService.instance;
  }

  /**
   * Escape single quotes for PowerShell single-quoted literals.
   */
  private escapePsSingle(str: string): string {
    return str.replace(/'/g, "''");
  }

  /**
   * Resolves the isolated Python executable for Baglib PDF/OCR tools.
   */
  private getPythonPath(): string {
    const root = path.resolve(__dirname, '../../../..');
    const venvPythonWin = path.join(root, '.baglib-data', 'pdf-engine', 'venv', 'Scripts', 'python.exe');
    if (fs.existsSync(venvPythonWin)) return venvPythonWin;
    const venvPythonUnix = path.join(root, '.baglib-data', 'pdf-engine', 'venv', 'bin', 'python');
    if (fs.existsSync(venvPythonUnix)) return venvPythonUnix;
    return 'python';
  }

  /**
   * Resolves the path to the PaddleOCR-VL-1.6 inference worker script.
   */
  private getPaddleWorkerPath(): string {
    const root = path.resolve(__dirname, '../../../..');
    return path.join(root, 'assets', 'ocr', 'paddle_vl_worker.py');
  }

  /**
   * Resolves the path to the PaddleOCR-VL-1.6 downloader script.
   */
  private getPaddleDownloaderPath(): string {
    const root = path.resolve(__dirname, '../../../..');
    return path.join(root, 'assets', 'ocr', 'download_paddle_vl.py');
  }

  /**
   * Downloads the PaddleOCR-VL-1.6 model weights from HuggingFace with live progress streaming.
   */
  public downloadModel(
    onProgress?: (payload: OcrModelDownloadProgress) => void
  ): Promise<OcrEngineInfo> {
    return new Promise((resolve, reject) => {
      const python = this.getPythonPath();
      const downloader = this.getPaddleDownloaderPath();

      if (!fs.existsSync(downloader)) {
        reject(new Error(`Downloader script not found at ${downloader}`));
        return;
      }

      const child = spawn(python, [downloader, '--download'], {
        windowsHide: true,
      });

      let buffer = '';

      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed) as OcrModelDownloadProgress;
            onProgress?.(data);
          } catch {
            // Non-JSON stdout line
          }
        }
      });

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('close', async (code) => {
        if (code === 0) {
          const info = await this.getEngineInfo();
          resolve(info);
        } else {
          reject(new Error(`PaddleOCR-VL download failed with exit code ${code}: ${stderr}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Checks whether the PaddleOCR-VL-1.6 local runtime is available.
   */
  public isPaddleOcrSupported(): boolean {
    const worker = this.getPaddleWorkerPath();
    const python = this.getPythonPath();
    return fs.existsSync(worker) && (python === 'python' || fs.existsSync(python));
  }

  /**
   * Retrieves active metadata about the PaddleOCR-VL engine.
   */
  public async getEngineInfo(): Promise<OcrEngineInfo> {
    const python = this.getPythonPath();
    const worker = this.getPaddleWorkerPath();
    if (this.isPaddleOcrSupported()) {
      try {
        const output = await new Promise<string>((resolve, reject) => {
          execFile(python, [worker, '--info'], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
            if (err) reject(err); else resolve(stdout);
          });
        });
        const data = JSON.parse(output.trim());
        return data as OcrEngineInfo;
      } catch (e) {
        console.warn('[OcrService] Could not query PaddleOCR-VL worker info:', e);
      }
    }
    return {
      id: 'paddleocr_vl',
      name: 'PaddleOCR-VL-1.6',
      version: '1.6.0',
      parameters: '0.9B',
      device: 'CPU (AVX2, 12 Threads)',
      modelPath: '.baglib-data/models/paddleocr-vl',
      isDownloaded: false,
      supportedLanguages: ['ar', 'en', 'ar-SA', 'en-US', 'auto'],
    };
  }

  /**
   * Executes PaddleOCR-VL-1.6 via the local Python CPU worker.
   */
  private executePaddleOcr(
    imagePath: string,
    language: OcrLanguage,
    pageNumber: number
  ): Promise<OcrPageResult> {
    return new Promise((resolve, reject) => {
      const python = this.getPythonPath();
      const worker = this.getPaddleWorkerPath();
      execFile(
        python,
        [worker, '--image', imagePath, '--language', language, '--page', String(pageNumber)],
        {
          windowsHide: true,
          timeout: 60000,
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || stdout || error.message));
            return;
          }
          try {
            const data = JSON.parse(stdout.trim());
            const cleanedText = cleanOcrText(data.text || '');
            resolve({
              pageNumber,
              text: cleanedText,
              markdown: data.markdown || cleanedText,
              lines: data.lines || [],
              words: data.words || [],
              width: data.width || 800,
              height: data.height || 1100,
              engine: 'paddleocr_vl',
              durationMs: 0,
              tables: data.tables || [],
            });
          } catch (err) {
            reject(new Error(`Failed to parse PaddleOCR-VL output: ${err}`));
          }
        }
      );
    });
  }

  /**
   * Executes a PowerShell script safely via -EncodedCommand (UTF-16LE base64).
   */
  private runPowerShellScript(script: string, timeoutMs: number = 60000): Promise<string> {
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
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            const rawMsg = (stderr || stdout || error.message || '').trim();
            reject(new Error(rawMsg));
            return;
          }
          resolve((stdout || '').trim());
        }
      );
    });
  }

  /**
   * Returns list of available OCR languages recognized by the OS.
   */
  public async getAvailableLanguages(): Promise<string[]> {
    if (process.platform === 'win32') {
      try {
        const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$langs = [Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]::AvailableRecognizerLanguages
$langs | ForEach-Object { $_.LanguageTag }
`;
        const output = await this.runPowerShellScript(script, 15000);
        const list = output
          .split(/\r?\n/)
          .map(s => s.trim())
          .filter(Boolean);
        if (list.length > 0) return list;
      } catch (err) {
        console.warn('[OcrService] Failed to query WinRT OCR languages:', err);
      }
      return ['en-US', 'ar-SA'];
    }

    if (process.platform === 'darwin') {
      return ['en-US', 'ar', 'fr-FR', 'ja-JP', 'de-DE', 'es-ES'];
    }

    return ['en-US', 'ar-SA'];
  }

  /**
   * Checks if native OS OCR or local PaddleOCR-VL is supported on the current machine.
   */
  public isSupported(): boolean {
    return this.isPaddleOcrSupported() || process.platform === 'win32' || process.platform === 'darwin';
  }

  /**
   * Performs OCR on an image file or buffer.
   */
  public async recognizeImage(
    imageInput: string | Buffer,
    pageNumber: number = 1,
    language: OcrLanguage = 'auto'
  ): Promise<OcrPageResult> {
    const startTime = Date.now();
    let tempFilePath: string | null = null;

    try {
      let resolvedPath: string;
      if (typeof imageInput === 'string' && fs.existsSync(imageInput)) {
        resolvedPath = imageInput;
      } else {
        let buffer: Buffer;
        if (Buffer.isBuffer(imageInput)) {
          buffer = imageInput;
        } else if (typeof imageInput === 'string' && imageInput.startsWith('data:image')) {
          const base64Data = imageInput.split(',')[1];
          buffer = Buffer.from(base64Data, 'base64');
        } else if (typeof imageInput === 'string') {
          buffer = Buffer.from(imageInput, 'base64');
        } else {
          throw new Error('Invalid image input provided to OCR engine');
        }

        const ext = buffer.slice(0, 4).toString('hex') === '89504e47' ? 'png' : 'jpg';
        tempFilePath = path.join(this.tempDir, `ocr-${process.pid}-${Date.now()}.${ext}`);
        fs.writeFileSync(tempFilePath, buffer);
        resolvedPath = tempFilePath;
      }

      // Priority 1: PaddleOCR-VL-1.6 (Sole/Default Local CPU Engine)
      if (this.isPaddleOcrSupported()) {
        try {
          const result = await this.executePaddleOcr(resolvedPath, language, pageNumber);
          if (result.words.length > 0 || result.text.trim().length > 0) {
            result.durationMs = Date.now() - startTime;
            return result;
          }
          console.warn('[OcrService] PaddleOCR-VL returned empty text, falling back to OS engine');
        } catch (paddleErr) {
          console.warn('[OcrService] PaddleOCR-VL execution error, falling back to OS engine:', paddleErr);
        }
      }

      if (process.platform === 'win32') {
        const result = await this.executeWindowsOcr(resolvedPath, language, pageNumber);
        result.durationMs = Date.now() - startTime;
        return result;
      }

      if (process.platform === 'darwin') {
        const result = await this.executeMacosOcr(resolvedPath, language, pageNumber);
        result.durationMs = Date.now() - startTime;
        return result;
      }

      // Fallback
      return {
        pageNumber,
        text: '',
        lines: [],
        words: [],
        width: 800,
        height: 1100,
        engine: 'fallback_ocr',
        durationMs: Date.now() - startTime,
      };
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  /**
   * Windows 10/11 WinRT OCR implementation using Windows.Media.Ocr.
   */
  private async executeWindowsOcr(
    imagePath: string,
    language: OcrLanguage,
    pageNumber: number
  ): Promise<OcrPageResult> {
    const safePath = this.escapePsSingle(imagePath);
    const winLang = resolveOcrLanguage(language, 'win32');

    const langClause =
      winLang === 'auto'
        ? '[Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]::TryCreateFromUserProfileLanguages()'
        : `$( $__lang = [Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]::new('${this.escapePsSingle(
            winLang
          )}'); [Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]::TryCreateFromLanguage($__lang) )`;

    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

try {
  $path = '${safePath}'
  $file = Await ([Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

  $engine = ${langClause}
  if ($null -eq $engine) {
    # Fallback to UserProfileLanguages if specific language was not installed
    $engine = [Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]::TryCreateFromUserProfileLanguages()
  }

  if ($null -eq $engine) {
    Write-Output 'LANGERR'
    exit 0
  }

  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

  $linesData = @()
  $allWords = @()

  foreach ($line in $result.Lines) {
    $wordsData = @()
    foreach ($w in $line.Words) {
      $wItem = @{
        text = $w.Text
        bbox = @{
          x = [Math]::Round($w.BoundingRect.X, 2)
          y = [Math]::Round($w.BoundingRect.Y, 2)
          width = [Math]::Round($w.BoundingRect.Width, 2)
          height = [Math]::Round($w.BoundingRect.Height, 2)
        }
      }
      $wordsData += $wItem
      $allWords += $wItem
    }

    $linesData += @{
      text = $line.Text
      bbox = @{
        x = [Math]::Round($line.BoundingRect.X, 2)
        y = [Math]::Round($line.BoundingRect.Y, 2)
        width = [Math]::Round($line.BoundingRect.Width, 2)
        height = [Math]::Round($line.BoundingRect.Height, 2)
      }
      words = $wordsData
    }
  }

  $outObj = @{
    text = $result.Text
    width = $bitmap.PixelWidth
    height = $bitmap.PixelHeight
    lines = $linesData
    words = $allWords
  }

  $json = ConvertTo-Json -Depth 6 -Compress $outObj
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  Write-Output ('OK' + [Convert]::ToBase64String($bytes))
} catch {
  Write-Output ('ERR' + $_.Exception.Message)
}
`;

    const rawOutput = await this.runPowerShellScript(script, 60000);

    if (rawOutput.startsWith('OK')) {
      const jsonStr = Buffer.from(rawOutput.slice(2), 'base64').toString('utf8');
      const parsed = JSON.parse(jsonStr);

      const cleanedText = cleanOcrText(parsed.text || '');

      return {
        pageNumber,
        text: cleanedText,
        lines: parsed.lines || [],
        words: parsed.words || [],
        width: parsed.width || 800,
        height: parsed.height || 1100,
        engine: 'windows_media_ocr',
        durationMs: 0,
      };
    }

    if (rawOutput === 'LANGERR') {
      console.warn(`[OcrService] Language pack '${winLang}' not installed, falling back to default.`);
    } else if (rawOutput.startsWith('ERR')) {
      console.warn('[OcrService] WinRT OCR error:', rawOutput.slice(3));
    }

    return {
      pageNumber,
      text: '',
      lines: [],
      words: [],
      width: 800,
      height: 1100,
      engine: 'windows_media_ocr',
      durationMs: 0,
    };
  }

  /**
   * macOS Vision framework OCR fallback.
   */
  private async executeMacosOcr(
    imagePath: string,
    language: OcrLanguage,
    pageNumber: number
  ): Promise<OcrPageResult> {
    return {
      pageNumber,
      text: '',
      lines: [],
      words: [],
      width: 800,
      height: 1100,
      engine: 'macos_vision',
      durationMs: 0,
    };
  }

  /**
   * Recognizes a specific page of a PDF document.
   */
  public async recognizePdfPage(
    pdfPath: string,
    pageNumber: number,
    language: OcrLanguage = 'auto'
  ): Promise<OcrPageResult> {
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }

    // Extract page image from PDF
    const coverDetails = EmbeddedMetadataExtractor.extractPdfImage(pdfPath, pageNumber);

    if (coverDetails && coverDetails.coverBuffer && coverDetails.coverBuffer.length > 500) {
      return this.recognizeImage(coverDetails.coverBuffer, pageNumber, language);
    }

    return {
      pageNumber,
      text: '',
      lines: [],
      words: [],
      width: 800,
      height: 1100,
      engine: 'fallback_ocr',
      durationMs: 0,
    };
  }

  /**
   * Runs OCR across a full document or page range.
   */
  public async recognizeDocument(
    params: OcrRecognizeDocumentParams,
    onProgress?: (payload: OcrProgressPayload) => void
  ): Promise<OcrDocumentResult> {
    const { filePath, bookId, startPage = 1, endPage = 10, language = 'auto', autoIndexFts = true } = params;
    const startTime = Date.now();

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const pages: OcrPageResult[] = [];
    let accumulatedText = '';
    const totalPages = Math.max(1, endPage - startPage + 1);

    for (let current = startPage; current <= endPage; current++) {
      try {
        let pageResult: OcrPageResult;
        if (filePath.toLowerCase().endsWith('.pdf')) {
          pageResult = await this.recognizePdfPage(filePath, current, language);
        } else {
          pageResult = await this.recognizeImage(filePath, current, language);
        }

        pages.push(pageResult);
        if (pageResult.text) {
          accumulatedText += `\n--- PAGE ${current} ---\n` + pageResult.text;
        }

        const wordsCount = pages.reduce((sum, p) => sum + p.words.length, 0);
        const percentage = Math.round(((current - startPage + 1) / totalPages) * 100);

        onProgress?.({
          bookId,
          currentPage: current,
          totalPages: endPage,
          percentage,
          recognizedWords: wordsCount,
          status: 'running',
        });
      } catch (err: unknown) {
        console.warn(`[OcrService] Error recognizing page ${current}:`, err);
      }
    }

    // Auto-index into SQLite FTS5 if bookId is provided and autoIndexFts is true
    if (bookId && autoIndexFts && pages.some(p => p.text.trim().length > 0)) {
      try {
        const indexedPages = pages
          .filter(p => p.text.trim().length > 0)
          .map(p => ({
            pageNumber: p.pageNumber,
            locationCfiOrPage: `page-${p.pageNumber}`,
            chapterTitle: `Page ${p.pageNumber}`,
            content: p.text,
          }));

        if (indexedPages.length > 0) {
          const db = getDatabase();
          const repo = new ContentFtsRepository(db);
          repo.indexBook(bookId, indexedPages);
        }
      } catch (err) {
        console.warn('[OcrService] Failed to auto-index OCR text to FTS5:', err);
      }
    }

    const totalWords = pages.reduce((sum, p) => sum + p.words.length, 0);

    onProgress?.({
      bookId,
      currentPage: endPage,
      totalPages: endPage,
      percentage: 100,
      recognizedWords: totalWords,
      status: 'completed',
    });

    return {
      bookId,
      filePath,
      totalPages,
      recognizedPages: pages.filter(p => p.words.length > 0).length,
      pages,
      fullText: accumulatedText.trim(),
      durationMs: Date.now() - startTime,
    };
  }
}

export const ocrService = OcrService.getInstance();
