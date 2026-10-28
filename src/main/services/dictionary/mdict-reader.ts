/**
 * Baglib — MDict (.mdx / .mdd) Reader (KEY-142)
 *
 * Implements high-density bilingual dictionary and companion audio asset loading
 * utilizing js-mdict.
 */

import fs from 'node:fs';
import path from 'node:path';
import { MDX, MDD } from 'js-mdict';

export interface MdictEntry {
  headword: string;
  definitionHtml: string;
  definitionText: string;
}

export class MdictReader {
  private mdx: MDX | null = null;
  private mdds: MDD[] = [];
  title = '';
  description = '';

  loadFromFile(mdxPath: string, companionMddPaths?: string[]): void {
    if (!fs.existsSync(mdxPath)) {
      throw new Error(`MDict file not found at ${mdxPath}`);
    }

    this.mdx = new MDX(mdxPath);
    this.title = this.mdx.header?.Title || path.basename(mdxPath, '.mdx');
    this.description = this.mdx.header?.Description || '';

    // Auto-discover companion .mdd files if not explicitly provided
    const dir = path.dirname(mdxPath);
    const base = path.basename(mdxPath, '.mdx');
    const mddList = companionMddPaths && companionMddPaths.length > 0
      ? companionMddPaths
      : fs.readdirSync(dir)
          .filter((f) => f.startsWith(base) && f.endsWith('.mdd'))
          .map((f) => path.join(dir, f));

    this.mdds = [];
    for (const mddPath of mddList) {
      if (fs.existsSync(mddPath)) {
        try {
          this.mdds.push(new MDD(mddPath));
        } catch (err) {
          console.warn('[MdictReader] Failed to load MDD companion:', mddPath, err);
        }
      }
    }
  }

  lookup(word: string): MdictEntry | undefined {
    if (!this.mdx) return undefined;

    try {
      const res = this.mdx.lookup(word);
      if (res && res.definition) {
        let def = String(res.definition).trim();
        // Remove trailing null terminator if present
        if (def.endsWith('\x00')) def = def.slice(0, -1);
        const text = def.replace(/<[^>]+>/g, '').replace(/[\r\n\t]+/g, ' ').trim();
        return {
          headword: res.keyText || word,
          definitionHtml: def,
          definitionText: text,
        };
      }
    } catch (err) {
      console.warn('[MdictReader] lookup error:', err);
    }

    return undefined;
  }

  locateResource(resourceKey: string): Buffer | null {
    const candidates = resourceKey.startsWith('/') ? [resourceKey, resourceKey.slice(1)] : [resourceKey, `/${resourceKey}`];

    for (const mdd of this.mdds) {
      for (const k of candidates) {
        try {
          const res = mdd.locate(k);
          if (res && res.definition) {
            return Buffer.isBuffer(res.definition) ? res.definition : Buffer.from(res.definition);
          }
        } catch {
          // continue
        }
      }
    }
    return null;
  }

  getAllHeadwords(limit = 50000): string[] {
    if (!this.mdx) return [];
    try {
      if (typeof this.mdx.associate === 'function') {
        const list = this.mdx.associate('');
        return list.slice(0, limit).map((item: { keyText?: string }) => item.keyText || String(item));
      }
    } catch {
      // fallback
    }
    return [];
  }
}
