import { useEffect, useRef, useState } from "react";
import { ArrowDownIcon, CloseIcon, RefreshIcon } from "./Icons";
import type { UpdateState } from "@/hooks/useAppUpdate";

interface UpdatePillProps extends UpdateState {
  onDownload: () => void;
  onRestart: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}

/**
 * The update indicator, in the top bar beside the other status.
 *
 * It is deliberately a small pill rather than a dialog. An update is good news
 * about something that is already handled — it is not a decision that should
 * take over the screen while somebody is halfway through a commit.
 *
 * Nothing is shown at all until there is genuinely something to say, so in the
 * ordinary case this component renders nothing.
 */
export function UpdatePill({
  phase,
  version,
  notes,
  progress,
  error,
  onDownload,
  onRestart,
  onSkip,
  onDismiss,
}: UpdatePillProps) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  // Close the panel on an outside click or Escape, like every other popover.
  useEffect(() => {
    if (!open) return;

    function onDown(e: MouseEvent) {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // "Checking" is never shown: a check that finds nothing should leave no trace.
  if (phase === "idle" || phase === "checking") return null;

  const label =
    phase === "ready"
      ? "Restart to update"
      : phase === "downloading"
        ? progress === null
          ? "Downloading…"
          : `Downloading ${progress}%`
        : phase === "failed"
          ? "Update failed"
          : `Update to ${version}`;

  const tone =
    phase === "ready"
      ? "border-added/40 bg-added/10 text-added hover:bg-added/15"
      : phase === "failed"
        ? "border-modified/40 bg-modified/10 text-modified hover:bg-modified/15"
        : "border-accent/40 bg-accent/10 text-accent hover:bg-accent/15";

  return (
    <div ref={wrapper} className="relative flex-none">
      <button
        type="button"
        onClick={() => (phase === "ready" ? onRestart() : setOpen((v) => !v))}
        title={
          phase === "ready"
            ? "Restart now to finish updating"
            : phase === "failed"
              ? (error ?? "The update could not be installed")
              : `GitEasy ${version} is available`
        }
        className={`inline-flex items-center gap-[6px] rounded-md border px-[10px] py-[5px] text-[12.5px] font-medium transition-colors ${tone}`}
      >
        {phase === "downloading" ? (
          <RefreshIcon className="h-[13px] w-[13px] animate-spin" />
        ) : (
          <ArrowDownIcon className="h-[13px] w-[13px]" />
        )}
        {label}
      </button>

      {/* A hairline progress bar under the pill, so the download reads as
          progress rather than as a button that stopped responding. */}
      {phase === "downloading" && (
        <span className="absolute inset-x-[2px] -bottom-[3px] h-[2px] overflow-hidden rounded-full bg-accent/15">
          <span
            className={`block h-full rounded-full bg-accent transition-[width] duration-200 ${
              progress === null ? "w-1/3 animate-pulse" : ""
            }`}
            style={progress === null ? undefined : { width: `${progress}%` }}
          />
        </span>
      )}

      {open && phase !== "downloading" && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[320px] animate-scale-in rounded-lg border border-line bg-surface p-4 shadow-2xl">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-[13.5px] font-semibold">
                {phase === "failed" ? "That update did not install" : `GitEasy ${version}`}
              </h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                {phase === "failed"
                  ? error
                  : "Downloaded and verified. It will be applied the next time GitEasy starts."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDismiss();
              }}
              title="Not now"
              className="-mr-1 -mt-1 rounded p-1 text-faint transition-colors hover:bg-surface-alt hover:text-content"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </div>

          {notes && phase !== "failed" && (
            <p className="mt-2 max-h-[120px] overflow-y-auto whitespace-pre-line rounded border border-line-soft bg-ground/40 p-2 text-[12px] leading-relaxed text-muted">
              {notes.trim()}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            {phase === "available" && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDownload();
                }}
                className="rounded-md bg-accent px-3 py-[6px] text-[12.5px] font-medium text-accent-ink transition-opacity hover:opacity-90"
              >
                Download now
              </button>
            )}

            {phase === "failed" && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDownload();
                }}
                className="rounded-md bg-accent px-3 py-[6px] text-[12.5px] font-medium text-accent-ink transition-opacity hover:opacity-90"
              >
                Try again
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSkip();
              }}
              className="rounded-md border border-line px-3 py-[6px] text-[12.5px] text-muted transition-colors hover:bg-surface-alt hover:text-content"
            >
              Skip this version
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
