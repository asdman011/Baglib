import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { settingsRepository } from '../../database/repositories/settings.repository';
import type { PdfEngineTools } from './python';
import { selectNewestStirlingJar } from './stirling';
import { bundledPdfEngineRoot, pdfEnginePython } from './engine-root';

export function pdfEngineTools(): PdfEngineTools {
  const config = settingsRepository.get<Partial<PdfEngineTools>>('pdf-editor.engine.v1') || {};
  const root = bundledPdfEngineRoot() ?? (app.isPackaged ? path.join(app.getPath('userData'), 'pdf-editor', 'runtime') : path.join(app.getAppPath(), '.baglib-data', 'pdf-engine'));
  const python = pdfEnginePython(root);
  const javaRoot = path.join(root, 'java');
  const javaFolders = fs.existsSync(javaRoot)
    ? fs.readdirSync(javaRoot).filter(name => fs.existsSync(path.join(javaRoot, name, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')))
    : [];
  // Sort descending by major version so that Java 25 is preferred over Java 21
  javaFolders.sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
    const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
    return numB - numA;
  });
  const java = javaFolders[0] ? path.join(javaRoot, javaFolders[0], 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : undefined;
  const validator = path.join(root, 'verapdf');
  let veraPdfJar: string | undefined;
  if (fs.existsSync(path.join(validator, 'bin'))) veraPdfJar = fs.readdirSync(path.join(validator, 'bin')).find(name => /^(greenfield-apps|cli-).*\.jar$/u.test(name));
  const discoveredStirlingJar = selectNewestStirlingJar(path.join(root, 'stirling')) || selectNewestStirlingJar(path.join(root, 'libs'));
  return {
    python: config.python || process.env.BAGLIB_PDF_PYTHON || python,
    script: app.isPackaged ? path.join(process.resourcesPath, 'pdf-editor', 'engine.py') : path.join(app.getAppPath(), 'assets', 'pdf-editor', 'engine.py'),
    tessdata: config.tessdata || (fs.existsSync(path.join(root, 'ocr-best', 'ara.traineddata')) ? path.join(root, 'ocr-best') : path.join(root, 'tessdata')),
    java: config.java || java,
    veraPdfJar: config.veraPdfJar || (veraPdfJar ? path.join(validator, 'bin', veraPdfJar) : undefined),
    stirlingJar: config.stirlingJar || process.env.BAGLIB_STIRLING_JAR || discoveredStirlingJar,
    stirlingUrl: config.stirlingUrl || process.env.BAGLIB_STIRLING_URL,
    // An installed app's resources may be read-only, and Stirling writes config and logs beside itself.
    stirlingWorkDir: app.isPackaged ? path.join(app.getPath('userData'), 'pdf-editor', 'stirling') : undefined,
    preferStirling: true,
  };
}
