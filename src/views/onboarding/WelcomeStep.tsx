import { GitEasyMark } from "@/components/Icons";
import { Stagger } from "./OnboardingShell";

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* The first thing anyone sees, so it is the real brand mark rather than
          a themed glyph on a surface. */}
      <div className="animate-logo-in">
        <GitEasyMark className="h-[76px] w-[76px] rounded-[22px] shadow-lg" />
      </div>

      <Stagger delay={140} className="mt-8">
        <h1 className="display text-[42px] font-semibold leading-[1.1]">GitEasy</h1>
      </Stagger>

      <Stagger delay={240} className="mt-4">
        <p className="max-w-[430px] text-[17px] leading-relaxed text-muted">
          Save your work and share it on GitHub — without learning a single
          command.
        </p>
      </Stagger>

      <Stagger delay={360} className="mt-10 w-full">
        <button
          type="button"
          onClick={onNext}
          className="w-full max-w-[300px] rounded-lg bg-accent px-6 py-[14px] text-[16px] font-semibold text-accent-ink shadow-lg transition-all hover:bg-accent-hover hover:shadow-xl"
        >
          Get started
        </button>
      </Stagger>

      <Stagger delay={460} className="mt-6">
        <p className="text-[13.5px] text-faint">
          Everything stays on your computer. No account needed.
        </p>
      </Stagger>
    </div>
  );
}
