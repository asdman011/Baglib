'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export type ToastType = 'default' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  message: React.ReactNode;
  type?: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => unknown;
  };
}

export interface ToastItem extends ToastOptions {
  id: string;
  createdAt: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

const iconMap: Record<ToastType, React.ReactNode> = {
  default: <Info className="size-4 text-focus" aria-hidden="true" />,
  success: <CheckCircle className="size-4 text-success" aria-hidden="true" />,
  warning: <AlertCircle className="size-4 text-warning" aria-hidden="true" />,
  danger: <AlertCircle className="size-4 text-danger" aria-hidden="true" />,
};

const SingleToast: React.FC<{
  toast: ToastItem;
  onDismiss: (id: string) => void;
}> = ({ toast, onDismiss }) => {
  const { t } = useWorkspace();
  const { showToast } = useToast();
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const remainingTimeRef = useRef(toast.duration ?? 5000);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (toast.duration === 0) return; // Persistent toast

    if (paused) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (startTimeRef.current !== null) {
        const elapsed = Date.now() - startTimeRef.current;
        remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
      }
      return;
    }

    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      onDismiss(toast.id);
    }, remainingTimeRef.current);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [paused, toast.id, toast.duration, onDismiss]);

  const type = toast.type || 'default';
  const isAssertive = type === 'danger';

  return (
    <div
      role={isAssertive ? 'alert' : 'status'}
      aria-live={isAssertive ? 'assertive' : 'polite'}
      data-feedback-toast
      onFocus={() => setPaused(true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="flex items-center gap-3 p-3.5 bg-surface border border-border rounded-xl shadow-lg text-text font-sans text-xs min-w-0 w-full max-w-md pointer-events-auto transition-all animate-in fade-in slide-in-from-bottom-2"
    >
      <span className="shrink-0">{iconMap[type]}</span>
      <div className="flex-1 min-w-0 font-medium leading-relaxed">
        {toast.message}
      </div>

      {toast.action && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (actionPending.current) return;
            actionPending.current = true;
            setBusy(true);
            try {
              await toast.action?.onClick();
            } catch {
              showToast({ message: t('feedbackActionFailed'), type: 'danger' });
            } finally {
              onDismiss(toast.id);
            }
          }}
          className="shrink-0 font-bold text-primary-text hover:underline px-2 py-1 rounded focus-visible:outline-2 focus-visible:outline-focus cursor-pointer"
        >
          {toast.action.label}
        </button>
      )}

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={t('close')}
        title={t('close')}
        className="shrink-0 p-1 rounded-md text-text-muted hover:text-text hover:bg-canvas transition-colors focus-visible:outline-2 focus-visible:outline-focus cursor-pointer"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { dir } = useWorkspace();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((options: ToastOptions): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: ToastItem = {
      ...options,
      id,
      createdAt: Date.now(),
    };
    setToasts((prev) => [...prev.slice(-2), newToast]);
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {/* Toast live region container */}
      <div
        dir={dir}
        className="fixed bottom-9 start-4 end-4 z-[10000] flex flex-col gap-2 pointer-events-none sm:end-auto sm:w-96"
      >
        {toasts.map((toast) => (
          <SingleToast key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
