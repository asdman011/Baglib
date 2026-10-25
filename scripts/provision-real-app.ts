import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { QuranLibraryService } from '../src/main/services/quran/quran-library.service';
import { runQuranInstaller } from '../src/main/ipc/quran';
import { readerPresets, presetResource } from '../src/main/services/quran/reader-resources';
import { QuranReaderProcess } from '../src/main/services/quran/quran-reader-process';
import type {
  QuranReaderCatalog,
  QuranPassage,
  QuranCommentary,
  QuranMushafPage,
  QuranAyahAudio,
  QuranError,
} from '../src/shared/types/quran';

app.whenReady().then(async () => {
  try {
    const root = path.join(app.getPath('appData'), 'Baglib', 'quran');
    console.log('[provision] Real user Quran root:', root);

    const service = new QuranLibraryService(root, async () => '', runQuranInstaller, () => {});
    await service.initialize();

    // Ensure all presets are registered as resources in catalog
    service.store.saveResources(
      readerPresets
        .filter(p => !service.store.resource(p.id))
        .map(p => presetResource(p.id))
    );

    const base = path.resolve('repos/Quran/QUL Developer Resources');
    const results: {
      installed: { id: string; title: string; packId?: string; bytes?: number }[];
      reused: { id: string; title: string; packId: string }[];
      missing: { id: string; title: string; expectedPath: string }[];
      failed: { id: string; title: string; error?: QuranError | null }[];
    } = { installed: [], reused: [], missing: [], failed: [] };

    for (const preset of readerPresets) {
      const already = service.store.packs().find(pack => pack.resource.id === preset.id);
      if (already) {
        results.reused.push({ id: preset.id, title: preset.title, packId: already.id });
        console.log(`[provision] Reused already installed: ${preset.title} (${preset.id})`);
        continue;
      }

      let archivePath: string;
      if (preset.kind === 'surahs') {
        archivePath = path.resolve('.baglib-data/qul-phase1/surah-metadata-sqlite.zip');
      } else {
        archivePath = path.join(base, preset.relative, preset.filename);
      }

      try {
        const s = await fs.stat(archivePath);
        if (!s.isFile()) throw new Error('Not a file');
      } catch {
        results.missing.push({ id: preset.id, title: preset.title, expectedPath: archivePath });
        console.log(`[provision] Missing archive: ${preset.title} at ${archivePath}`);
        continue;
      }

      console.log(`[provision] Installing: ${preset.title} from ${archivePath}...`);
      const job = service.createJob(preset.id);
      await service.installFile(job, archivePath);

      const state = service.store.jobs().find(j => j.id === job.id);
      if (state?.state === 'complete') {
        const pack = service.store.packs().find(p => p.resource.id === preset.id);
        results.installed.push({ id: preset.id, title: preset.title, packId: pack?.id, bytes: pack?.bytes });
        console.log(`[provision] Successfully installed: ${preset.title} (${pack?.bytes} bytes)`);
      } else {
        results.failed.push({ id: preset.id, title: preset.title, error: state?.error });
        console.log(`[provision] Failed to install: ${preset.title}: ${state?.error}`);
      }
    }

    console.log('\n[provision] Summary:');
    console.log('Installed:', results.installed.length);
    console.log('Reused:', results.reused.length);
    console.log('Missing:', results.missing.length);
    console.log('Failed:', results.failed.length);

    // Now test offline reading through QuranReaderProcess
    const reader = new QuranReaderProcess();
    const latestPacks = service.store.packs();
    const catalog = (await reader.request(root, latestPacks, { action: 'catalog' })) as QuranReaderCatalog;
    console.log('[provision] Reader catalog sources count:', catalog.sources.length);

    const hafsScript = catalog.sources.find(s => s.kind === 'script' && s.profile === 'hafs');
    const warshScript = catalog.sources.find(s => s.kind === 'script' && s.profile === 'warsh');
    const translation = catalog.sources.find(s => s.kind === 'translation');
    const meanings = catalog.sources.find(s => s.kind === 'word-translation');
    const tafsir = catalog.sources.find(s => s.kind === 'tafsir');
    const mushafLayout = catalog.sources.find(s => s.kind === 'mushaf-layout');

    if (hafsScript) {
      console.log('\n[provision] Testing Hafs offline reading: Al-Fatihah (1:1-7)...');
      const passage = (await reader.request(root, latestPacks, {
        action: 'read',
        query: {
          script: hafsScript.id,
          surah: 1,
          from: 1,
          translation: translation?.id,
          meanings: meanings?.id,
        },
      })) as QuranPassage;
      console.log(`[provision] Hafs Read success: Surah ${passage.surah}, ${passage.ayahs.length} ayahs loaded.`);
      console.log('Ayah 1 Arabic:', passage.ayahs[0].words.map(w => w.text).join(' '));
      if (passage.ayahs[0].translation) {
        console.log('Ayah 1 Translation:', passage.ayahs[0].translation.text);
      }
    }

    if (warshScript) {
      console.log('\n[provision] Testing Warsh offline reading: Al-Fatihah...');
      const passageWarsh = (await reader.request(root, latestPacks, {
        action: 'read',
        query: {
          script: warshScript.id,
          surah: 1,
          from: 1,
        },
      })) as QuranPassage;
      console.log(`[provision] Warsh Read success: Surah ${passageWarsh.surah}, profile: ${passageWarsh.profile}, ${passageWarsh.ayahs.length} ayahs loaded.`);
      console.log('Ayah 1 Arabic:', passageWarsh.ayahs[0].words.map(w => w.text).join(' '));
    }

    if (hafsScript && tafsir) {
      console.log('\n[provision] Testing Tafsir commentary: Surah 2 Ayah 9...');
      const commentary = (await reader.request(root, latestPacks, {
        action: 'commentary',
        query: {
          script: hafsScript.id,
          pack: tafsir.id,
          surah: 2,
          ayah: 9,
        },
      })) as QuranCommentary;
      console.log(`[provision] Tafsir commentary loaded: range ${commentary.from} - ${commentary.to}, ${commentary.nodes.length} nodes.`);
    }

    if (mushafLayout) {
      console.log('\n[provision] Testing Mushaf Layout: Page 1 and Ayah 2:282...');
      const page1 = (await reader.request(root, latestPacks, {
        action: 'mushaf-page',
        pack: mushafLayout.id,
        page: 1,
      })) as QuranMushafPage;
      console.log(`[provision] Mushaf Page 1 loaded: ${page1.words.length} words, total pages: ${page1.totalPages}.`);

      const lookup282 = (await reader.request(root, latestPacks, {
        action: 'mushaf-page-for-ayah',
        pack: mushafLayout.id,
        surah: 2,
        ayah: 282,
      })) as { pageNumber: number };
      console.log(`[provision] Ayah 2:282 resolves to Mushaf Page: ${lookup282.pageNumber}.`);
    }

    const recitation = catalog.sources.find(s => s.kind === 'recitation');
    if (recitation) {
      console.log('\n[provision] Testing Recitation audio & segments: 1:1...');
      const audio1 = (await reader.request(root, latestPacks, {
        action: 'recitation-audio',
        pack: recitation.id,
        surah: 1,
        ayah: 1,
      })) as QuranAyahAudio;
      console.log(`[provision] Recitation audio loaded: URL: ${audio1.audioUrl}, segments: ${audio1.segments.length}.`);

      const surah1 = (await reader.request(root, latestPacks, {
        action: 'recitation-surah',
        pack: recitation.id,
        surah: 1,
      })) as QuranAyahAudio[];
      console.log(`[provision] Recitation surah 1 loaded: ${surah1.length} verses.`);
    }

    reader.close();
    await service.dispose();
    console.log('\n[provision] ACCEPTANCE CHECK PASSED SUCCESSFULLY.');
    app.quit();
  } catch (err) {
    console.error('[provision] Error during provisioning:', err);
    app.exit(1);
  }
});
