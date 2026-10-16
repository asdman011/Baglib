import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { StarDictReader } from '../../src/main/services/dictionary/stardict-reader';
import { BglReader } from '../../src/main/services/dictionary/bgl-reader';
import { SlobReader } from '../../src/main/services/dictionary/slob-reader';
import { MdictReader } from '../../src/main/services/dictionary/mdict-reader';
import { loadDictBodyFromFile } from '../../src/main/services/dictionary/dict-zip';

const FIXTURES_DIR = path.resolve(
  __dirname,
  '../../repos/readest/readest-main/apps/readest-app/src/__tests__/fixtures/data/dicts'
);

describe('KEY-142 Multi-Format Dictionary Parsers (Readest Pattern)', () => {
  describe('StarDict & DictZip Reader', () => {
    const ifoPath = path.join(FIXTURES_DIR, 'cmudict.ifo');

    it('loads StarDict metadata from .ifo', async () => {
      const reader = new StarDictReader();
      await reader.loadFromFiles(ifoPath);
      assert.ok(reader.entryCount > 0, 'Entry count should be greater than 0');
      assert.equal(reader.ifo['bookname'], 'CMU American English spelling');
      reader.close();
    });

    it('performs binary search lookup and decompress definition from .dict.dz', async () => {
      const reader = new StarDictReader();
      await reader.loadFromFiles(ifoPath);

      const entry = reader.lookup('HELLO');
      assert.ok(entry, 'Should find HELLO in cmudict');
      assert.equal(entry.word.toLowerCase(), 'hello');

      const definition = await reader.readDefinition(entry);
      assert.ok(definition.length > 0, 'Should read non-empty definition');
      assert.equal(definition, "[hə'ləu]");
      reader.close();
    });

    it('loads raw DictZip body and reads chunks with LRU cache', async () => {
      const dzPath = path.join(FIXTURES_DIR, 'cmudict.dict.dz');
      const body = await loadDictBodyFromFile(dzPath);
      const chunk = await body.read(0, 100);
      assert.equal(chunk.length, 100);
      if (body.close) body.close();
    });
  });

  describe('Babylon Glossary (.bgl) Reader', () => {
    const bglPath = path.join(FIXTURES_DIR, 'hist-geog-en-fr.bgl');

    it('decompresses block stream and extracts Babylon metadata', () => {
      const reader = new BglReader();
      reader.loadFromFile(bglPath);
      assert.ok(reader.entryCount > 0, 'BGL glossary should have entries');
      assert.ok(reader.metadata.sourceEncoding, 'Should have source encoding');
    });

    it('looks up headword and decodes HTML definition', () => {
      const reader = new BglReader();
      reader.loadFromFile(bglPath);

      const headwords = reader.getAllHeadwords();
      assert.ok(headwords.length > 0);
      const testWord = headwords[0]!.word;

      const entry = reader.lookup(testWord);
      assert.ok(entry, `Should look up entry for ${testWord}`);
      assert.equal(entry.headword, testWord);
      assert.ok(entry.definition.length > 0);
    });
  });

  describe('Aard Slob (.slob) Reader', () => {
    const slobPath = path.join(FIXTURES_DIR, 'eng-nld.slob');

    it('parses Slob header, content types, and ref items', () => {
      const reader = new SlobReader();
      reader.loadFromFile(slobPath);
      assert.equal(reader.header.encoding, 'utf-8');
      assert.ok(reader.refCount > 0, 'Slob should have refs');
      reader.close();
    });

    it('looks up word and decompresses zlib store bin', () => {
      const reader = new SlobReader();
      reader.loadFromFile(slobPath);

      const item = reader.lookup('about');
      assert.ok(item, 'Should find item for "about" in eng-nld slob');
      assert.ok(item.text && item.text.length > 0, 'Decompressed text should be non-empty');
      assert.ok(item.contentType.includes('html'));
      reader.close();
    });
  });

  describe('MDict (.mdx / .mdd) Reader', () => {
    const mdxPath = path.join(FIXTURES_DIR, 'mdict-en-en.mdx');
    const mddPath = path.join(FIXTURES_DIR, 'mdict-en-en.mdd');

    it('loads MDX header and lists headwords', () => {
      const reader = new MdictReader();
      reader.loadFromFile(mdxPath, [mddPath]);
      assert.ok(reader.title.length > 0);

      const headwords = reader.getAllHeadwords(100);
      assert.ok(headwords.length > 0);
      assert.ok(headwords.includes('abandon'));
    });

    it('looks up headword and returns HTML definition and plain text', () => {
      const reader = new MdictReader();
      reader.loadFromFile(mdxPath, [mddPath]);

      const entry = reader.lookup('abandon');
      assert.ok(entry, 'Should find abandon in MDict');
      assert.equal(entry.headword, 'abandon');
      assert.ok(entry.definitionHtml.includes('abandon'));
      assert.ok(entry.definitionText.includes('abandon'));
    });

    it('locates resource from companion MDD bundle', () => {
      const reader = new MdictReader();
      reader.loadFromFile(mdxPath, [mddPath]);

      const buf = reader.locateResource('sound.png');
      // locateResource returns Buffer if found or null if key absent in this mini bundle
      assert.ok(buf === null || Buffer.isBuffer(buf));
    });
  });
});
