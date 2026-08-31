import { memo, useEffect, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BranchIcon,
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  RepoIcon,
  SearchIcon,
  ShieldIcon,
  SyncIcon,
} from "./Icons";
import { timeAgo } from "@/lib/time";
import type { Branch, Repository, SyncState } from "@/types/git";

interface TopBarProps {
  repo: Repository;
  branches: Branch[];
  sync: SyncState | null;
  fetching: boolean;
  onSwitchBranch: (name: string) => void;
  onNewBranch: () => void;
  onFetch: () => void;
  onChangeRepository: () => void;
  /**
   * The update indicator, passed in rather than built here.
   *
   * It keeps its own state and would otherwise mean threading six props
   * through a component that is memoised precisely to avoid that.
   */
  update?: React.ReactNode;
}

const TopBarImpl = ({
  repo,
  branches,
  sync,
  fetching,
  onSwitchBranch,
  onNewBranch,
  onFetch,
  onChangeRepository,
  update,
}: TopBarProps) => {
  return (
    <header className="relative z-20 flex h-[48px] flex-none items-center gap-2 border-b border-line bg-surface/70 px-4 backdrop-blur-xl">
      <button
        type="button"
        onClick={onChangeRepository}
        title="Open a different project"
        className="flex min-w-0 items-center gap-[7px] rounded-md px-2 py-[5px] text-left transition-colors hover:bg-surface-alt"
      >
        <RepoIcon className="h-[15px] w-[15px] flex-none text-muted" />
        <span className="display truncate text-[14px] font-semibold">{repo.name}</span>
      </button>

      <span className="text-faint">/</span>

      <BranchSwitcher
        branches={branches}
        current={repo.branch}
        onSwitch={onSwitchBranch}
        onNew={onNewBranch}
      />

      <div className="ml-auto flex flex-none items-center gap-2">
        {update}
        {sync && <SyncPill sync={sync} />}

        <button
          type="button"
          onClick={onFetch}
          disabled={fetching}
          title={
            sync?.lastCheckedAt
              ? `Last checked ${timeAgo(sync.lastCheckedAt)}`
              : "Check GitHub for new work"
          }
          className="inline-flex items-center gap-[6px] rounded-md border border-line px-[10px] py-[5px] text-[12.5px] text-muted transition-colors hover:bg-surface-alt hover:text-content disabled:opacity-50"
        >
          <SyncIcon className={`h-[14px] w-[14px] ${fetching ? "animate-spin" : ""}`} />
          {fetching ? "Checking…" : "Check"}
        </button>
      </div>
    </header>
  );
}

/**
 * Ahead / behind at a glance.
 *
 * Two numbers people misread constantly, so each carries a direction arrow and
 * a tooltip in full sentences rather than Git's terse "2 ahead, 6 behind".
 */
function SyncPill({ sync }: { sync: SyncState }) {
  const clean = sync.ahead === 0 && sync.behind === 0;

  return (
    <span
      title={
        clean
          ? "Your branch matches GitHub exactly."
          : `${sync.ahead} commit${sync.ahead === 1 ? "" : "s"} here that GitHub does not have, and ` +
            `${sync.behind} on GitHub that you do not have.`
      }
      className="inline-flex items-center gap-[7px] rounded-full border border-line-soft bg-surface-alt px-[10px] py-[3px] font-mono text-2xs tabular-nums"
    >
      {clean ? (
        <span className="inline-flex items-center gap-[5px] text-added">
          <CheckIcon className="h-3 w-3" />
          in sync
        </span>
      ) : (
        <>
          <span className={sync.ahead > 0 ? "text-added" : "text-faint"}>
            <ArrowUpIcon className="mr-[2px] inline h-3 w-3" />
            {sync.ahead}
          </span>
          <span className={sync.behind > 0 ? "text-modified" : "text-faint"}>
            <ArrowDownIcon className="mr-[2px] inline h-3 w-3" />
            {sync.behind}
          </span>
        </>
      )}
    </span>
  );
}

/** Branch picker in the title bar — where every Git client puts it. */
function BranchSwitcher({
  branches,
  current,
  onSwitch,
  onNew,
}: {
  branches: Branch[];
  current: string;
  onSwitch: (name: string) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape, like every other menu on the OS.
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

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? branches.filter((b) => b.name.toLowerCase().includes(needle))
    : branches;

  return (
    <div ref={wrapper} className="relative flex-none">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQuery("");
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex max-w-[260px] items-center gap-[6px] rounded-full border border-line-soft bg-surface-alt py-[3px] pl-[9px] pr-[7px] font-mono text-xs text-muted transition-colors hover:border-line hover:text-content"
      >
        <BranchIcon className="h-3 w-3 flex-none" />
        <span className="truncate">{current}</span>
        <ChevronDownIcon
          className={`h-3 w-3 flex-none transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+7px)] z-30 w-[320px] animate-scale-in overflow-hidden rounded-lg border border-line bg-surface shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-line px-3">
            <SearchIcon className="h-[14px] w-[14px] flex-none text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a branch"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="flex-1 bg-transparent py-[10px] text-[13px] placeholder:text-faint focus:outline-none"
            />
          </div>

          <div className="max-h-[280px] overflow-y-auto py-1">
            {visible.length === 0 && (
              <p className="px-3 py-5 text-center text-[12.5px] text-muted">No match.</p>
            )}

            {visible.map((branch) => {
              const active = branch.name === current;
              return (
                <button
                  key={branch.name}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    if (!active) onSwitch(branch.name);
                  }}
                  className={`flex w-full items-center gap-[9px] px-3 py-[7px] text-left transition-colors hover:bg-surface-alt ${
                    active ? "bg-accent/10" : ""
                  }`}
                >
                  <span className="w-[14px] flex-none text-accent">
                    {active && <CheckIcon className="h-[13px] w-[13px]" />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-[5px]">
                      <span className="truncate font-mono text-[12.5px]">{branch.name}</span>
                      {branch.isProtected && (
                        <ShieldIcon className="h-3 w-3 flex-none text-modified" />
                      )}
                    </span>
                    {branch.lastCommit && (
                      <span className="mt-[1px] block truncate text-2xs text-faint">
                        {branch.lastCommit.author} · {timeAgo(branch.lastCommit.at)}
                      </span>
                    )}
                  </span>

                  {branch.isRemoteOnly && (
                    <span className="flex-none text-2xs text-faint">GitHub</span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onNew();
            }}
            className="flex w-full items-center gap-[9px] border-t border-line px-3 py-[9px] text-left text-[13px] text-accent transition-colors hover:bg-surface-alt"
          >
            <PlusIcon className="h-[14px] w-[14px] flex-none" />
            Start a new branch
          </button>
        </div>
      )}
    </div>
  );
}

export function BranchPill({ branch }: { branch: string }) {
  return (
    <span className="inline-flex items-center gap-[5px] rounded-full border border-line-soft bg-surface-alt py-[2px] pl-[7px] pr-[9px] font-mono text-xs text-muted">
      <BranchIcon className="h-3 w-3" />
      {branch}
    </span>
  );
}

/** Memoised: the parent re-renders on every keystroke in the commit box. */
export const TopBar = memo(TopBarImpl);
