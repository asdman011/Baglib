'use client';

import { useEffect, useRef } from 'react';
import { useToast, type ToastOptions } from '../components/ui/Toast';

/** One persistent, updated notification for an active operation, removed on completion/unmount. */
export function useProgressFeedback(active: boolean, message: string, action?: ToastOptions['action']) {
  const { showToast, updateToast, dismissToast } = useToast();
  const id = useRef<string | null>(null);
  const actionRef = useRef(action);
  useEffect(() => { actionRef.current = action; }, [action]);
  useEffect(() => {
    if (active) {
      const options = { message, duration: 0, ...(actionRef.current ? { action: actionRef.current } : {}) };
      if (id.current) updateToast(id.current, options);
      else id.current = showToast(options);
    } else if (id.current) {
      dismissToast(id.current);
      id.current = null;
    }
  }, [active, message, showToast, updateToast, dismissToast]);
  useEffect(() => () => { if (id.current) dismissToast(id.current); }, [dismissToast]);
}
