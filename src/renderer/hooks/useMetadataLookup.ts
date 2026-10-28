import { errorMessage } from '../../shared/errors';
import { useState, useCallback, useRef } from 'react';
import { BibliographicWork, BibliographicEdition } from '../../shared/types/bibliographic';

export type LookupStatus = 'idle' | 'searching' | 'found' | 'no_results' | 'error';

export interface LookupParams {
  isbn?: string;
  title?: string;
  author?: string;
  query?: string;
  filePath?: string;
  filename?: string;
}

export interface CandidateMetadataItem {
  work: BibliographicWork;
  score: number;
  confidence: number;
  isCertainMatch: boolean;
  isSuggestion: boolean;
  matchType: 'exact' | 'high' | 'alternative';
  matchedEdition?: BibliographicEdition;
  discoveredIsbn?: string;
  providerName?: string;
}

export interface UseMetadataLookupReturn {
  status: LookupStatus;
  data: BibliographicWork | null;
  candidates: BibliographicWork[];
  evaluations: CandidateMetadataItem[];
  error: string | null;
  source: 'isbn' | 'query' | null;
  lastParams: LookupParams | null;
  isSearchingDeeper: boolean;
  searchDeeper: () => Promise<void>;
  lookup: (params: LookupParams) => Promise<BibliographicWork | null>;
  lookupWithCandidates: (params: LookupParams) => Promise<{
    match: BibliographicWork | null;
    candidates: BibliographicWork[];
    evaluations: CandidateMetadataItem[];
  }>;
  selectCandidate: (candidate: BibliographicWork) => void;
  retry: () => Promise<BibliographicWork | null>;
  reset: () => void;
  cancel: () => void;
}

export function useMetadataLookup(): UseMetadataLookupReturn {
  const [status, setStatus] = useState<LookupStatus>('idle');
  const [data, setData] = useState<BibliographicWork | null>(null);
  const [candidates, setCandidates] = useState<BibliographicWork[]>([]);
  const [evaluations, setEvaluations] = useState<CandidateMetadataItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'isbn' | 'query' | null>(null);
  const [lastParams, setLastParams] = useState<LookupParams | null>(null);

  // Cancellation tracker
  const activeLookupIdRef = useRef<number>(0);

  const [page, setPage] = useState<number>(1);
  const [isSearchingDeeper, setIsSearchingDeeper] = useState<boolean>(false);

  const reset = useCallback(() => {
    activeLookupIdRef.current += 1;
    setStatus('idle');
    setData(null);
    setCandidates([]);
    setEvaluations([]);
    setError(null);
    setSource(null);
    setLastParams(null);
    setPage(1);
    setIsSearchingDeeper(false);
  }, []);

  const cancel = useCallback(() => {
    activeLookupIdRef.current += 1;
    if (status === 'searching') {
      setStatus('idle');
    }
  }, [status]);

  const selectCandidate = useCallback((candidate: BibliographicWork) => {
    setData(candidate);
  }, []);

  const lookupWithCandidates = useCallback(
    async (params: LookupParams): Promise<{
      match: BibliographicWork | null;
      candidates: BibliographicWork[];
      evaluations: CandidateMetadataItem[];
    }> => {
      const lookupId = ++activeLookupIdRef.current;
      setLastParams(params);
      setPage(1);
      setStatus('searching');
      setError(null);
      setData(null);
      setCandidates([]);
      setEvaluations([]);
      setSource(null);

      try {
        const electronAPI = (window).electronAPI;
        if (!electronAPI?.lookupMetadata) {
          throw new Error('electronAPI.lookupMetadata is not available');
        }

        const res = await electronAPI.lookupMetadata(params);

        // Check if aborted or superseded
        if (lookupId !== activeLookupIdRef.current) {
          return { match: null, candidates: [], evaluations: [] };
        }

        if (res.success && (res.match || (res.candidates && res.candidates.length > 0))) {
          const topMatch = res.match || res.candidates[0];
          const candidateList: BibliographicWork[] = res.candidates && res.candidates.length > 0 ? res.candidates : (topMatch ? [topMatch] : []);
          const evalList: CandidateMetadataItem[] = res.evaluations || [];

          setData(topMatch);
          setCandidates(candidateList);
          setEvaluations(evalList);
          setSource(res.source || (params.isbn ? 'isbn' : 'query'));
          setStatus('found');
          return { match: topMatch, candidates: candidateList, evaluations: evalList };
        } else if (res.error === 'NO_RESULTS' || (!res.match && (!res.candidates || res.candidates.length === 0))) {
          setStatus('no_results');
          return { match: null, candidates: [], evaluations: [] };
        } else {
          setStatus('error');
          setError(res.details || res.error || 'Metadata lookup failed');
          return { match: null, candidates: [], evaluations: [] };
        }
      } catch (err: unknown) {
        if (lookupId !== activeLookupIdRef.current) {
          return { match: null, candidates: [], evaluations: [] };
        }
        setStatus('error');
        setError(errorMessage(err) || 'Network error occurred during lookup');
        return { match: null, candidates: [], evaluations: [] };
      }
    },
    []
  );

  const searchDeeper = useCallback(async () => {
    if (!lastParams || isSearchingDeeper) return;
    setIsSearchingDeeper(true);
    const nextPage = page + 1;

    try {
      const electronAPI = (window).electronAPI;
      if (electronAPI?.discoverMetadata) {
        const res = await electronAPI.discoverMetadata({
          ...lastParams,
          page: nextPage,
          deeper: true,
        });

        if (res && res.candidates && res.candidates.length > 0) {
          setPage(nextPage);
          setCandidates((prev) => {
            const seenIds = new Set(prev.map((c) => c.workId));
            const newCands = res.candidates.filter((c: BibliographicWork) => !seenIds.has(c.workId));
            return [...prev, ...newCands];
          });
          if (res.rankedEvaluations && res.rankedEvaluations.length > 0) {
            setEvaluations((prev) => {
              const seenIds = new Set(prev.map((e) => e.work.workId));
              const newEvals = res.rankedEvaluations.filter((e: CandidateMetadataItem) => !seenIds.has(e.work.workId));
              return [...prev, ...newEvals];
            });
          }
        }
      }
    } catch (err) {
      console.warn('[useMetadataLookup] searchDeeper error:', err);
    } finally {
      setIsSearchingDeeper(false);
    }
  }, [lastParams, page, isSearchingDeeper]);

  const lookup = useCallback(
    async (params: LookupParams): Promise<BibliographicWork | null> => {
      const res = await lookupWithCandidates(params);
      return res.match;
    },
    [lookupWithCandidates]
  );

  const retry = useCallback(async (): Promise<BibliographicWork | null> => {
    if (!lastParams) return null;
    return lookup(lastParams);
  }, [lastParams, lookup]);

  return {
    status,
    data,
    candidates,
    evaluations,
    error,
    source,
    lastParams,
    isSearchingDeeper,
    searchDeeper,
    lookup,
    lookupWithCandidates,
    selectCandidate,
    retry,
    reset,
    cancel,
  };
}
