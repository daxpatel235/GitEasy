import { useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs, PageHeader } from "@/components/ui/PageHeader";
import { Explain } from "@/components/Explain";
import {
  BranchIcon,
  CheckIcon,
  CircleSlashIcon,
  ExternalLinkIcon,
  PlayIcon,
  RefreshIcon,
  WarningIcon,
} from "@/components/Icons";
import { duration, timeAgo } from "@/lib/time";
import type { RunStatus, WorkflowRun } from "@/types/github";

type Filter = "all" | "failing" | "mine";

interface ChecksViewProps {
  runs: WorkflowRun[];
  currentBranch: string;
  loading: boolean;
  busy: boolean;
  signedIn: boolean;
  onRerun: (id: string) => void;
  onOpenUrl: (url: string) => void;
  onSignIn: () => void;
}

/**
 * GitHub Actions, explained.
 *
 * A red tick on a commit is the single most common way a beginner discovers
 * that something automated is even running. This screen names what ran, on
 * which commit, and offers the one useful action — run it again.
 */
export function ChecksView({
  runs,
  currentBranch,
  loading,
  busy,
  signedIn,
  onRerun,
  onOpenUrl,
  onSignIn,
}: ChecksViewProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(
    () => ({
      all: runs.length,
      failing: runs.filter((r) => r.status === "failure").length,
      mine: runs.filter((r) => r.branch === currentBranch).length,
    }),
    [runs, currentBranch],
  );

  const visible = useMemo(
    () =>
      runs.filter((run) => {
        if (filter === "failing") return run.status === "failure";
        if (filter === "mine") return run.branch === currentBranch;
        return true;
      }),
    [runs, filter, currentBranch],
  );

  if (!signedIn) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Checks" subtitle={BLURB} />
        <EmptyState
          icon={<PlayIcon className="h-6 w-6" />}
          title="Sign in to GitHub"
          body="Checks run on GitHub's machines, so reading their results needs an account."
          action={
            <Button variant="primary" onClick={onSignIn}>
              Sign in to GitHub
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Checks" subtitle={BLURB}>
        <FilterTabs
          active={filter}
          onChange={setFilter}
          tabs={[
            { id: "all", label: "All runs", count: counts.all },
            { id: "failing", label: "Failing", count: counts.failing },
            { id: "mine", label: "This branch", count: counts.mine },
          ]}
        />
      </PageHeader>

      {counts.failing > 0 && filter !== "failing" && (
        <div className="flex items-center gap-3 rounded-card border border-deleted/40 bg-deleted/10 px-4 py-3">
          <WarningIcon className="h-[18px] w-[18px] flex-none text-deleted" />
          <p className="flex-1 text-[13.5px] text-muted">
            {counts.failing} {counts.failing === 1 ? "check is" : "checks are"} failing. A red
            check means something you pushed broke — open the run to see which test complained.
          </p>
          <Button onClick={() => setFilter("failing")} className="flex-none px-3 py-[6px] text-[13px]">
            Show them
          </Button>
        </div>
      )}

      {loading ? (
        <p className="py-12 text-center text-[13.5px] text-muted">Loading from GitHub…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<PlayIcon className="h-6 w-6" />}
          title="No runs"
          body="This project either has no automated checks set up, or nothing has triggered them yet. Projects add them in a .github/workflows folder."
        />
      ) : (
        <div className="flex flex-col gap-[6px]">
          {visible.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              busy={busy}
              onRerun={() => onRerun(run.id)}
              onOpen={() => onOpenUrl(run.url)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const BLURB = (
  <>
    Many projects run tests, linters and builds automatically on every push. This is what those
    runs did. <Explain term="actions" />
  </>
);

const STATUS: Record<
  RunStatus,
  { tone: BadgeTone; label: string; icon: React.ReactNode; ring: string }
> = {
  success: {
    tone: "success",
    label: "Passed",
    icon: <CheckIcon className="h-[15px] w-[15px]" />,
    ring: "bg-added/12 text-added",
  },
  failure: {
    tone: "danger",
    label: "Failed",
    icon: <WarningIcon className="h-[15px] w-[15px]" />,
    ring: "bg-deleted/12 text-deleted",
  },
  running: {
    tone: "warn",
    label: "Running",
    icon: <RefreshIcon className="h-[15px] w-[15px] animate-spin" />,
    ring: "bg-modified/12 text-modified",
  },
  queued: {
    tone: "neutral",
    label: "Queued",
    icon: <PlayIcon className="h-[15px] w-[15px]" />,
    ring: "bg-surface-alt text-muted",
  },
  cancelled: {
    tone: "neutral",
    label: "Cancelled",
    icon: <CircleSlashIcon className="h-[15px] w-[15px]" />,
    ring: "bg-surface-alt text-faint",
  },
};

function RunRow({
  run,
  busy,
  onRerun,
  onOpen,
}: {
  run: WorkflowRun;
  busy: boolean;
  onRerun: () => void;
  onOpen: () => void;
}) {
  const status = STATUS[run.status];

  return (
    <div className="settings-row group">
      <span
        className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-lg border border-line-soft ${status.ring}`}
      >
        {status.icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-medium">{run.name}</span>
          <Badge tone={status.tone}>{status.label}</Badge>
        </span>

        <span className="mt-[3px] flex flex-wrap items-center gap-x-2 text-[12.5px] text-faint">
          <span className="truncate">{run.commitMessage}</span>
          <span>·</span>
          <span className="font-mono text-[11.5px]">{run.shortHash}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-[3px]">
            <BranchIcon className="h-3 w-3" />
            <span className="font-mono text-[11.5px]">{run.branch}</span>
          </span>
        </span>
      </span>

      <span className="flex flex-none flex-col items-end gap-[3px] text-[12px] text-faint">
        <span>{timeAgo(run.startedAt)}</span>
        <span className="font-mono tabular-nums">
          {run.durationMs === null ? "in progress" : duration(run.durationMs)}
        </span>
      </span>

      <span className="flex flex-none items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {run.status !== "running" && run.status !== "queued" && (
          <button
            type="button"
            onClick={onRerun}
            disabled={busy}
            title="Run these checks again"
            aria-label={`Re-run ${run.name}`}
            className="rounded-md border border-line-soft p-[6px] text-muted transition-colors hover:border-line hover:bg-surface-alt hover:text-content disabled:opacity-40"
          >
            <RefreshIcon className="h-[14px] w-[14px]" />
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          title="Open the full log on GitHub"
          aria-label={`Open ${run.name} on GitHub`}
          className="rounded-md border border-line-soft p-[6px] text-muted transition-colors hover:border-line hover:bg-surface-alt hover:text-content"
        >
          <ExternalLinkIcon className="h-[14px] w-[14px]" />
        </button>
      </span>
    </div>
  );
}
