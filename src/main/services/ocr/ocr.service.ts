import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, spawn, ChildProcess } from 'child_process';
import {
  DEFAULT_OCR_ENGINE,
  OcrEngineId,
  OcrFallbackReason,
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
import { bundledPdfEngineRoot, pdfEnginePython } from '../pdf-editor/engine-root';
import { settingsRepository } from '../../database/repositories/settings.repository';
import { readPageLayout } from './ocr-preference';

// A dense page takes minutes on CPU; this only stops a hung worker.
const PADDLE_PAGE_TIMEOUT_MS = 20 * 60 * 1000;
const OCRMYPDF_PAGE_TIMEOUT_MS = 5 * 60 * 1000;
// Tesseract reads Arabic far better at 300 DPI; PaddleOCR-VL resizes its input to about 1 MP anyway.
const OCR_RENDER_DPI: Record<OcrEngineId, number> = { ocrmypdf: 300, paddleocr_vl: 200 };

class OcrEngineUnavailableError extends Error {
  constructor(public readonly reason: OcrFallbackReason, public readonly missingPackages: string[] = []) {
    super(reason);
  }
}

export class OcrService {
  private static instance: OcrService;
  private tempDir: string;
  // A PaddleOCR-VL worker holds about 4 GB, so pages run one at a time.
  private workerQueue: Promise<unknown> = Promise.resolve();
  private activeWorker: ChildProcess | null = null;

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
   * Finds the folder holding the OCR assets. The depth of __dirname differs between
   * the tsup bundle (dist/main) and the sources tests run from.
   */
  private getProjectRoot(): string {
    let dir = __dirname;
    for (;;) {
      if (fs.existsSync(path.join(dir, 'assets', 'ocr', 'paddle_vl_worker.py'))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) return process.cwd();
      dir = parent;
    }
  }

  /**
   * Resolves the isolated Python executable for Baglib PDF/OCR tools.
   */
  private getPythonPath(): string {
    if (process.env.BAGLIB_OCR_PYTHON) return process.env.BAGLIB_OCR_PYTHON;
    const python = pdfEnginePython(this.getEngineRoot());
    return fs.existsSync(python) ? python : 'python';
  }

  /** Installed apps carry the workers in resources, outside the asar archive. */
  private getOcrAssetPath(name: string): string {
    const bundled = path.join(process.resourcesPath ?? '', 'ocr', name);
    return process.resourcesPath && fs.existsSync(bundled) ? bundled : path.join(this.getProjectRoot(), 'assets', 'ocr', name);
  }

  /**
   * Resolves the path to the PaddleOCR-VL-1.6 inference worker script.
   */
  private getPaddleWorkerPath(): string {
    return this.getOcrAssetPath('paddle_vl_worker.py');
  }

  private getOcrmypdfWorkerPath(): string {
    return this.getOcrAssetPath('ocrmypdf_worker.py');
  }

  private getEngineRoot(): string {
    return bundledPdfEngineRoot() ?? path.join(this.getProjectRoot(), '.baglib-data', 'pdf-engine');
  }

  /**
   * Resolves the path to the PaddleOCR-VL-1.6 downloader script.
   */
  private getPaddleDownloaderPath(): string {
    return this.getOcrAssetPath('download_paddle_vl.py');
  }

  /**
   * Resolves Poppler's page rasterizer from the PDF engine, or PATH on other setups.
   */
  private getPdftoppmPath(): string | null {
    const popplerRoot = path.join(this.getEngineRoot(), 'poppler');
    if (fs.existsSync(popplerRoot)) {
      for (const version of fs.readdirSync(popplerRoot)) {
        const candidate = path.join(popplerRoot, version, 'Library', 'bin', 'pdftoppm.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return process.platform === 'win32' ? null : 'pdftoppm';
  }

  /**
   * Renders one document page to a temporary PNG, or null when it cannot be rendered.
   */
  private renderPdfPage(pdfPath: string, pageNumber: number, dpi: number): Promise<string | null> {
    const pdftoppm = this.getPdftoppmPath();
    if (!pdftoppm) return Promise.resolve(null);

    const prefix = path.join(this.tempDir, `page-${process.pid}-${Date.now()}-${pageNumber}`);
    const page = String(pageNumber);
    return new Promise(resolve => {
      execFile(
        pdftoppm,
        ['-png', '-r', String(dpi), '-f', page, '-l', page, '-singlefile', pdfPath, prefix],
        { windowsHide: true, timeout: 120000 },
        error => {
          const output = `${prefix}.png`;
          if (error) console.warn('[OcrService] pdftoppm failed:', error.message);
          resolve(!error && fs.existsSync(output) ? output : null);
        }
      );
    });
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
    return this.canStartWorker(this.getPaddleWorkerPath());
  }

  private canStartWorker(worker: string): boolean {
    const python = this.getPythonPath();
    return fs.existsSync(worker) && (python === 'python' || fs.existsSync(python));
  }

  /**
   * Both selectable engines, with what each still needs before it can run.
   */
  public getEngines(): Promise<OcrEngineInfo[]> {
    return Promise.all([this.getOcrmypdfInfo(), this.getEngineInfo()]);
  }

  public async getOcrmypdfInfo(): Promise<OcrEngineInfo> {
    const worker = this.getOcrmypdfWorkerPath();
    if (this.canStartWorker(worker)) {
      try {
        const output = await new Promise<string>((resolve, reject) => {
          execFile(this.getPythonPath(), [worker, '--info', '--engine-root', this.getEngineRoot()], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
            if (err) reject(err); else resolve(stdout);
          });
        });
        return JSON.parse(output.trim()) as OcrEngineInfo;
      } catch (e) {
        console.warn('[OcrService] Could not query OCRmyPDF worker info:', e);
      }
    }
    return {
      id: 'ocrmypdf',
      name: 'OCRmyPDF',
      version: '',
      parameters: 'Tesseract 5',
      device: 'CPU',
      modelPath: path.join(this.getEngineRoot(), 'ocr-best'),
      isDownloaded: false,
      runtimeReady: false,
      missingPackages: ['python'],
      supportedLanguages: ['ar', 'en', 'ar-SA', 'en-US', 'auto'],
    };
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
          execFile(python, [worker, '--info'], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
            if (err) reject(err); else resolve(stdout);
          });
        });
        const data = JSON.parse(output.trim());
        return data as OcrEngineInfo;
      } catch (e) {
        console.warn('[OcrService] Could not query PaddleOCR-VL worker info:', e);
      }
    }
    return this.getUnavailableEngineInfo();
  }

  /**
   * Engine details for when the worker cannot be reached at all.
   */
  public getUnavailableEngineInfo(): OcrEngineInfo {
    return {
      id: 'paddleocr_vl',
      name: 'PaddleOCR-VL-1.6',
      version: '1.6.0',
      parameters: '0.9B',
      device: 'CPU (AVX2, 8 Threads)',
      modelPath: '.baglib-data/models/paddleocr-vl',
      isDownloaded: false,
      runtimeReady: false,
      missingPackages: ['python'],
      supportedLanguages: ['ar', 'en', 'ar-SA', 'en-US', 'auto'],
    };
  }

  /**
   * Stops the worker in flight so it does not outlive the app.
   */
  public shutdown(): void {
    this.activeWorker?.kill();
    this.activeWorker = null;
  }

  /**
   * Executes the chosen engine via its local Python worker, one page at a time.
   */
  private executeWorker(
    engine: OcrEngineId,
    imagePath: string,
    language: OcrLanguage,
    pageNumber: number,
    dpi: number
  ): Promise<OcrPageResult> {
    const run = () => this.runWorker(engine, imagePath, language, pageNumber, dpi);
    const result = this.workerQueue.then(run, run);
    this.workerQueue = result.catch(() => undefined);
    return result;
  }

  private getWorkerArguments(
    engine: OcrEngineId,
    imagePath: string,
    language: OcrLanguage,
    pageNumber: number,
    dpi: number
  ): string[] {
    const common = ['--image', imagePath, '--language', language, '--page', String(pageNumber)];
    return engine === 'ocrmypdf'
      ? [this.getOcrmypdfWorkerPath(), ...common, '--dpi', String(dpi), '--engine-root', this.getEngineRoot(), '--layout', readPageLayout(settingsRepository)]
      : [this.getPaddleWorkerPath(), ...common];
  }

  private runWorker(
    engine: OcrEngineId,
    imagePath: string,
    language: OcrLanguage,
    pageNumber: number,
    dpi: number
  ): Promise<OcrPageResult> {
    return new Promise((resolve, reject) => {
      this.activeWorker = execFile(
        this.getPythonPath(),
        this.getWorkerArguments(engine, imagePath, language, pageNumber, dpi),
        {
          windowsHide: true,
          timeout: engine === 'ocrmypdf' ? OCRMYPDF_PAGE_TIMEOUT_MS : PADDLE_PAGE_TIMEOUT_MS,
          maxBuffer: 20 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          this.activeWorker = null;
          if (error) {
            let code: { error?: string; missingPackages?: string[] } = {};
            try {
              code = JSON.parse(stdout.trim());
            } catch {
              // The worker died before it could report a reason
            }
            if (code.error === 'runtime-missing' || code.error === 'model-missing') {
              reject(new OcrEngineUnavailableError(code.error, code.missingPackages));
              return;
            }
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
              engine,
              durationMs: 0,
              tables: data.tables || [],
            });
          } catch (err) {
            reject(new Error(`Failed to parse ${engine} output: ${err}`));
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
   * Checks if native OS OCR or a local engine is supported on the current machine.
   */
  public isSupported(): boolean {
    return this.canStartWorker(this.getOcrmypdfWorkerPath()) || this.isPaddleOcrSupported() || process.platform === 'win32' || process.platform === 'darwin';
  }

  /**
   * Performs OCR on an image file or buffer.
   */
  public async recognizeImage(
    imageInput: string | Buffer,
    pageNumber: number = 1,
    language: OcrLanguage = 'auto',
    engine: OcrEngineId = DEFAULT_OCR_ENGINE,
    dpi: number = OCR_RENDER_DPI[engine]
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

      // Priority 1: the engine the reader chose. Only the OS engine stands in for it,
      // and the result always says so.
      let fallbackReason: OcrFallbackReason = 'runtime-missing';
      let missingPackages: string[] = ['python'];
      const workerPath = engine === 'ocrmypdf' ? this.getOcrmypdfWorkerPath() : this.getPaddleWorkerPath();
      if (this.canStartWorker(workerPath)) {
        try {
          const result = await this.executeWorker(engine, resolvedPath, language, pageNumber, dpi);
          if (result.words.length > 0 || result.text.trim().length > 0) {
            result.durationMs = Date.now() - startTime;
            return result;
          }
          fallbackReason = 'empty-result';
          missingPackages = [];
          console.warn(`[OcrService] ${engine} returned empty text, falling back to OS engine`);
        } catch (workerErr) {
          fallbackReason = workerErr instanceof OcrEngineUnavailableError ? workerErr.reason : 'engine-failed';
          missingPackages = workerErr instanceof OcrEngineUnavailableError ? workerErr.missingPackages : [];
          console.warn(`[OcrService] ${engine} execution error, falling back to OS engine:`, workerErr);
        }
      }

      if (process.platform === 'win32') {
        const result = await this.executeWindowsOcr(resolvedPath, language, pageNumber);
        result.durationMs = Date.now() - startTime;
        return { ...result, requestedEngine: engine, fallbackReason, missingPackages };
      }

      if (process.platform === 'darwin') {
        const result = await this.executeMacosOcr(resolvedPath, language, pageNumber);
        result.durationMs = Date.now() - startTime;
        return { ...result, requestedEngine: engine, fallbackReason, missingPackages };
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
        requestedEngine: engine,
        fallbackReason,
        missingPackages,
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
    language: OcrLanguage = 'auto',
    engine: OcrEngineId = DEFAULT_OCR_ENGINE
  ): Promise<OcrPageResult> {
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }

    // Every engine reads a temporary render, so nothing can write to the PDF itself.
    const renderedPage = await this.renderPdfPage(pdfPath, pageNumber, OCR_RENDER_DPI[engine]);
    if (renderedPage) {
      try {
        return await this.recognizeImage(renderedPage, pageNumber, language, engine);
      } finally {
        fs.rmSync(renderedPage, { force: true });
      }
    }

    // Without Poppler, the nearest thing is the embedded image with this index
    const coverDetails = EmbeddedMetadataExtractor.extractPdfImage(pdfPath, pageNumber);

    if (coverDetails && coverDetails.coverBuffer && coverDetails.coverBuffer.length > 500) {
      return this.recognizeImage(coverDetails.coverBuffer, pageNumber, language, engine);
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
    const { filePath, bookId, startPage = 1, endPage = 10, language = 'auto', autoIndexFts = true, engine = DEFAULT_OCR_ENGINE } = params;
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
          pageResult = await this.recognizePdfPage(filePath, current, language, engine);
        } else {
          pageResult = await this.recognizeImage(filePath, current, language, engine);
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
