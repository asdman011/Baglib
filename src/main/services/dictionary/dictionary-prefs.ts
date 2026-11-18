/**
 * Baglib — lookup history and the Reading pad (KEY-414). Both live in app settings: the last 100
 * lookups, and the pad's current text (at most 50,000 characters) with its highlighted words.
 * No table: the pad is not a library item.
 */

import type Database from 'better-sqlite3';
import {
  DICTIONARY_HISTORY_SETTING,
  DICTIONARY_PAD_SETTING,
  MAX_LOOKUP_WORD_LENGTH,
  MAX_PAD_TEXT,
  addToHistory,
  cleanHistory,
  cleanPad,
  removeFromHistory,
  type LookupHistoryEntry,
  type ReadingPadState,
} from '../../../shared/dictionary-features';

const invalid = (): never => {
  throw new Error('invalid-request');
};

export class DictionaryPrefsService {
  constructor(private readonly db: Database.Database, private readonly clock: () => Date = () => new Date()) {}

  private read(key: string): unknown {
    try {
      const row = this.db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key) as { value: string } | undefined;
      return row ? JSON.parse(row.value) : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    this.db
      .prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .run(key, JSON.stringify(value), this.clock().toISOString());
  }

  history(): LookupHistoryEntry[] {
    return cleanHistory(this.read(DICTIONARY_HISTORY_SETTING));
  }

  /** Records a lookup at the top of the history (the word, now, and the dictionary that answered first). */
  addHistory(input: unknown): LookupHistoryEntry[] {
    const v = (input && typeof input === 'object' ? input : invalid()) as Record<string, unknown>;
    if (typeof v.word !== 'string' || !v.word.trim() || v.word.length > MAX_LOOKUP_WORD_LENGTH * 4) invalid();
    if (v.dictionary !== undefined && v.dictionary !== null && typeof v.dictionary !== 'string') invalid();
    const next = addToHistory(this.history(), {
      word: (v.word as string).trim(),
      at: this.clock().toISOString(),
      ...(typeof v.dictionary === 'string' && v.dictionary ? { dictionary: v.dictionary } : {}),
    });
    this.write(DICTIONARY_HISTORY_SETTING, next);
    return next;
  }

  removeHistory(word: unknown): LookupHistoryEntry[] {
    if (typeof word !== 'string' || !word.trim() || word.length > MAX_LOOKUP_WORD_LENGTH * 4) invalid();
    const next = removeFromHistory(this.history(), word as string);
    this.write(DICTIONARY_HISTORY_SETTING, next);
    return next;
  }

  clearHistory(): LookupHistoryEntry[] {
    this.write(DICTIONARY_HISTORY_SETTING, []);
    return [];
  }

  pad(): ReadingPadState {
    return cleanPad(this.read(DICTIONARY_PAD_SETTING));
  }

  /** Saves the pad. Text over 50,000 characters is refused rather than cut silently. */
  savePad(input: unknown): ReadingPadState {
    const v = (input && typeof input === 'object' ? input : invalid()) as Record<string, unknown>;
    if (typeof v.text !== 'string' || v.text.length > MAX_PAD_TEXT) invalid();
    if (v.highlights !== undefined && !Array.isArray(v.highlights)) invalid();
    const state = cleanPad(v);
    this.write(DICTIONARY_PAD_SETTING, state);
    return state;
  }
}
