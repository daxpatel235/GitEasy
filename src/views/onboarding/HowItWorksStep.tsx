import { ArrowDownIcon, ArrowUpIcon, ChangesIcon, CheckIcon } from "@/components/Icons";
import { Stagger } from "./OnboardingShell";

/**
 * The one concept worth a screen: where work lives, and what moves it.
 *
 * This is an explanation, not a question. There is no choice to make between
 * working "locally" or "in the cloud" — Git always does both, and presenting
 * it as a preference would teach the wrong model on the first screen. So the
 * step simply draws the three places a file can be and names the two verbs
 * that move it between them, which is the whole mental model.
 */
export function HowItWorksStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col">
      <Stagger>
        <h1 className="display text-[30px] font-semibold leading-tight">
          Your work lives in three places
        </h1>
        <p className="mt-3 max-w-[500px] text-[16px] leading-relaxed text-muted">
          That is the whole idea. Understand this one picture and the rest of Git stops being
          mysterious.
        </p>
      </Stagger>

      <div className="mt-8 flex flex-col gap-[10px]">
        <Stagger delay={130}>
          <Place
            icon={<ChangesIcon className="h-[20px] w-[20px]" />}
            tone="neutral"
            step="1"
            title="The folder you edit"
            body="Your files, exactly as they are right now. GitEasy watches them and lists what you changed — but does nothing else until you say so."
          />
        </Stagger>

        <Stagger delay={200}>
          <Connector label="Commit" description="records a snapshot" />
        </Stagger>

        <Stagger delay={260}>
          <Place
            icon={<CheckIcon className="h-[20px] w-[20px]" />}
            tone="accent"
            step="2"
            title="This computer"
            body="A permanent, private history of every snapshot you took. Nobody else can see it, you can go back to any point in it, and you can do this as often as you like."
          />
        </Stagger>

        <Stagger delay={330}>
          <Connector label="Push" description="uploads those snapshots" />
        </Stagger>

        <Stagger delay={390}>
          <Place
            icon={<ArrowUpIcon className="h-[20px] w-[20px]" />}
            tone="warn"
            step="3"
            title="GitHub"
            body="The shared copy, and your backup. Once work reaches here your team — or the world — can see it, so GitEasy always shows you exactly what is about to go up first."
          />
        </Stagger>
      </div>

      <Stagger delay={470} className="mt-7">
        <div className="flex items-start gap-3 rounded-card border border-line-soft bg-surface/40 px-4 py-[13px] backdrop-blur-xl">
          <ArrowDownIcon className="mt-[2px] h-[17px] w-[17px] flex-none text-muted" />
          <p className="text-[13.5px] leading-relaxed text-muted">
            It runs the other way too. <span className="font-medium text-content">Pull</span>{" "}
            brings other people&rsquo;s work down from GitHub into your folder. Do it before you
            start and you will rarely hit a problem.
          </p>
        </div>
      </Stagger>

      <Stagger delay={550} className="mt-7">
        <button
          type="button"
          onClick={onNext}
          className="w-full rounded-lg bg-accent px-6 py-[13px] text-[16px] font-semibold text-accent-ink shadow-lg transition-all hover:bg-accent-hover hover:shadow-xl"
        >
          Got it
        </button>
        <p className="mt-3 text-center text-[13px] text-faint">
          Every one of these words is explained again inside the app, whenever you meet it.
        </p>
      </Stagger>
    </div>
  );
}

function Place({
  icon,
  tone,
  step,
  title,
  body,
}: {
  icon: React.ReactNode;
  tone: "neutral" | "accent" | "warn";
  step: string;
  title: string;
  body: string;
}) {
  const styles = {
    neutral: { ring: "border-line", chip: "bg-surface-alt text-muted" },
    accent: { ring: "border-accent/35", chip: "bg-accent/15 text-accent" },
    warn: { ring: "border-modified/40", chip: "bg-modified/15 text-modified" },
  }[tone];

  return (
    <div
      className={`flex items-start gap-4 rounded-card border ${styles.ring} bg-surface/60 p-[18px] backdrop-blur-xl`}
    >
      <span className={`grid h-11 w-11 flex-none place-items-center rounded-xl ${styles.chip}`}>
        {icon}
      </span>

      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[12px] text-faint">{step}</span>
          <span className="text-[17px] font-semibold">{title}</span>
        </div>
        <p className="mt-[5px] text-[14px] leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}

/** The verb between two places, drawn as an arrow rather than described. */
function Connector({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex items-center gap-3 pl-[22px]">
      <span className="h-[18px] w-[2px] flex-none rounded-full bg-line" />
      <span className="inline-flex items-center gap-2 rounded-full border border-line-soft bg-surface/70 px-3 py-[3px] backdrop-blur-xl">
        <span className="text-[13px] font-semibold text-content">{label}</span>
        <span className="text-[12.5px] text-faint">{description}</span>
      </span>
    </div>
  );
}
