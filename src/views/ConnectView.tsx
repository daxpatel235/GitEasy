import { Button } from "@/components/Button";
import {
  DownloadIcon,
  FolderIcon,
  GitEasyLogo,
  PlusIcon,
  RepoIcon,
  TrashIcon,
  WarningIcon,
} from "@/components/Icons";
import { timeAgo } from "@/lib/time";
import type { RecentRepository } from "@/types/git";

interface ConnectViewProps {
  onSelect: () => void;
  onClone: () => void;
  onCreate: () => void;
  connecting: boolean;
  error: string | null;
  /** Projects opened before, newest first. */
  recents?: RecentRepository[];
  onOpenRecent?: (path: string) => void;
  onForgetRecent?: (path: string) => void;
}

/** Shown to a returning user who has no project open. */
export function ConnectView({
  onSelect,
  onClone,
  onCreate,
  connecting,
  error,
  recents = [],
  onOpenRecent,
  onForgetRecent,
}: ConnectViewProps) {
  return (
    <div className="ambient relative grid h-full place-items-center bg-ground p-6">
      <div className="relative z-10 flex w-full max-w-[400px] flex-col items-center text-center">
        <div className="mb-6 flex items-center gap-[9px]">
          <GitEasyLogo className="h-[22px] w-[22px] text-accent" />
          <span className="display text-[15px] font-semibold">GitEasy</span>
        </div>

        <h1 className="display text-[21px] font-semibold">Open a project</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Pick a folder that is already a Git project, start a new one, or download one from
          GitHub.
        </p>

        <div className="mt-6 flex w-full flex-col gap-2">
          <Button variant="primary" onClick={onSelect} disabled={connecting} className="w-full">
            <FolderIcon className="h-[15px] w-[15px]" />
            {connecting ? "Opening…" : "Choose a folder"}
          </Button>

          <Button onClick={onCreate} disabled={connecting} className="w-full">
            <PlusIcon className="h-[15px] w-[15px]" />
            New project
          </Button>

          <Button onClick={onClone} disabled={connecting} className="w-full">
            <DownloadIcon className="h-[15px] w-[15px]" />
            Download from GitHub
          </Button>
        </div>

        {/* Reopening should not mean navigating the file picker again. */}
        {recents.length > 0 && (
          <div className="mt-7 w-full text-left">
            <div className="px-1 pb-[6px] text-2xs font-semibold uppercase tracking-[0.08em] text-faint">
              Recent
            </div>

            <div className="overflow-hidden rounded-lg border border-line">
              {recents.map((recent, index) => (
                <div
                  key={recent.path}
                  className={`group flex items-center gap-3 px-3 py-[9px] transition-colors ${
                    index === 0 ? "" : "border-t border-line-soft"
                  } ${recent.exists ? "hover:bg-surface-alt" : "opacity-60"}`}
                >
                  <button
                    type="button"
                    onClick={() => recent.exists && onOpenRecent?.(recent.path)}
                    disabled={!recent.exists || connecting}
                    title={recent.path}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                  >
                    <RepoIcon className="h-[15px] w-[15px] flex-none text-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">
                        {recent.name}
                      </span>
                      <span className="mt-[1px] block truncate text-[12px] text-faint">
                        {recent.exists
                          ? `Opened ${timeAgo(recent.lastOpenedAt)}`
                          : "This folder has moved or been deleted"}
                      </span>
                    </span>
                  </button>

                  {onForgetRecent && (
                    <button
                      type="button"
                      onClick={() => onForgetRecent(recent.path)}
                      aria-label={`Remove ${recent.name} from this list`}
                      className="flex-none rounded-md border border-transparent p-[6px] text-faint opacity-0 transition-colors hover:border-line-soft hover:text-deleted focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <TrashIcon className="h-[13px] w-[13px]" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-5 flex w-full items-start gap-3 rounded-card border border-deleted/40 bg-deleted/10 px-4 py-3 text-left">
            <WarningIcon className="mt-[2px] h-[16px] w-[16px] flex-none text-deleted" />
            <p className="text-[13px] leading-relaxed text-muted">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
