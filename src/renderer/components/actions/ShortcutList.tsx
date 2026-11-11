'use client';
import React from 'react';
import type { TranslationKey } from '../../translations';
import { SHORTCUTS, SHORTCUT_SCOPES, shortcutHint } from './shortcuts';

/** Both shortcut entry points render every workspace from the same registry. */
export function ShortcutList({ t }: { t: (key: TranslationKey) => string }) {
  return <div data-shortcut-registry className="space-y-5 text-xs leading-relaxed">
    {Object.entries(SHORTCUT_SCOPES).map(([scope, label]) => <section key={scope} data-shortcut-scope={scope}>
      <h3 className="mb-2 font-bold">{t(label)}</h3>
      <dl className="space-y-2">{SHORTCUTS.filter(shortcut => shortcut.scopes.includes(scope)).map(shortcut =>
        <div key={shortcut.id} data-shortcut-id={shortcut.id} className="flex items-center gap-3 rounded-lg border border-border p-2">
          <dt className="min-w-0 flex-1">{t(shortcut.labelKey)}</dt>
          <dd className="shrink-0"><kbd dir="ltr">{shortcutHint(shortcut.id)}</kbd></dd>
        </div>)}
      </dl>
    </section>)}
  </div>;
}
