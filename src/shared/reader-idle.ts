export function waitForReaderIdle(target: EventTarget, signal: AbortSignal, delay = 150): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener('scroll', restart, true);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => { cleanup(); reject(new Error('cancelled')); };
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { cleanup(); resolve(); }, delay);
    };
    if (signal.aborted) { abort(); return; }
    target.addEventListener('scroll', restart, true);
    signal.addEventListener('abort', abort, { once: true });
    restart();
  });
}
