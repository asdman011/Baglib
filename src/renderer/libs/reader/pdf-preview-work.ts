/** A preview belongs both to its mounted viewer and to the document that painted it. */
export function waitForPdfPreview(viewer: AbortSignal, document: AbortSignal): Promise<boolean> {
  if (viewer.aborted || document.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    const finish = (ready: boolean) => {
      clearTimeout(timer);
      viewer.removeEventListener('abort', cancel);
      document.removeEventListener('abort', cancel);
      resolve(ready);
    };
    const cancel = () => finish(false);
    const timer = setTimeout(() => finish(true), 600);
    viewer.addEventListener('abort', cancel, { once: true });
    document.addEventListener('abort', cancel, { once: true });
  });
}
