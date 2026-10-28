/**
 * Baglib — Dedicated In-Book Search Web Worker (KEY-140)
 *
 * Runs background full-text searches off the UI thread and progressively
 * streams matches via postMessage to ensure stutter-free rendering.
 */

import {
  searchBookProgressive,
  SearchWorkerIncomingMessage,
  SearchWorkerProgressResponse,
  SearchWorkerCompleteResponse,
} from './in-book-search';

let currentAbortController: AbortController | null = null;

// Worker self scope event listener
if (typeof self !== 'undefined') {
  self.onmessage = async (e: MessageEvent<SearchWorkerIncomingMessage>) => {
    const data = e.data;

    if (data.type === 'CANCEL_SEARCH') {
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      return;
    }

    if (data.type === 'START_SEARCH') {
      // Cancel previous search if running
      if (currentAbortController) {
        currentAbortController.abort();
      }

      currentAbortController = new AbortController();
      const signal = currentAbortController.signal;

      try {
        const matches = await searchBookProgressive(data.sections, data.query, {
          ...data.options,
          signal,
          onProgress: (progress) => {
            const resp: SearchWorkerProgressResponse = {
              type: 'SEARCH_PROGRESS',
              progress,
            };
            self.postMessage(resp);
          },
        });

        if (!signal.aborted) {
          const completeResp: SearchWorkerCompleteResponse = {
            type: 'SEARCH_COMPLETE',
            matches,
          };
          self.postMessage(completeResp);
        }
      } catch (err: unknown) {
        if ((!(err instanceof Error) || err.name !== 'AbortError')) {
          console.error('[baglib:search-worker] Search worker error:', err);
        }
      } finally {
        currentAbortController = null;
      }
    }
  };
}
