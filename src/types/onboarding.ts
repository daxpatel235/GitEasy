/**
 * First-run experience.
 *
 * GitEasy is local-only — there is no account, no login and nothing to sign up
 * for. Onboarding therefore asks only what changes what the user sees: how the
 * app should look, and which project to open.
 *
 * It deliberately does not ask the user to choose between working locally and
 * working with GitHub. That is not a setting — it is how Git works, and both
 * halves are always available. Onboarding explains the difference instead, and
 * the connection itself is confirmed by the dialog that opens the moment a
 * folder is picked.
 */

export type OnboardingStep = "welcome" | "how-it-works" | "appearance" | "connect";

/** Steps in order. `welcome` is a bookend without a progress dot. */
export const STEP_ORDER: readonly OnboardingStep[] = [
  "welcome",
  "how-it-works",
  "appearance",
  "connect",
] as const;

/** Steps that count toward the progress indicator. */
export const PROGRESS_STEPS: readonly OnboardingStep[] = [
  "how-it-works",
  "appearance",
  "connect",
] as const;

export function stepIndex(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step);
}

export function nextStep(step: OnboardingStep): OnboardingStep {
  const i = stepIndex(step);
  return STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)]!;
}

export function previousStep(step: OnboardingStep): OnboardingStep {
  const i = stepIndex(step);
  return STEP_ORDER[Math.max(i - 1, 0)]!;
}
