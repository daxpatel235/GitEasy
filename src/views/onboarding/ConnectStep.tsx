import { DownloadIcon, FolderIcon, PlusIcon, WarningIcon } from "@/components/Icons";
import { Stagger } from "./OnboardingShell";

interface ConnectStepProps {
  onSelect: () => void;
  onClone: () => void;
  onCreate: () => void;
  connecting: boolean;
  error: string | null;
}

export function ConnectStep({ onSelect, onClone, onCreate, connecting, error }: ConnectStepProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <Stagger>
        <span className="grid h-[64px] w-[64px] place-items-center rounded-[20px] border border-line bg-surface/70 text-accent backdrop-blur-xl">
          <FolderIcon className="h-7 w-7" />
        </span>
      </Stagger>

      <Stagger delay={120} className="mt-7">
        <h1 className="display text-[30px] font-semibold leading-tight">Open your project</h1>
        <p className="mx-auto mt-3 max-w-[420px] text-[16px] leading-relaxed text-muted">
          Choose the folder your code lives in. GitEasy reads the Git settings already inside it
          and works out the rest.
        </p>
      </Stagger>

      <Stagger delay={240} className="mt-8 w-full">
        <button
          type="button"
          onClick={onSelect}
          disabled={connecting}
          className="w-full max-w-[320px] rounded-lg bg-accent px-6 py-[14px] text-[16px] font-semibold text-accent-ink shadow-lg transition-all hover:bg-accent-hover hover:shadow-xl disabled:opacity-60"
        >
          {connecting ? "Opening…" : "Choose folder"}
        </button>

        <div className="mx-auto mt-4 flex max-w-[320px] items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[12.5px] text-faint">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <div className="mx-auto mt-4 flex max-w-[320px] flex-col gap-2">
          <button
            type="button"
            onClick={onCreate}
            disabled={connecting}
            className="inline-flex items-center justify-center gap-[7px] rounded-lg border border-line bg-surface/60 px-5 py-[11px] text-[14.5px] text-content backdrop-blur-xl transition-colors hover:bg-surface-alt disabled:opacity-60"
          >
            <PlusIcon className="h-[16px] w-[16px]" />
            Start a new project
          </button>

          <button
            type="button"
            onClick={onClone}
            disabled={connecting}
            className="inline-flex items-center justify-center gap-[7px] rounded-lg border border-line bg-surface/60 px-5 py-[11px] text-[14.5px] text-content backdrop-blur-xl transition-colors hover:bg-surface-alt disabled:opacity-60"
          >
            <DownloadIcon className="h-[16px] w-[16px]" />
            Download one from GitHub
          </button>
        </div>
      </Stagger>

      {error && (
        <div className="mt-5 flex max-w-[440px] animate-rise-in items-start gap-3 rounded-card border border-deleted/40 bg-deleted/10 px-4 py-3 text-left">
          <WarningIcon className="mt-[2px] h-[18px] w-[18px] flex-none text-deleted" />
          <div>
            <div className="text-[14.5px] font-medium text-content">
              That folder won&rsquo;t work
            </div>
            <p className="mt-[2px] text-[13.5px] leading-relaxed text-muted">{error}</p>
          </div>
        </div>
      )}

      <Stagger delay={340} className="mt-8">
        <div className="rounded-card border border-line-soft bg-surface/40 px-5 py-4 text-left backdrop-blur-xl">
          <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-faint">
            Not sure which folder?
          </div>
          <p className="mt-2 max-w-[440px] text-[13.5px] leading-relaxed text-muted">
            Pick the top folder of your project — the one containing your code. If you downloaded
            it from GitHub, that is the folder it created. If it has a hidden{" "}
            <span className="font-mono text-[12.5px] text-content">.git</span> folder inside, it
            is the right one.
          </p>
        </div>
      </Stagger>
    </div>
  );
}
