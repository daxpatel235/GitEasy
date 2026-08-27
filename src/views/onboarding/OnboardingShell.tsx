import type { ReactNode } from "react";
import { PROGRESS_STEPS, type OnboardingStep } from "@/types/onboarding";

interface OnboardingShellProps {
  step: OnboardingStep;
  children: ReactNode;
  /** Hidden on the welcome and ready screens, which are bookends. */
  showProgress?: boolean;
  onBack?: () => void;
  onSkip?: () => void;
}

/**
 * Frame shared by every onboarding screen.
 *
 * Two slow-drifting radial washes sit behind the content, tinted by the active
 * theme, so changing the palette on the appearance step visibly changes the
 * room the user is standing in.
 */
export function OnboardingShell({
  step,
  children,
  showProgress = true,
  onBack,
  onSkip,
}: OnboardingShellProps) {
  const current = PROGRESS_STEPS.indexOf(step);

  return (
    <div className="relative grid h-full place-items-center overflow-hidden bg-ground px-6 py-10">
      {/* Ambient depth. Purely decorative, and calm enough to ignore. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -right-[15%] -top-[20%] h-[70vh] w-[70vh] animate-drift rounded-full blur-[100px]"
          style={{ background: "rgb(var(--glow-a) / 0.28)" }}
        />
        <div
          className="absolute -bottom-[25%] -left-[15%] h-[60vh] w-[60vh] animate-drift rounded-full blur-[100px]"
          style={{ background: "rgb(var(--glow-b) / 0.24)", animationDelay: "-9s" }}
        />
      </div>

      {(onBack || onSkip) && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-7 py-6">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-md px-3 py-[6px] text-[14px] text-muted transition-colors hover:bg-surface-alt hover:text-content"
            >
              Back
            </button>
          ) : (
            <span />
          )}

          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-md px-3 py-[6px] text-[14px] text-muted transition-colors hover:bg-surface-alt hover:text-content"
            >
              Skip
            </button>
          )}
        </div>
      )}

      <main
        className={`relative z-10 max-h-full w-full max-w-[620px] overflow-y-auto py-2 ${
          showProgress ? "pb-14" : ""
        }`}
      >
        {children}
      </main>

      {showProgress && current >= 0 && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 flex justify-center pb-8"
          aria-label={`Step ${current + 1} of ${PROGRESS_STEPS.length}`}
        >
          <div className="flex items-center gap-2">
            {PROGRESS_STEPS.map((s, i) => (
              <span
                key={s}
                className={`h-[6px] rounded-full transition-all duration-300 ${
                  i === current
                    ? "w-7 bg-accent"
                    : i < current
                      ? "w-[6px] bg-accent/50"
                      : "w-[6px] bg-line"
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Staggered entrance for a screen's children. */
export function Stagger({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div className={`animate-rise-in ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
