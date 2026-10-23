import fs from 'fs';
import path from 'path';
import os from 'os';

export function hasPocketCache(language: string, voice: string, cacheRoot = process.env.HF_HUB_CACHE || path.join(process.env.HF_HOME || path.join(os.homedir(), '.cache', 'huggingface'), 'hub')): boolean {
  const snapshots = path.join(cacheRoot, 'models--kyutai--pocket-tts-without-voice-cloning', 'snapshots');
  try {
    const roots = fs.readdirSync(snapshots).map((revision) => path.join(snapshots, revision, 'languages', language));
    return ['model.safetensors', 'tokenizer.json', `embeddings/${voice}.safetensors`]
      .every((filename) => roots.some((root) => fs.existsSync(path.join(root, filename))));
  } catch {
    return false;
  }
}
