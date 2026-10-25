const internalNotices = new Set([
  'Ran out of space in font private use area.',
  'Empty "FlateDecode" stream.',
  'Indexing all PDF objects',
  'Indexing all PDF objects.',
]);

export function installPdfDiagnosticFilter(target: Pick<Console, 'log' | 'warn'> = console): () => void {
  const originalLog = target.log;
  const originalWarn = target.warn;
  const shouldFilter = (args: unknown[]) => args.length === 1 && typeof args[0] === 'string' && internalNotices.has(args[0].replace(/^Warning:\s*/, '').trim());
  const log = (...args: unknown[]) => { if (!shouldFilter(args)) originalLog.apply(target, args); };
  const warn = (...args: unknown[]) => { if (!shouldFilter(args)) originalWarn.apply(target, args); };
  target.log = log;
  target.warn = warn;
  return () => {
    if (target.log === log) target.log = originalLog;
    if (target.warn === warn) target.warn = originalWarn;
  };
}
