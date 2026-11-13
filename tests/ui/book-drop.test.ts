import { it } from 'node:test';
import assert from 'node:assert/strict';
import { routeBookDrop } from '../../src/renderer/utils/book-drop';

it('imports one actual file directly, with exact-file duplicate protection', async () => {
  let imports = 0;
  const outcome = await routeBookDrop(['D:\\Books\\كتاب.pdf'], {
    discoverDigitalFiles: async () => ({ files: [{ path: 'D:/Books/كتاب.pdf' }], errors: [] }),
    importDigitalFile: async options => {
      imports++;
      assert.equal(options.skipExactDuplicatesOnly, true);
      return { success: true, fileName: 'كتاب.pdf', filePath: options.filePath, fileSizeBytes: 1 };
    },
  });
  assert.equal(outcome.kind, 'single');
  assert.equal(imports, 1);
});

it('keeps multiple files and directories (including one-book directories) in the batch wizard', async () => {
  const api = {
    discoverDigitalFiles: async () => ({ files: [{ path: 'D:/Books/book.pdf' }], errors: [] }),
    importDigitalFile: async () => { throw new Error('Must not auto-import a folder'); },
  };
  assert.equal((await routeBookDrop(['D:/Books'], api)).kind, 'batch');
  assert.equal((await routeBookDrop(['D:/one.pdf', 'D:/two.pdf'], api)).kind, 'batch');
});

it('surfaces inaccessible single drops instead of silently importing them', async () => {
  await assert.rejects(routeBookDrop(['D:/missing.pdf'], {
    discoverDigitalFiles: async () => ({ files: [], errors: [{ path: 'D:/missing.pdf', code: 'ENOENT' }] }),
    importDigitalFile: async () => { throw new Error('Must not import an unreadable file'); },
  }), /unavailable/);
});


it('routes media-only and mixed book/media drops and reports unsupported audio', async () => {
  const calls: string[][] = [];
  let books = 0;
  const api = {
    lectures: { addPaths: async (paths: string[]) => { calls.push(paths); return []; } },
    discoverDigitalFiles: async (paths: string[]) => ({ files: paths.map(path => ({ path })), errors: [] }),
    importDigitalFile: async (options: { filePath: string }) => { books++; return { success: true, fileName: 'book.pdf', filePath: options.filePath, fileSizeBytes: 1 }; },
  };
  assert.equal((await routeBookDrop(['D:/درس.mp4', 'D:/talk.WEBM'], api)).kind, 'media');
  assert.equal((await routeBookDrop(['D:/book.pdf', 'D:/lecture.mp3'], api)).kind, 'single');
  assert.deepEqual(calls, [['D:/درس.mp4', 'D:/talk.WEBM'], ['D:/lecture.mp3']]); assert.equal(books, 1);
  await assert.rejects(routeBookDrop(['D:/real.wma'], api), /unsupported-media/);
});
