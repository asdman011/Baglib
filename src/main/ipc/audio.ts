/**
 * Baglib — Audio & TTS IPC Handlers (KEY-145)
 */

import { ipcMain } from 'electron';
import { getDatabase } from '../database/connection';
import { AudiobookService } from '../services/audio/audiobook.service';
import { PocketTTSProvider, createTTSJobId } from '../services/audio/pocket-tts.provider';
import type {
  SaveAudiobookPairingPayload,
  AudiobookPlaybackProgress,
} from '../../shared/types/audio';
import type {
  TTSProviderInitOptions,
  TTSProviderSynthesisRequest,
  TTSProviderVoiceOptions,
} from '../../shared/types/tts-provider';

let audiobookServiceInstance: AudiobookService | null = null;
const pocketTTSProvider = new PocketTTSProvider();

function getAudiobookService(): AudiobookService {
  if (!audiobookServiceInstance) {
    audiobookServiceInstance = new AudiobookService(getDatabase());
  }
  return audiobookServiceInstance;
}

export function registerAudioIpc(): void {
  // Get active pairing for an ebook
  ipcMain.handle('audio:get-pairing', async (_, bookId: string) => {
    try {
      const service = getAudiobookService();
      return service.getPairing(bookId);
    } catch (err) {
      console.warn('[IPC:audio:get-pairing] Error:', err);
      return null;
    }
  });

  // Save / Update pairing
  ipcMain.handle('audio:save-pairing', async (_, payload: SaveAudiobookPairingPayload) => {
    try {
      const service = getAudiobookService();
      return service.savePairing(payload);
    } catch (err) {
      console.warn('[IPC:audio:save-pairing] Error:', err);
      throw err;
    }
  });

  // Delete pairing
  ipcMain.handle('audio:delete-pairing', async (_, bookId: string) => {
    try {
      const service = getAudiobookService();
      return service.deletePairing(bookId);
    } catch (err) {
      console.warn('[IPC:audio:delete-pairing] Error:', err);
      return false;
    }
  });

  // Get saved playback progress
  ipcMain.handle('audio:get-progress', async (_, bookId: string) => {
    try {
      const service = getAudiobookService();
      return service.getProgress(bookId);
    } catch (err) {
      console.warn('[IPC:audio:get-progress] Error:', err);
      return null;
    }
  });

  // Save playback progress
  ipcMain.handle('audio:save-progress', async (_, progress: AudiobookPlaybackProgress) => {
    try {
      const service = getAudiobookService();
      service.saveProgress(progress);
      return true;
    } catch (err) {
      console.warn('[IPC:audio:save-progress] Error:', err);
      return false;
    }
  });

  // Parse EPUB 3 Media Overlay SMIL
  ipcMain.handle('audio:parse-smil', async (_, smilXml: string, smilHref?: string) => {
    try {
      const service = getAudiobookService();
      return service.parseSmil(smilXml, smilHref);
    } catch (err) {
      console.warn('[IPC:audio:parse-smil] Error:', err);
      return { smilHref: smilHref || '', pars: [] };
    }
  });

  // Scan local audio files in folder
  ipcMain.handle('audio:scan-local-files', async (_, folderPath: string) => {
    try {
      const service = getAudiobookService();
      return service.scanLocalAudioDirectory(folderPath);
    } catch (err) {
      console.warn('[IPC:audio:scan-local-files] Error:', err);
      return [];
    }
  });

  // Query Audiobookshelf (ABS) server
  ipcMain.handle('audio:query-abs', async (_, serverUrl: string, apiKey: string, query?: string) => {
    try {
      const service = getAudiobookService();
      return await service.queryAudiobookshelfItems(serverUrl, apiKey, query);
    } catch (err) {
      console.warn('[IPC:audio:query-abs] Error:', err);
      return [];
    }
  });

  ipcMain.handle('tts:get-status', () => pocketTTSProvider.getStatus());

  ipcMain.handle('tts:get-voices', () => PocketTTSProvider.getVoices());

  ipcMain.handle('tts:init', async (_, options?: TTSProviderInitOptions) => {
    return pocketTTSProvider.init(options);
  });

  ipcMain.handle('tts:load-voice', async (_, options: TTSProviderVoiceOptions) => {
    await pocketTTSProvider.loadVoice(options);
    return true;
  });

  ipcMain.handle('tts:synthesize', async (event, request: Omit<TTSProviderSynthesisRequest, 'jobId'> & { jobId?: string }) => {
    const jobId = request.jobId || createTTSJobId();
    const fullRequest = { ...request, jobId };
    void pocketTTSProvider
      .synthesize(fullRequest, (chunk) => {
        if (!event.sender.isDestroyed()) event.sender.send('tts:chunk', chunk);
      })
      .then(() => {
        if (!event.sender.isDestroyed()) event.sender.send('tts:complete', { jobId });
      })
      .catch((error: unknown) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('tts:error', {
            jobId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return { jobId };
  });

  ipcMain.handle('tts:stop', async (_, jobId?: string) => {
    await pocketTTSProvider.stop(jobId);
    return true;
  });

  ipcMain.handle('tts:release', async () => {
    await pocketTTSProvider.release();
    return true;
  });
}

export async function shutdownAudioIpc(): Promise<void> {
  await pocketTTSProvider.release();
}
