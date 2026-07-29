"use client";

/**
 * Toasts live in the portal layout, above the page, so they survive the
 * client-side navigation that happens when approving advances to the next item.
 *
 * This is what makes one-tap approve safe: instead of a confirmation dialog
 * (which doubles the taps on every item to guard against a rare mistake), an
 * approval lands immediately and offers Undo for a few seconds.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Toast = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
};

type ToastInput = Omit<Toast, "id" | "durationMs"> & { durationMs?: number };

const ToastContext = createContext<{ push: (t: ToastInput) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      if (timer.current) clearTimeout(timer.current);
      const t: Toast = { id: nextId.current++, durationMs: 5000, ...input };
      setToast(t);
      timer.current = setTimeout(() => setToast(null), t.durationMs);
    },
    [],
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      >
        {toast && (
          <div
            key={toast.id}
            className="toast-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full bg-ink-950 py-3 pl-5 pr-3 text-white shadow-pop"
          >
            <span className="flex-1 text-body font-medium">{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  clear();
                }}
                className="shrink-0 rounded-full bg-white/15 px-4 py-1.5 text-body font-semibold transition hover:bg-white/25 active:scale-95"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
