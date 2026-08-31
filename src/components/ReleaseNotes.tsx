import { useEffect, useMemo, useRef, useState } from "react";
import { gitService } from "@/services";
import { RELEASE_NOTES, type Highlight } from "@/data/releaseNotes";
import {
  BoltIcon,
  GitEasyMark,
  PaletteIcon,
  RepoIcon,
  ShieldIcon,
  SparkleIcon,
} from "./Icons";

/** Where the last version the user actually ran is kept. */
const SEEN_KEY = "app.lastSeenVersion";

/**
 * Stands in for "some version before GitEasy started recording this".
 *
 * 1.0.1 and earlier never wrote `SEEN_KEY`, so upgrading from one of them
 * leaves it empty. Treating that as 1.0.1 means those users still get the
 * notes for what they are updating *to*.
 */
const UNKNOWN_EARLIER_VERSION = "1.0.1";

const ICONS = {
  sparkle: SparkleIcon,
  bolt: BoltIcon,
  shield: ShieldIcon,
  brush: PaletteIcon,
  repo: RepoIcon,
} as const;

/**
 * Compare two dotted versions. Returns > 0 when `a` is newer than `b`.
 *
 * Only the numeric parts are compared, so a pre-release suffix sorts with its
 * base version rather than throwing the comparison off.
 */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v.split(".").map((part) => Number.parseInt(part, 10) || 0);

  const left = parse(a);
  const right = parse(b);

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * What's new, shown once after an update.
 *
 * Three rules keep this from becoming the thing everybody dismisses on sight.
 *
 * 1. **Never on a first run.** Somebody who has just installed GitEasy has not
 *    updated anything; they get the onboarding, not a changelog.
 * 2. **Once per version.** The version is recorded as soon as the notes are
 *    shown, so it cannot reappear on the next launch.
 * 3. **Only what changed.** Skipping two releases shows both sets of notes,
 *    newest first, rather than only the latest.
 */
export function ReleaseNotes({ enabled = true }: { enabled?: boolean }) {
  const [showing, setShowing] = useState<string[] | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const checked = useRef(false);

  useEffect(() => {
    if (!enabled || checked.current) return;
    checked.current = true;

    let cancelled = false;

    void (async () => {
      try {
        // Versions before this key existed recorded nothing, so an empty key
        // is ambiguous: it means either a fresh install or an upgrade from one
        // of those. The recent-projects list settles it — somebody who has
        // opened a project here before has used GitEasy before. Settings alone
        // would not do, since a user who never changed a toggle has none.
        const [settings, recents] = await Promise.all([
          gitService.getSettings(),
          gitService.getRecentRepositories().catch(() => []),
        ]);
        if (cancelled) return;

        const usedBefore = recents.length > 0 || Object.keys(settings).length > 0;
        const seen = settings[SEEN_KEY] || (usedBefore ? UNKNOWN_EARLIER_VERSION : undefined);

        // Record the current version straight away, whether or not anything is
        // shown. A crash while the dialog is open must not mean seeing it again
        // on every launch afterwards.
        if (settings[SEEN_KEY] !== __APP_VERSION__) {
          void gitService.setSetting(SEEN_KEY, __APP_VERSION__).catch(() => undefined);
        }

        // A fresh install has no recorded version. That is not an update, so
        // there is nothing to announce.
        if (!seen || seen === __APP_VERSION__) return;

        const unseen = RELEASE_NOTES.filter(
          (note) =>
            compareVersions(note.version, seen) > 0 &&
            compareVersions(note.version, __APP_VERSION__) <= 0,
        ).map((note) => note.version);

        if (unseen.length > 0) setShowing(unseen);
      } catch {
        // Without the database there is no way to know what was seen before,
        // and guessing wrong means showing this to somebody twice. Staying
        // quiet is the better failure.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const notes = useMemo(
    () => RELEASE_NOTES.filter((note) => showing?.includes(note.version)),
    [showing],
  );

  useEffect(() => {
    if (notes.length === 0) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowing(null);
    }
    document.addEventListener("keydown", onKey);

    // Focus the dismiss button so the dialog can be closed from the keyboard.
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    return () => document.removeEventListener("keydown", onKey);
  }, [notes.length]);

  if (notes.length === 0) return null;

  const [latest] = notes;
  if (!latest) return null;

  const released = new Date(latest.date).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-50 grid animate-fade-in place-items-center overflow-y-auto bg-black/50 p-6 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowing(null);
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`What's new in GitEasy ${latest.version}`}
        className="my-auto flex w-full max-w-[560px] animate-scale-in flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
      >
        {/* The brand moment. A flat dialog would read as an error, not an
            invitation to look at what changed. */}
        <header className="relative overflow-hidden bg-gradient-to-br from-accent to-accent-hover px-6 pb-6 pt-7 text-accent-ink">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-accent-ink/10 blur-2xl"
          />
          <div className="relative flex items-center gap-3">
            <GitEasyMark className="h-10 w-10 flex-none rounded-[8px] shadow-lg" />
            <div className="min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-accent-ink/70">
                Updated to {latest.version}
              </p>
              <h2 className="display text-[20px] font-semibold leading-tight">
                What&rsquo;s new in GitEasy
              </h2>
            </div>
          </div>
          <p className="relative mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-accent-ink/85">
            {latest.headline}
          </p>
        </header>

        <div className="flex max-h-[46vh] flex-col gap-5 overflow-y-auto px-6 py-5">
          {notes.map((note, index) => (
            <section key={note.version} className="flex flex-col gap-[10px]">
              {/* Only labelled when more than one release is being caught up
                  on — otherwise the header above already said the version. */}
              {notes.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-2xs font-semibold text-accent">
                    {note.version}
                  </span>
                  <span className="h-px flex-1 bg-line-soft" />
                </div>
              )}

              {index === 0 && notes.length === 1 && (
                <p className="text-2xs uppercase tracking-[0.07em] text-faint">
                  Released {released}
                </p>
              )}

              {note.highlights.map((highlight) => (
                <HighlightRow key={highlight.title} highlight={highlight} />
              ))}
            </section>
          ))}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line bg-surface-alt/50 px-6 py-4">
          <p className="text-2xs text-faint">
            Every release is listed under Settings &rsaquo; About.
          </p>
          <button
            type="button"
            data-autofocus
            onClick={() => setShowing(null)}
            className="rounded-md bg-accent px-4 py-[7px] text-[13px] font-medium text-accent-ink transition-opacity hover:opacity-90"
          >
            Get back to work
          </button>
        </footer>
      </div>
    </div>
  );
}

function HighlightRow({ highlight }: { highlight: Highlight }) {
  const Icon = ICONS[highlight.icon];

  return (
    <div className="flex gap-3">
      <span className="mt-[2px] grid h-7 w-7 flex-none place-items-center rounded-full bg-accent/12 text-accent">
        <Icon className="h-[14px] w-[14px]" />
      </span>
      <div className="min-w-0">
        <h3 className="text-[13.5px] font-semibold leading-snug">{highlight.title}</h3>
        <p className="mt-[3px] max-w-[52ch] text-[12.5px] leading-relaxed text-muted">
          {highlight.body}
        </p>
      </div>
    </div>
  );
}
