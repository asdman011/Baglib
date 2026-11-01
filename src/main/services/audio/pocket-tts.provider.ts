import { spawn, type ChildProcess } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  PocketTTSLanguage,
  TTSProvider,
  TTSProviderAudioChunk,
  TTSProviderInitOptions,
  TTSProviderSynthesisRequest,
  TTSProviderStatus,
  TTSProviderVoiceOptions,
} from '../../../shared/types/tts-provider';
import { POCKET_TTS_LANGUAGES } from '../../../shared/types/tts-provider';
import { hasPocketCache } from './pocket-cache';

interface PocketServer {
  offline?: boolean;
  language: PocketTTSLanguage;
  port: number;
  process: ChildProcess;
}

const VOICE_BY_LANGUAGE: Record<PocketTTSLanguage, string> = {
  english: 'alba',
  french: 'estelle',
  german: 'juergen',
  portuguese: 'rafael',
  italian: 'giovanni',
  spanish: 'lola',
  dutch: 'daan',
};

const VOICES = [
  ['pocket:alba', 'Alba', 'en'],
  ['pocket:anna', 'Anna', 'en'],
  ['pocket:estelle', 'Estelle', 'fr'],
  ['pocket:juergen', 'Juergen', 'de'],
  ['pocket:rafael', 'Rafael', 'pt'],
  ['pocket:giovanni', 'Giovanni', 'it'],
  ['pocket:lola', 'Lola', 'es'],
] as const;

function toLanguage(value?: string): PocketTTSLanguage {
  if (POCKET_TTS_LANGUAGES.includes(value as PocketTTSLanguage)) return value as PocketTTSLanguage;
  const normalized = value?.toLowerCase().split('-')[0];
  const map: Record<string, PocketTTSLanguage> = {
    en: 'english',
    fr: 'french',
    de: 'german',
    pt: 'portuguese',
    it: 'italian',
    es: 'spanish',
    nl: 'dutch',
  };
  return map[normalized || ''] || 'english';
}

function concatBuffers(left: Buffer<ArrayBufferLike>, right: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> {
  return Buffer.concat([left, right]);
}

export class WavPcmParser {
  private pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private dataOffset: number | null = null;
  private format: { sampleRate: number; channels: number; bitsPerSample: number } | null = null;
  private pcmBytes = 0;

  push(chunk: Buffer<ArrayBufferLike>): { data: Buffer<ArrayBufferLike>; format: { sampleRate: number; channels: number; bitsPerSample: number } } | null {
    this.pending = concatBuffers(this.pending, chunk);
    if (this.dataOffset === null) {
      if (this.pending.length < 12) return null;
      if (this.pending.toString('ascii', 0, 4) !== 'RIFF' || this.pending.toString('ascii', 8, 12) !== 'WAVE') {
        throw new Error('Pocket TTS returned an invalid WAV stream.');
      }
      let offset = 12;
      while (offset + 8 <= this.pending.length) {
        const size = this.pending.readUInt32LE(offset + 4);
        const name = this.pending.toString('ascii', offset, offset + 4);
        if (name === 'fmt ' && offset + 8 + size <= this.pending.length && size >= 16) {
          if (this.pending.readUInt16LE(offset + 8) !== 1) throw new Error('Pocket TTS returned non-PCM audio.');
          this.format = {
            channels: this.pending.readUInt16LE(offset + 10),
            sampleRate: this.pending.readUInt32LE(offset + 12),
            bitsPerSample: this.pending.readUInt16LE(offset + 22),
          };
          if (this.format.bitsPerSample !== 16 || this.format.channels < 1 || this.format.channels > 2 || this.format.sampleRate < 8000 || this.format.sampleRate > 192000) {
            throw new Error('Pocket TTS returned an unsupported PCM format.');
          }
        }
        if (name === 'data') {
          if (!this.format) throw new Error('Pocket TTS WAV stream has no format header.');
          this.dataOffset = offset + 8;
          break;
        }
        if (size > 65536 || offset > 65536) throw new Error('Pocket TTS WAV header is too large.');
        if (offset + 8 + size + (size % 2) > this.pending.length) return null;
        offset += 8 + size + (size % 2);
      }
    }

    if (!this.format || this.dataOffset === null || this.pending.length <= this.dataOffset) return null;
    this.pending = this.pending.subarray(this.dataOffset);
    this.dataOffset = 0;
    const frameBytes = this.format.channels * this.format.bitsPerSample / 8;
    const alignedBytes = this.pending.length - this.pending.length % frameBytes;
    if (!alignedBytes) return null;
    const data = this.pending.subarray(0, alignedBytes);
    this.pending = this.pending.subarray(alignedBytes);
    this.pcmBytes += data.length;
    return { data, format: this.format };
  }

  finish(): void {
    if (!this.pcmBytes || this.dataOffset === null) throw new Error('Pocket TTS returned no playable audio.');
    if (this.pending.length) throw new Error('Pocket TTS returned an incomplete PCM frame.');
  }
}

export class PocketTTSProvider implements TTSProvider {
  readonly id = 'pocket-tts' as const;
  private readonly servers = new Map<PocketTTSLanguage, PocketServer>();
  private readonly starting = new Map<PocketTTSLanguage, Promise<PocketServer>>();
  private readonly jobs = new Map<string, AbortController>();
  private readonly voices = new Map<PocketTTSLanguage, string>();
  private available: boolean | null = null;
  private lastMessage = 'Pocket TTS has not been initialized.';

  constructor(private readonly options: { streamIdleTimeoutMs?: number } = {}) {}

  getStatus(): TTSProviderStatus {
    return {
      providerId: this.id,
      available: this.available === true,
      running: this.servers.size > 0,
      supportedLanguages: [...POCKET_TTS_LANGUAGES],
      activeLanguages: [...this.servers.keys()],
      message: this.lastMessage,
    };
  }

  async init(options: TTSProviderInitOptions = {}): Promise<TTSProviderStatus> {
    try {
      await this.ensureServer(options.language || 'english', options.quantize ?? true);
      this.available = true;
      this.lastMessage = 'Pocket TTS is ready for offline narration.';
    } catch (error) {
      this.available = false;
      this.lastMessage = error instanceof Error ? error.message : String(error);
    }
    return this.getStatus();
  }

  async loadVoice(options: TTSProviderVoiceOptions): Promise<void> {
    const language = options.language || 'english';
    this.voices.set(language, options.voiceId.replace(/^pocket:/, ''));
    await this.ensureServer(language, true);
  }

  async synthesize(request: TTSProviderSynthesisRequest, onChunk: (chunk: TTSProviderAudioChunk) => void): Promise<void> {
    if (!request.text.trim()) return;
    const language = toLanguage(request.language);
    if (request.voiceId) this.voices.set(language, request.voiceId.replace(/^pocket:/, ''));
    const controller = new AbortController();
    this.jobs.set(request.jobId, controller);
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(new Error('Pocket TTS audio stream stopped responding.')), this.options.streamIdleTimeoutMs ?? 30000);
    };

    try {
      const server = await this.ensureServer(language, true);
      controller.signal.throwIfAborted();
      resetIdleTimer();
      const body = new FormData();
      body.set('text', request.text);
      const voiceId = request.voiceId?.replace(/^pocket:/, '') || this.voices.get(language) || VOICE_BY_LANGUAGE[language];
      if (voiceId) body.set('voice_url', voiceId);
      const response = await fetch(`http://127.0.0.1:${server.port}/tts`, {
        method: 'POST',
        body,
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`Pocket TTS request failed with HTTP ${response.status}.`);
      }

      const reader = response.body.getReader();
      const parser = new WavPcmParser();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        resetIdleTimer();
        const parsed = parser.push(Buffer.from(value));
        if (parsed && parsed.data.length > 0) {
          onChunk({
            jobId: request.jobId,
            pcmBase64: parsed.data.toString('base64'),
            sampleRate: parsed.format.sampleRate,
            channels: parsed.format.channels,
            bitsPerSample: parsed.format.bitsPerSample,
          });
        }
      }
      parser.finish();
      onChunk({
        jobId: request.jobId,
        pcmBase64: '',
        sampleRate: 24000,
        channels: 1,
        bitsPerSample: 16,
        final: true,
      });
    } finally {
      clearTimeout(idleTimer);
      controller.abort();
      this.jobs.delete(request.jobId);
    }
  }

  async stop(jobId?: string): Promise<void> {
    if (jobId) {
      this.jobs.get(jobId)?.abort();
      this.jobs.delete(jobId);
      return;
    }
    for (const controller of this.jobs.values()) controller.abort();
    this.jobs.clear();
  }

  async release(): Promise<void> {
    await this.stop();
    for (const server of this.servers.values()) {
      if (!server.process.killed) server.process.kill();
    }
    await Promise.allSettled(this.starting.values());
    this.starting.clear();
    this.servers.clear();
    this.available = null;
    this.lastMessage = 'Pocket TTS was released.';
  }

  static getVoices() {
    return VOICES.map(([id, name, lang]) => ({ id, name, lang, localService: true }));
  }

  private async ensureServer(language: PocketTTSLanguage, quantize: boolean): Promise<PocketServer> {
    const pending = this.starting.get(language);
    if (pending) return pending;
    const startup = this.startServer(language, quantize);
    this.starting.set(language, startup);
    try {
      return await startup;
    } finally {
      this.starting.delete(language);
    }
  }

  private async startServer(language: PocketTTSLanguage, quantize: boolean): Promise<PocketServer> {
    const existing = this.servers.get(language);
    const offline = hasPocketCache(language, this.voices.get(language) || VOICE_BY_LANGUAGE[language]);
    if (existing && !existing.process.killed && (!existing.offline || offline) && await this.isHealthy(existing.port)) return existing;
    if (existing && !existing.process.killed) existing.process.kill();

    const port = await this.findFreePort();
    const command = await this.resolveCommand();
    const args = ['serve', '--host', '127.0.0.1', '--port', String(port), '--language', language];
    if (quantize) args.push('--quantize');
    const child = spawn(command.command, [...command.args, ...args], {
      cwd: command.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, TOKENIZERS_PARALLELISM: 'false', ...(offline ? { HF_HUB_OFFLINE: '1' } : {}) },
    });
    let diagnostic = '';
    child.stdout?.on('data', (data) => {
      diagnostic = (diagnostic + String(data)).slice(-4000);
    });
    child.stderr?.on('data', (data) => {
      const message = String(data).trim();
      diagnostic = (diagnostic + '\n' + message).slice(-4000);
      if (message) this.lastMessage = message;
    });
    const server = { language, port, process: child, offline };
    this.servers.set(language, server);
    child.once('exit', () => {
      if (this.servers.get(language)?.process === child) this.servers.delete(language);
    });
    try {
      await this.waitForHealth(port, child);
      return server;
    } catch (error) {
      child.kill();
      if (this.servers.get(language) === server) this.servers.delete(language);
      this.available = false;
      this.lastMessage = `${error instanceof Error ? error.message : String(error)}${diagnostic ? `\n${diagnostic}` : ''}`;
      throw new Error(this.lastMessage);
    }
  }

  /** Probing Python takes seconds, so it must never block the main process. */
  private probe(command: string, args: string[]): Promise<{ status: number | null; stdout: string }> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      let stdout = '';
      child.stdout?.on('data', (data) => { stdout += data; });
      child.once('error', () => resolve({ status: null, stdout: '' }));
      child.once('close', (status) => resolve({ status, stdout }));
    });
  }

  private async resolveCommand(): Promise<{ command: string; args: string[]; cwd?: string }> {
    const configured = process.env.BAGLIB_POCKET_TTS_BIN;
    if (configured) return { command: configured, args: [], cwd: process.cwd() };
    const packagedCandidates = [
      path.join(process.resourcesPath || '', 'pocket-tts', process.platform === 'win32' ? 'pocket-tts.exe' : 'pocket-tts'),
      path.join(process.cwd(), 'pocket-tts', process.platform === 'win32' ? 'pocket-tts.exe' : 'pocket-tts'),
    ];
    const packaged = packagedCandidates.find((candidate) => fs.existsSync(candidate));
    if (packaged) return { command: packaged, args: [], cwd: process.cwd() };

    const pathCommand = process.platform === 'win32' ? 'where.exe' : 'which';
    const pocketTtsOnPath = await this.probe(pathCommand, ['pocket-tts']);
    const resolvedPocketTts = pocketTtsOnPath.status === 0
      ? pocketTtsOnPath.stdout.trim().split(/\r?\n/)[0]
      : '';
    if (resolvedPocketTts) return { command: resolvedPocketTts, args: [], cwd: process.cwd() };

    const configuredPython = process.env.BAGLIB_POCKET_TTS_PYTHON;
    const pythonCandidates = configuredPython
      ? [{ command: configuredPython, args: [] }]
      : process.platform === 'win32'
        ? [{ command: 'py', args: ['-3'] }, { command: 'python', args: [] }, { command: 'python3', args: [] }]
        : [{ command: 'python3', args: [] }, { command: 'python', args: [] }];

    for (const candidate of pythonCandidates) {
      const moduleCheck = await this.probe(candidate.command, [...candidate.args, '-c', 'import pocket_tts']);
      if (moduleCheck.status === 0) {
        return {
          command: candidate.command,
          args: [...candidate.args, '-m', 'pocket_tts'],
          cwd: process.cwd(),
        };
      }
    }

    throw new Error(
      'Pocket TTS is not installed. Install it with "python -m pip install pocket-tts", '
      + 'set BAGLIB_POCKET_TTS_BIN to a standalone binary, or set BAGLIB_POCKET_TTS_PYTHON to its Python executable.',
    );
  }

  private async waitForHealth(port: number, child: ChildProcess): Promise<void> {
    const deadline = Date.now() + 10 * 60 * 1000;
    let spawnError: Error | null = null;
    const onError = (error: Error) => {
      spawnError = error;
    };
    child.once('error', onError);
    try {
      while (Date.now() < deadline) {
        if (spawnError) throw new Error(`Unable to start Pocket TTS: ${String(spawnError)}`);
        if (child.killed || child.exitCode !== null || child.signalCode !== null) throw new Error('Pocket TTS exited before its local server became ready.');
        if (await this.isHealthy(port)) {
          this.available = true;
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } finally {
      child.removeListener('error', onError);
    }
    child.kill();
    throw new Error('Timed out waiting for the Pocket TTS local server.');
  }

  private async isHealthy(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async findFreePort(): Promise<number> {
    const { createServer } = await import('net');
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        server.close(() => resolve(port));
      });
    });
  }
}

export function createTTSJobId(): string {
  return crypto.randomUUID();
}
