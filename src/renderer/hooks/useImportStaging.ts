'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DigitalFormat } from '../../shared/types/work';

export interface StagedImportFile { id: string; name: string; path: string; size: number; format: DigitalFormat }

function formatForName(name: string): DigitalFormat {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'fb2') return 'FB2';
  if (extension === 'cbz') return 'CBZ';
  if (['azw', 'azw3'].includes(extension || '')) return 'AZW3';
  if (['prc', 'mobi'].includes(extension || '')) return 'MOBI';
  if (['htm', 'html', 'xhtml'].includes(extension || '')) return 'HTML';
  return extension === 'epub' ? 'EPUB' : extension === 'txt' ? 'TXT' : 'PDF';
}

export function useImportStaging() {
  const [files, setFiles] = useState<StagedImportFile[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryErrors, setDiscoveryErrors] = useState(0);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const addPaths = useCallback(async (paths: string[]) => {
    const current = ++generation.current;
    setDiscovering(true);
    setDiscoveryErrors(0);
    try {
      const discovery = await window.electronAPI.discoverDigitalFiles(paths);
      if (current !== generation.current) return;
      setDiscoveryErrors(discovery.errors.length || (discovery.files.length ? 0 : 1));
      setFiles(previous => {
        const seen = new Set(previous.map(file => file.path));
        const added: StagedImportFile[] = [];
        for (const file of discovery.files) {
          if (seen.has(file.path)) continue;
          seen.add(file.path);
          added.push({ ...file, id: file.path, format: formatForName(file.name) });
        }
        return [...previous, ...added];
      });
    } catch {
      if (current === generation.current) setDiscoveryErrors(1);
    } finally {
      if (current === generation.current) setDiscovering(false);
    }
  }, []);
  const clear = useCallback(() => {
    generation.current++;
    setDiscovering(false);
    setDiscoveryErrors(0);
    setFiles([]);
  }, []);
  return { files, setFiles, discovering, discoveryErrors, addPaths, clear };
}
