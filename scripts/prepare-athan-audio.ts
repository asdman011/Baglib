import path from 'node:path';
import { ensureLocalAthanAudioFile } from '../src/main/services/athan/athan-audio-generator';
for (const directory of ['public', 'src/renderer/public']) ensureLocalAthanAudioFile(path.resolve(directory, 'assets/audio'));
