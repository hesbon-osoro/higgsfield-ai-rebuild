'use client';

import clsx from 'clsx';
import { createContext, useCallback, useContext, useState } from 'react';

type Tone = 'info' | 'error' | 'success';
interface Toast {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}

const ToastContext = createContext<(message: string, tone?: Tone, action?: Toast['action']) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Tone = 'info', action?: Toast['action']) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 7000 : 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'animate-pop pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-2xl backdrop-blur',
              t.tone === 'error' && 'border-danger/40 bg-[#2a1411]/95 text-[#ffd9d4]',
              t.tone === 'success' && 'border-ok/30 bg-[#11231a]/95 text-[#d6f7e3]',
              t.tone === 'info' && 'border-line-strong bg-raised/95 text-fg',
            )}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                onClick={t.action.onClick}
                className="text-accent hover:text-accent-hover shrink-0 font-semibold"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
