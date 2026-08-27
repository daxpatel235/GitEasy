import { useCallback, useState } from "react";
import { OnboardingShell } from "./OnboardingShell";
import { WelcomeStep } from "./WelcomeStep";
import { HowItWorksStep } from "./HowItWorksStep";
import { AppearanceStep } from "./AppearanceStep";
import { ConnectStep } from "./ConnectStep";
import { nextStep, previousStep, type OnboardingStep } from "@/types/onboarding";

/** Matches the rise-out animation so content clears before the next step enters. */
const EXIT_MS = 200;

interface OnboardingProps {
  connecting: boolean;
  connectError: string | null;
  onSelectRepository: () => void;
  onCloneRepository: () => void;
  onCreateRepository: () => void;
}

/**
 * Four screens, then the folder picker.
 *
 * There is no "you're all set" screen at the end: choosing a folder opens the
 * connection dialog, which confirms Git is wired up and asks the one question
 * that matters. Finishing that dialog finishes onboarding, so the user never
 * reads two confirmations of the same thing.
 */
export function Onboarding({
  connecting,
  connectError,
  onSelectRepository,
  onCloneRepository,
  onCreateRepository,
}: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [leaving, setLeaving] = useState(false);

  /** Play the exit animation, then swap the step. */
  const goTo = useCallback((target: OnboardingStep) => {
    setLeaving(true);
    window.setTimeout(() => {
      setStep(target);
      setLeaving(false);
    }, EXIT_MS);
  }, []);

  const advance = useCallback(() => goTo(nextStep(step)), [goTo, step]);
  const goBack = useCallback(() => goTo(previousStep(step)), [goTo, step]);

  const canGoBack = step !== "welcome" && !connecting;

  return (
    <OnboardingShell
      step={step}
      showProgress={step !== "welcome"}
      onBack={canGoBack ? goBack : undefined}
      onSkip={step === "appearance" ? advance : undefined}
    >
      <div className={leaving ? "animate-rise-out" : ""}>
        {step === "welcome" && <WelcomeStep onNext={advance} />}

        {step === "how-it-works" && <HowItWorksStep onNext={advance} />}

        {step === "appearance" && <AppearanceStep onNext={advance} />}

        {step === "connect" && (
          <ConnectStep
            onSelect={onSelectRepository}
            onClone={onCloneRepository}
            onCreate={onCreateRepository}
            connecting={connecting}
            error={connectError}
          />
        )}
      </div>
    </OnboardingShell>
  );
}
