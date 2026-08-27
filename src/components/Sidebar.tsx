import { memo } from "react";
import {
  ArchiveIcon,
  BookIcon,
  BoxIcon,
  BranchIcon,
  ChangesIcon,
  GitEasyLogo,
  HistoryIcon,
  HomeIcon,
  IssueIcon,
  PlayIcon,
  PlusIcon,
  PullRequestIcon,
  SearchIcon,
  SettingsIcon,
  SyncIcon,
} from "./Icons";
import type { View } from "@/types/navigation";

interface NavItem {
  id: View;
  label: string;
  Icon: typeof HomeIcon;
  /** Which count from `counts` to show on the right, if any. */
  badge?: keyof NavCounts;
  /** Needs a GitHub remote to be useful. */
  needsRemote?: boolean;
}

export interface NavCounts {
  changes: number;
  shelf: number;
  sync: number;
  pullRequests: number;
  issues: number;
  failingChecks: number;
}

/**
 * Grouped rather than flat.
 *
 * The split is the one that matters conceptually: the first group is your
 * computer, the second is GitHub. A user who understands only that much
 * already understands the thing beginners get wrong most often.
 */
const GROUPS: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [{ id: "home", label: "Overview", Icon: HomeIcon }],
  },
  {
    title: "This computer",
    items: [
      { id: "changes", label: "Changes", Icon: ChangesIcon, badge: "changes" },
      { id: "history", label: "History", Icon: HistoryIcon },
      { id: "branches", label: "Branches", Icon: BranchIcon },
      { id: "shelf", label: "Shelf", Icon: ArchiveIcon, badge: "shelf" },
    ],
  },
  {
    title: "GitHub",
    items: [
      { id: "sync", label: "Sync", Icon: SyncIcon, badge: "sync" },
      {
        id: "pull-requests",
        label: "Pull requests",
        Icon: PullRequestIcon,
        badge: "pullRequests",
        needsRemote: true,
      },
      { id: "issues", label: "Issues", Icon: IssueIcon, badge: "issues", needsRemote: true },
      { id: "checks", label: "Checks", Icon: PlayIcon, badge: "failingChecks", needsRemote: true },
      { id: "releases", label: "Releases", Icon: BoxIcon, needsRemote: true },
    ],
  },
  {
    title: null,
    items: [
      { id: "learn", label: "Learn Git", Icon: BookIcon },
      { id: "settings", label: "Settings", Icon: SettingsIcon },
    ],
  },
];

interface SidebarProps {
  view: View;
  onNavigate: (view: View) => void;
  counts: NavCounts;
  hasRemote: boolean;
  onOpenPalette: () => void;
  onNewProject: () => void;
}

const SidebarImpl = ({
  view,
  onNavigate,
  counts,
  hasRemote,
  onOpenPalette,
  onNewProject,
}: SidebarProps) => {
  return (
    <aside className="relative z-10 flex w-[212px] flex-none flex-col gap-4 overflow-y-auto border-r border-line bg-surface/70 px-3 py-[18px] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-[9px] px-2">
        <div className="flex min-w-0 items-center gap-[9px]">
          <GitEasyLogo className="h-[24px] w-[24px] flex-none text-accent" />
          <span className="display truncate text-[17px] font-semibold">GitEasy</span>
        </div>

        <button
          type="button"
          onClick={onNewProject}
          title="Start a new project in a folder"
          aria-label="New project"
          className="flex-none rounded-md p-1 text-faint transition-colors hover:bg-surface-alt hover:text-content"
        >
          <PlusIcon className="h-[15px] w-[15px]" />
        </button>
      </div>

      {/* The palette is the fastest route to anything, so it sits above the nav. */}
      <button
        type="button"
        onClick={onOpenPalette}
        className="flex items-center gap-[8px] rounded-md border border-line-soft bg-ground/60 px-[10px] py-[7px] text-left text-[13px] text-faint transition-colors hover:border-line hover:text-muted"
      >
        <SearchIcon className="h-[14px] w-[14px] flex-none" />
        <span className="flex-1">Search…</span>
        <kbd className="font-mono text-2xs">Ctrl K</kbd>
      </button>

      <nav className="flex flex-col gap-4" aria-label="Main">
        {GROUPS.map((group, groupIndex) => (
          <div key={group.title ?? `group-${groupIndex}`} className="flex flex-col gap-[2px]">
            {group.title && (
              <div className="px-2 pb-1 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">
                {group.title}
              </div>
            )}

            {group.items.map(({ id, label, Icon, badge, needsRemote }) => {
              const active = view === id;
              const count = badge ? counts[badge] : 0;
              const dimmed = needsRemote && !hasRemote;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate(id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full items-center gap-[10px] rounded-md px-2 py-[7px] text-left text-[14px] transition-colors duration-150 ${
                    active
                      ? "bg-surface-alt font-medium text-content"
                      : "text-muted hover:bg-surface-alt hover:text-content"
                  } ${dimmed ? "opacity-45" : ""}`}
                >
                  <Icon className="h-[17px] w-[17px] flex-none opacity-85" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>

                  {count > 0 && (
                    <span
                      className={`ml-auto flex-none rounded-full px-[6px] py-[1px] font-mono text-2xs tabular-nums ${
                        badge === "failingChecks"
                          ? "bg-deleted/15 text-deleted"
                          : active
                            ? "bg-accent/15 text-accent"
                            : "bg-line/60 text-faint"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

/** Memoised: the parent re-renders on every keystroke in the commit box. */
export const Sidebar = memo(SidebarImpl);
