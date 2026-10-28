/**
 * Baglib — Local Soothing Athan Audio Asset Generator
 *
 * Generates a warm, harmonic Hijaz-maqam short Athan melody WAV file
 * stored locally in assets so prayer alerts work 100% offline.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Generates a 16-bit PCM mono WAV buffer containing a gentle, reverent Hijaz-maqam cadence.
 */
export function createSoothingAthanWavBuffer(sampleRate = 22050): Buffer {
  // Hijaz maqam notes (D4, Eb4, F#4, G4, A4, Bb4, G4, F#4, Eb4, D4)
  const notes: Array<{ freq: number; durationSec: number }> = [
    { freq: 293.66, durationSec: 0.55 }, // D4
    { freq: 311.13, durationSec: 0.45 }, // Eb4
    { freq: 369.99, durationSec: 0.65 }, // F#4
    { freq: 392.00, durationSec: 0.85 }, // G4
    { freq: 440.00, durationSec: 0.65 }, // A4
    { freq: 392.00, durationSec: 0.55 }, // G4
    { freq: 369.99, durationSec: 0.65 }, // F#4
    { freq: 311.13, durationSec: 0.45 }, // Eb4
    { freq: 293.66, durationSec: 1.10 }, // D4
  ];

  const totalDurationSec = notes.reduce((acc, n) => acc + n.durationSec, 0);
  const numSamples = Math.floor(totalDurationSec * sampleRate);
  const dataByteLength = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataByteLength);

  // RIFF / WAVE Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 = mono)
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32);  // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataByteLength, 40);

  let sampleIdx = 0;
  for (const note of notes) {
    const noteSamples = Math.floor(note.durationSec * sampleRate);
    for (let i = 0; i < noteSamples && sampleIdx < numSamples; i++, sampleIdx++) {
      const t = i / sampleRate;
      const attack = Math.min(1, i / (0.04 * sampleRate));
      const release = Math.min(1, (noteSamples - i) / (0.12 * sampleRate));
      const envelope = attack * release;

      // Warm fundamental + soft octave & fifth overtones
      const fundamental = Math.sin(2 * Math.PI * note.freq * t);
      const octave = 0.25 * Math.sin(2 * Math.PI * (note.freq * 2) * t);
      const sub = 0.2 * Math.sin(2 * Math.PI * (note.freq * 0.5) * t);
      const sample = (fundamental + octave + sub) * 0.35 * envelope;

      const pcm = Math.max(-32767, Math.min(32767, Math.round(sample * 32767)));
      buffer.writeInt16LE(pcm, 44 + sampleIdx * 2);
    }
  }

  return buffer;
}

/**
 * Ensures the local Athan audio file exists on disk and returns its path.
 */
export function ensureLocalAthanAudioFile(targetDir?: string): string {
  const baseDir =
    targetDir ||
    path.resolve(process.cwd(), 'src', 'renderer', 'public', 'assets', 'audio');
  const filePath = path.join(baseDir, 'athan-short.wav');
  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(baseDir, { recursive: true });
      fs.writeFileSync(filePath, createSoothingAthanWavBuffer());
    }
  } catch {
    // Ignore write errors in read-only environments
  }
  return filePath;
}
