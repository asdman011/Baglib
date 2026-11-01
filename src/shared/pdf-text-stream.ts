export interface PdfTextChunk<Item, Styles> { items: Item[]; styles: Styles; lang: string | null }

type Schedule = (work: () => void) => void;

const scheduleIdle: Schedule = work => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(work, { timeout: 250 });
  else setTimeout(work, 0);
};

/**
 * Feeds PDF.js's TextLayer in small idle slices, so building a dense page's spans never occupies a whole frame.
 */
export function idlePdfTextStream<Item, Styles extends object>(content: PdfTextChunk<Item, Styles>, size = 48, schedule: Schedule = scheduleIdle): ReadableStream<PdfTextChunk<Item, Styles>> {
  let offset = 0, cancelled = false;
  return new ReadableStream({
    pull: controller => new Promise<void>(resolve => {
      schedule(() => {
        // TextLayer cancels when its page leaves the screen, which can land while this slice waits for idle time.
        if (cancelled) { /* the stream is already closed */ }
        else if (offset >= content.items.length && offset > 0) controller.close();
        else {
          controller.enqueue({ items: content.items.slice(offset, offset + size), styles: offset === 0 ? content.styles : {} as Styles, lang: content.lang });
          offset = Math.max(1, offset + size);
          if (content.items.length === 0) controller.close();
        }
        resolve();
      });
    }),
    cancel: () => { cancelled = true; },
  }, new CountQueuingStrategy({ highWaterMark: 0 }));
}
