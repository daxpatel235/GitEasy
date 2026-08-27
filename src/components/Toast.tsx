import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, CloseIcon, DotIcon, WarningIcon } from "./Icons";

export type ToastTone = "success" | "warn" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

/** How long each tone lingers. Warnings stay longer because they carry advice. */
const LIFETIME: Record<ToastTone, number> = {
  success: 4_000,
  info: 4_000,
  warn: 7_000,
  error: 9_000,
};

/**
 * Transient confirmations.
 *
 * Git actions are mostly invisible when they succeed, which leaves a beginner
 * unsure whether anything happened. Every action in the app therefore says
 * what it did in a sentence — and, where it matters, what that means next
 * ("committed on this computer; push when you want to share it").
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), LIFETIME[tone]));
    },
    [dismiss],
  );

  // Clear pending timers if the app unmounts mid-toast.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}

const TONES: Record<ToastTone, { border: string; icon: React.ReactNode }> = {
  success: {
    border: "border-added/45",
    icon: <CheckIcon className="h-[15px] w-[15px] text-added" />,
  },
  warn: {
    border: "border-modified/45",
    icon: <WarningIcon className="h-[15px] w-[15px] text-modified" />,
  },
  error: {
    border: "border-deleted/45",
    icon: <WarningIcon className="h-[15px] w-[15px] text-deleted" />,
  },
  info: {
    border: "border-line",
    icon: <DotIcon className="h-[15px] w-[15px] text-accent" />,
  },
};

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-full max-w-[380px] flex-col gap-2"
    >
      {toasts.map((toast) => {
        const tone = TONES[toast.tone];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex animate-rise-in items-start gap-[10px] rounded-lg border ${tone.border} bg-surface px-[13px] py-[11px] shadow-2xl backdrop-blur-xl`}
          >
            <span className="mt-[1px] flex-none">{tone.icon}</span>
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-content">
              {toast.message}
            </p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 flex-none rounded p-1 text-faint transition-colors hover:bg-surface-alt hover:text-content"
            >
              <CloseIcon className="h-[13px] w-[13px]" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
