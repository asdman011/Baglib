import { useState, useCallback, useRef } from 'react';
import { BibliographicWork } from '../../shared/types/bibliographic';

export type LookupStatus = 'idle' | 'searching' | 'found' | 'no_results' | 'error';

export interface LookupParams {
  isbn?: string;
  title?: string;
  author?: string;
  query?: string;
  filePath?: string;
  filename?: string;
}

export interface UseMetadataLookupReturn {
  status: LookupStatus;
  data: BibliographicWork | null;
  candidates: BibliographicWork[];
  error: string | null;
  source: 'isbn' | 'query' | null;
  lastParams: LookupParams | null;
  lookup: (params: LookupParams) => Promise<BibliographicWork | null>;
  retry: () => Promise<BibliographicWork | null>;
  reset: () => void;
  cancel: () => void;
}

export function useMetadataLookup(): UseMetadataLookupReturn {
  const [status, setStatus] = useState<LookupStatus>('idle');
  const [data, setData] = useState<BibliographicWork | null>(null);
  const [candidates, setCandidates] = useState<BibliographicWork[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'isbn' | 'query' | null>(null);
  const [lastParams, setLastParams] = useState<LookupParams | null>(null);

  // Cancellation tracker
  const activeLookupIdRef = useRef<number>(0);

  const reset = useCallback(() => {
    activeLookupIdRef.current += 1;
    setStatus('idle');
    setData(null);
    setCandidates([]);
    setError(null);
    setSource(null);
    setLastParams(null);
  }, []);

  const cancel = useCallback(() => {
    activeLookupIdRef.current += 1;
    if (status === 'searching') {
      setStatus('idle');
    }
  }, [status]);

  const lookup = useCallback(
    async (params: LookupParams): Promise<BibliographicWork | null> => {
      const lookupId = ++activeLookupIdRef.current;
      setLastParams(params);
      setStatus('searching');
      setError(null);
      setData(null);
      setCandidates([]);
      setSource(null);

      try {
        const electronAPI = (window as any).electronAPI;
        if (!electronAPI?.lookupMetadata) {
          throw new Error('electronAPI.lookupMetadata is not available');
        }

        const res = await electronAPI.lookupMetadata(params);

        // Check if aborted or superseded
        if (lookupId !== activeLookupIdRef.current) {
          return null;
        }

        if (res.success && res.match) {
          setData(res.match);
          setCandidates(res.candidates || [res.match]);
          setSource(res.source || (params.isbn ? 'isbn' : 'query'));
          setStatus('found');
          return res.match;
        } else if (res.error === 'NO_RESULTS' || !res.match) {
          setStatus('no_results');
          return null;
        } else {
          setStatus('error');
          setError(res.details || res.error || 'Metadata lookup failed');
          return null;
        }
      } catch (err: any) {
        if (lookupId !== activeLookupIdRef.current) {
          return null;
        }
        setStatus('error');
        setError(err?.message || 'Network error occurred during lookup');
        return null;
      }
    },
    []
  );

  const retry = useCallback(async (): Promise<BibliographicWork | null> => {
    if (!lastParams) return null;
    return lookup(lastParams);
  }, [lastParams, lookup]);

  return {
    status,
    data,
    candidates,
    error,
    source,
    lastParams,
    lookup,
    retry,
    reset,
    cancel,
  };
}
