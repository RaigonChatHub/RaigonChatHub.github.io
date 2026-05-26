'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
};

type Toast = ToastInput & {
  id: number;
  variant: ToastVariant;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const variantClasses: Record<ToastVariant, string> = {
  success: 'border-emerald-500/30 bg-emerald-950/95 text-emerald-50',
  error: 'border-red-500/30 bg-red-950/95 text-red-50',
  info: 'border-sky-500/30 bg-slate-950/95 text-slate-50',
};

const variantIcons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((items) => items.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ title, description, variant = 'info' }: ToastInput) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((items) => {
        const withoutDuplicate = items.filter(
          (toast) => toast.title !== title || toast.description !== description || toast.variant !== variant,
        );

        return [...withoutDuplicate, { id, title, description, variant }].slice(-3);
      });
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3">
        {toasts.map((toast) => {
          const Icon = variantIcons[toast.variant];

          return (
            <div
              key={toast.id}
              role={toast.variant === 'error' ? 'alert' : 'status'}
              className={`rounded-xl border p-4 shadow-2xl shadow-black/30 backdrop-blur ${variantClasses[toast.variant]}`}
            >
              <div className="flex gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{toast.title}</p>
                  {toast.description && (
                    <p className="mt-1 text-sm opacity-80">{toast.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={() => dismiss(toast.id)}
                  className="rounded-md p-1 opacity-70 transition hover:bg-white/10 hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used inside ToastProvider');
  }

  return context;
}
