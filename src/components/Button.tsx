import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `primary` — the ordinary, reversible action (saving locally).
   * `danger`  — the public, hard-to-undo action (sending to GitHub). Amber
   *             rather than red: this is "be careful", not "something broke".
   */
  variant?: "primary" | "secondary" | "danger";
  children: ReactNode;
}

const BASE =
  "inline-flex items-center justify-center gap-[7px] rounded-md px-4 py-[10px] text-[15px] font-medium border transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none";

const VARIANTS = {
  primary:
    "bg-accent border-accent text-accent-ink font-semibold hover:bg-accent-hover hover:border-accent-hover",
  secondary: "bg-surface border-line text-content hover:bg-surface-alt",
  danger:
    "bg-modified border-modified text-ground font-semibold hover:brightness-110 shadow-[0_0_0_3px_rgb(var(--st-modified)/0.18)]",
} as const;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", className = "", children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`${BASE} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});
