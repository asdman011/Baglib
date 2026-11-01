import { parentPort, workerData } from 'node:worker_threads';
import Database from 'better-sqlite3';
import { poetryDetail, poetryFacets, poetryVariants, searchPoetry, searchPoets, type PoetryQuery } from './services/poetry/queries';
import type { PoetQuery } from '../shared/types/poetry';
const database = new Database(workerData.filename, { readonly: true, fileMustExist: true });
database.pragma('query_only = ON');
database.pragma('mmap_size = 268435456');
database.pragma('cache_size = -64000');
parentPort!.on('message', (request: { id: number; operation: string; input: unknown }) => {
  try {
    let data: unknown;
    if (request.operation === 'search') {
      if (!request.input || typeof request.input !== 'object' || Array.isArray(request.input)) throw new Error('invalid-poetry-query');
      data = searchPoetry(database, request.input as PoetryQuery);
    } else if (request.operation === 'detail') data = poetryDetail(database, request.input as number);
    else if (request.operation === 'facets') data = poetryFacets(database);
    else if (request.operation === 'variants') data = poetryVariants(database);
    else if (request.operation === 'poets') data = searchPoets(database, request.input as PoetQuery);
    else throw new Error('invalid-poetry-query');
    parentPort!.postMessage({ id: request.id, ok: true, data });
  } catch { parentPort!.postMessage({ id: request.id, ok: false }); }
});
