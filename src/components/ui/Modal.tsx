import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  title: string;
  /** One line under the title. Optional, but nearly every dialog wants one. */
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** Colours the icon chip. `warn` for public or irreversible actions. */
  tone?: "accent" | "warn" | "danger" | "success";
  /** Blocks dismissal while an action is in flight. */
  busy?: boolean;
  /** Omit to make the dialog non-dismissible. */
  onClose?: () => void;
  children: ReactNode;
  /** Buttons, pinned to the bottom of the dialog. */
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
}

const TONES = {
  accent: "bg-accent/15 text-accent",
  warn: "bg-modified/15 text-modified",
  danger: "bg-deleted/15 text-deleted",
  success: "bg-added/15 text-added",
} as const;

const WIDTHS = { sm: "max-w-[420px]", md: "max-w-[560px]", lg: "max-w-[720px]" } as const;

/**
 * Shared dialog shell.
 *
 * Everything behind it is blurred so a decision has the user's full attention.
 * Escape and backdrop clicks close it unless an action is running or the
 * dialog was opened without an `onClose`, which is how the connect flow keeps
 * the user on the branch question until they answer it.
 */
export function Modal({
  title,
  subtitle,
  icon,
  tone = "accent",
  busy = false,
  onClose,
  children,
  footer,
  width = "md",
}: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);

  // Move focus into the dialog so keyboard users are not left behind it.
  useEffect(() => {
    const target = panel.current?.querySelector<HTMLElement>(
      "[data-autofocus], button, input, textarea, select",
    );
    target?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid animate-fade-in place-items-center overflow-y-auto bg-black/50 p-6 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`my-auto flex w-full ${WIDTHS[width]} animate-scale-in flex-col gap-5 rounded-xl border border-line bg-surface p-6 shadow-2xl`}
      >
        <div className="flex items-start gap-4">
          {icon && (
            <span
              className={`grid h-11 w-11 flex-none place-items-center rounded-full ${TONES[tone]}`}
            >
              {icon}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="display text-[19px] font-semibold">{title}</h2>
            {subtitle && <div className="mt-1 text-[14px] leading-relaxed text-muted">{subtitle}</div>}
          </div>
        </div>

        {children}

        {footer && <div className="flex gap-3">{footer}</div>}
      </div>
    </div>
  );
}
