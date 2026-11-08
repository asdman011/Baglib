'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';

const dialogs: HTMLElement[] = [];
const openers = new WeakMap<HTMLElement, HTMLElement | null>();
const selector = 'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]';

export function useDialogFocus(open: boolean, onEscape: () => void, initialFocus?: RefObject<HTMLElement | null>) {
  const ref = useRef<HTMLDivElement>(null);
  const escape = useRef(onEscape);
  useLayoutEffect(() => { escape.current = onEscape; });

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const childIndex = dialogs.findIndex(entry => dialog.contains(entry));
    const opener = childIndex >= 0 ? openers.get(dialogs[childIndex]) ?? null :
      document.activeElement instanceof window.HTMLElement ? document.activeElement : null;
    openers.set(dialog, opener);
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter(element =>
      element.tabIndex >= 0 && !element.matches(':disabled') &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
      (element.getClientRects?.().length ?? 0) > 0 && getComputedStyle(element).visibility !== 'hidden');
    const focusInside = () => (focusable()[0] ?? dialog).focus({ preventScroll: true });
    if (childIndex >= 0) dialogs.splice(childIndex, 0, dialog);
    else dialogs.push(dialog);
    if (dialogs.at(-1) === dialog && !dialog.contains(document.activeElement)) {
      if (initialFocus?.current && dialog.contains(initialFocus.current)) initialFocus.current.focus({ preventScroll: true });
      else focusInside();
    }
    const keydown = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== dialog || event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        escape.current();
      } else if (event.key === 'Tab') {
        const elements = focusable();
        const index = elements.indexOf(document.activeElement as HTMLElement);
        if (!elements.length || index < 0 || (event.shiftKey ? index === 0 : index === elements.length - 1)) {
          event.preventDefault();
          (event.shiftKey ? elements.at(-1) ?? dialog : elements[0] ?? dialog).focus({ preventScroll: true });
        }
      }
    };
    const focusin = (event: FocusEvent) => {
      if (dialogs.at(-1) === dialog && !dialog.contains(event.target as Node)) focusInside();
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      const top = dialogs.at(-1);
      const wasTop = !!top && (top === dialog || dialog.contains(top));
      for (let index = dialogs.length - 1; index >= 0; index--) {
        if (dialogs[index] === dialog || dialog.contains(dialogs[index])) dialogs.splice(index, 1);
      }
      if (wasTop && opener?.isConnected && !dialog.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, initialFocus]);

  return ref;
}
