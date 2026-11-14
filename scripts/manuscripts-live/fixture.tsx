import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ManuscriptList } from '../../src/renderer/components/research/ManuscriptList';
import type { ManuscriptDocument } from '../../src/shared/manuscripts';
import { translations } from '../../src/renderer/translations';
function Fixture() {
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const [opened, setOpened] = useState<ManuscriptDocument | null>(null);
  useEffect(() => {
    Object.assign(window, { manuscriptHarness: { setLanguage } });
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);
  return <><ManuscriptList api={window.electronAPI.manuscripts} language={language} onOpenDocument={setOpened} />{opened && <pre data-preview aria-label={translations[language].manuscriptOpen} style={{ whiteSpace: 'pre-wrap', paddingInline: '1.5rem' }}>{opened.plain_text}</pre>}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
