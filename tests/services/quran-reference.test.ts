import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuranReference, type QuranReference } from '../../src/shared/quran-reference';

const ref = (surah: number, from: number, to: number): QuranReference => ({ surah, from, to });

describe('parseQuranReference — numeric forms', () => {
  it('parses a plain surah:ayah reference', () => {
    assert.deepEqual(parseQuranReference('2:255'), ref(2, 255, 255));
  });

  it('ignores whitespace inside and around the reference', () => {
    assert.deepEqual(parseQuranReference('  2 : 255  '), ref(2, 255, 255));
  });

  it('parses ayah ranges with hyphen and en dash', () => {
    assert.deepEqual(parseQuranReference('2:255-257'), ref(2, 255, 257));
    assert.deepEqual(parseQuranReference('2:255–257'), ref(2, 255, 257));
    assert.deepEqual(parseQuranReference('2 : 255 – 257'), ref(2, 255, 257));
  });

  it('accepts dot and slash separators', () => {
    assert.deepEqual(parseQuranReference('2.255'), ref(2, 255, 255));
    assert.deepEqual(parseQuranReference('2/255'), ref(2, 255, 255));
    assert.deepEqual(parseQuranReference('2.255-257'), ref(2, 255, 257));
  });

  it('parses Arabic-Indic digits and Arabic colon', () => {
    assert.deepEqual(parseQuranReference('٢:٢٥٥'), ref(2, 255, 255));
    assert.deepEqual(parseQuranReference('٢：٢٥٥'), ref(2, 255, 255));
  });

  it('parses Persian digits', () => {
    assert.deepEqual(parseQuranReference('۲:۲۵۵'), ref(2, 255, 255));
    assert.deepEqual(parseQuranReference('۲:۲۵۵-۲۵۷'), ref(2, 255, 257));
  });

  it('parses an Arabic-Indic ayah range', () => {
    assert.deepEqual(parseQuranReference('٢:٢٥٥-٢٥٧'), ref(2, 255, 257));
  });
});

describe('parseQuranReference — surah names', () => {
  it('parses an Arabic name followed by an ayah', () => {
    assert.deepEqual(parseQuranReference('البقرة ٢٥٥'), ref(2, 255, 255));
    assert.deepEqual(parseQuranReference('سورة البقرة ٢٥٥'), ref(2, 255, 255));
  });

  it('normalizes ta marbuta variants and tashkeel', () => {
    assert.deepEqual(parseQuranReference('البقره 255-257'), ref(2, 255, 257));
    assert.deepEqual(parseQuranReference('الْبَقَرَة 255'), ref(2, 255, 255));
    assert.deepEqual(parseQuranReference('بقرة 255'), ref(2, 255, 255));
  });

  it('parses English names with and without the article', () => {
    assert.deepEqual(parseQuranReference('Al-Baqarah 255'), ref(2, 255, 255));
    assert.deepEqual(parseQuranReference('baqarah 255'), ref(2, 255, 255));
    assert.deepEqual(parseQuranReference('Al Baqarah 255-257'), ref(2, 255, 257));
  });

  it('returns the full surah when only a name is given', () => {
    assert.deepEqual(parseQuranReference('البقرة'), ref(2, 1, 286));
    assert.deepEqual(parseQuranReference('البقره'), ref(2, 1, 286));
    assert.deepEqual(parseQuranReference('Al-Baqarah'), ref(2, 1, 286));
  });

  it('does not accept an ambiguous or unknown name', () => {
    assert.equal(parseQuranReference('الصلاة'), null);
    assert.equal(parseQuranReference('NotASurah 255'), null);
    assert.equal(parseQuranReference('الصلاة 255'), null);
  });
});

describe('parseQuranReference — validation', () => {
  it('rejects ayahs outside the surah', () => {
    assert.equal(parseQuranReference('1:8'), null);
    assert.equal(parseQuranReference('115:1'), null);
    assert.equal(parseQuranReference('2:0'), null);
    assert.equal(parseQuranReference('2:300'), null);
  });

  it('rejects reversed ranges without clamping', () => {
    assert.equal(parseQuranReference('2:257-255'), null);
    assert.equal(parseQuranReference('2:300-286'), null);
  });

  it('rejects a bare surah number so it continues as normal search', () => {
    assert.equal(parseQuranReference('2'), null);
    assert.equal(parseQuranReference(' ١١٤ '), null);
  });

  it('returns null and never throws for junk input', () => {
    const junk = ['', '   ', ':', '-', '/', 'abc', '999:999', '0:0', '2:255:257', '2 255'];
    for (const value of junk) {
      assert.equal(parseQuranReference(value), null);
    }
  });
});

describe('parseQuranReference — Mushaf profiles', () => {
  it('uses Hafs ayah counts by default', () => {
    assert.deepEqual(parseQuranReference('2:286'), ref(2, 286, 286));
    assert.deepEqual(parseQuranReference('2:285'), ref(2, 285, 285));
  });

  it('uses Warsh ayah counts when requested', () => {
    // Al-Baqarah: 286 ayahs in Hafs, 285 in Warsh.
    assert.equal(parseQuranReference('2:286', 'warsh'), null);
    assert.deepEqual(parseQuranReference('2:285', 'warsh'), ref(2, 285, 285));
    assert.deepEqual(parseQuranReference('البقرة', 'warsh'), ref(2, 1, 285));
  });

  it('accepts ayahs that only exist in the Warsh numbering', () => {
    // Al-An'am: 165 ayahs in Hafs, 167 in Warsh.
    assert.equal(parseQuranReference('6:166'), null);
    assert.deepEqual(parseQuranReference('6:166', 'warsh'), ref(6, 166, 166));
    assert.deepEqual(parseQuranReference('٦:١٦٧', 'warsh'), ref(6, 167, 167));
  });
});
