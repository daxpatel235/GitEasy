import { memo } from "react";
import { Button } from "@/components/Button";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar, ChecksDot } from "./HistoryView";
import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BranchIcon,
  ChangesIcon,
  CheckIcon,
  ForkIcon,
  IssueIcon,
  PlayIcon,
  PullRequestIcon,
  WarningIcon,
} from "@/components/Icons";
import { timeAgo } from "@/lib/time";
import type { ChangedFile, Commit, Conflict, Repository, Stash, SyncState } from "@/types/git";
import type { Issue, PullRequest, WorkflowRun } from "@/types/github";
import type { View } from "@/types/navigation";

interface HomeViewProps {
  repo: Repository;
  files: ChangedFile[];
  branchCount: number;
  commits: Commit[];
  conflicts: Conflict[];
  stashes: Stash[];
  sync: SyncState | null;
  pullRequests: PullRequest[];
  issues: Issue[];
  runs: WorkflowRun[];
  onNavigate: (view: View) => void;
}

/**
 * The screen that answers "what should I do next?".
 *
 * Built as a priority list rather than a set of statistics: anything needing
 * attention appears at the top as a card with the action on it, and the app
 * says so plainly when there is nothing to do — which is itself useful
 * information for someone who is not sure whether they have forgotten a step.
 */
const HomeViewImpl = ({
  repo,
  files,
  branchCount,
  commits,
  conflicts,
  stashes,
  sync,
  pullRequests,
  issues,
  runs,
  onNavigate,
}: HomeViewProps) => {
  const unpushed = sync?.ahead ?? 0;
  const behind = sync?.behind ?? 0;
  const upstreamBehind = sync?.upstreamBehind ?? 0;
  const failing = runs.filter((r) => r.status === "failure").length;
  const reviewsWaiting = pullRequests.filter((p) => p.reviewRequested).length;
  const myIssues = issues.filter((i) => i.assignedToMe && i.state === "open").length;

  const tasks: TaskCard[] = [];

  if (conflicts.length > 0) {
    tasks.push({
      tone: "danger",
      icon: <WarningIcon className="h-[18px] w-[18px]" />,
      title: `${conflicts.length} ${conflicts.length === 1 ? "file needs" : "files need"} a decision`,
      body: "Two versions of the same lines are waiting for you to pick one. Nothing else can proceed until this is settled.",
      action: "Resolve now",
      view: "changes",
    });
  }

  if (files.length > 0) {
    tasks.push({
      tone: "accent",
      icon: <ChangesIcon className="h-[18px] w-[18px]" />,
      title: `${files.length} ${files.length === 1 ? "file" : "files"} changed`,
      body: "Review what you edited, describe it, and commit. This step stays entirely on your computer.",
      action: "Review changes",
      view: "changes",
    });
  }

  if (unpushed > 0) {
    tasks.push({
      tone: "warn",
      icon: <ArrowUpIcon className="h-[18px] w-[18px]" />,
      title: `${unpushed} ${unpushed === 1 ? "commit" : "commits"} not on GitHub`,
      body: "Your work is safe on this computer but nobody else can see it — and it is not backed up anywhere.",
      action: "Push",
      view: "sync",
    });
  }

  if (behind > 0) {
    tasks.push({
      tone: "info",
      icon: <ArrowDownIcon className="h-[18px] w-[18px]" />,
      title: `${behind} new ${behind === 1 ? "commit" : "commits"} waiting`,
      body: "Other people have pushed work you do not have yet. Pull before you start editing to avoid conflicts later.",
      action: "Get updates",
      view: "sync",
    });
  }

  if (repo.upstream && upstreamBehind > 0) {
    tasks.push({
      tone: "info",
      icon: <ForkIcon className="h-[18px] w-[18px]" />,
      title: `${repo.upstream.slug} is ${upstreamBehind} commits ahead`,
      body: "The project you forked has moved on. Sync your copy so your changes sit on top of current code.",
      action: "Sync fork",
      view: "sync",
    });
  }

  if (failing > 0) {
    tasks.push({
      tone: "danger",
      icon: <PlayIcon className="h-[18px] w-[18px]" />,
      title: `${failing} ${failing === 1 ? "check is" : "checks are"} failing`,
      body: "Automated tests on GitHub found a problem with something that was pushed.",
      action: "See what broke",
      view: "checks",
    });
  }

  if (reviewsWaiting > 0) {
    tasks.push({
      tone: "accent",
      icon: <PullRequestIcon className="h-[18px] w-[18px]" />,
      title: `${reviewsWaiting} pull ${reviewsWaiting === 1 ? "request needs" : "requests need"} your review`,
      body: "Somebody is blocked until you take a look at their work.",
      action: "Review",
      view: "pull-requests",
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={repo.name}
        subtitle={
          <span className="font-mono text-[12.5px]">{repo.path}</span>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral" icon={<BranchIcon className="h-[11px] w-[11px]" />}>
            {repo.branch}
          </Badge>
          {repo.upstream && (
            <Badge tone="neutral" icon={<ForkIcon className="h-[11px] w-[11px]" />}>
              fork of {repo.upstream.slug}
            </Badge>
          )}
          {sync && sync.ahead === 0 && sync.behind === 0 && (
            <Badge tone="success" icon={<CheckIcon className="h-[11px] w-[11px]" />}>
              In sync with GitHub
            </Badge>
          )}
          {stashes.length > 0 && (
            <Badge tone="neutral" icon={<ArchiveIcon className="h-[11px] w-[11px]" />}>
              {stashes.length} shelved
            </Badge>
          )}
        </div>
      </PageHeader>

      <section className="flex flex-col gap-3">
        <h2 className="display text-[16px] font-semibold">
          {tasks.length === 0 ? "You are all caught up" : "Needs your attention"}
        </h2>

        {tasks.length === 0 ? (
          <div className="flex items-center gap-4 rounded-card border border-added/30 bg-added/8 px-4 py-4">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-added/15 text-added">
              <CheckIcon className="h-5 w-5" />
            </span>
            <p className="text-[13.5px] leading-relaxed text-muted">
              Nothing is waiting. Your files match your last commit, everything you have
              committed is on GitHub, and there is nothing to pull. Go and write some code.
            </p>
          </div>
        ) : (
          <div className="grid gap-[6px] sm:grid-cols-2">
            {tasks.map((task) => (
              <TaskTile key={task.title} task={task} onGo={() => onNavigate(task.view)} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-[16px] font-semibold">Recent commits</h2>
            <NavLink onClick={() => onNavigate("history")}>All history</NavLink>
          </div>

          <div className="flex flex-col gap-[6px]">
            {commits.slice(0, 5).map((commit) => (
              <div key={commit.hash} className="settings-row py-[10px]">
                <Avatar name={commit.author} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{commit.message}</span>
                  <span className="mt-[1px] block text-[12px] text-faint">
                    {commit.author} · {timeAgo(commit.at)}
                  </span>
                </span>
                {commit.isLocal && <Badge tone="warn">Local</Badge>}
                <ChecksDot state={commit.checks} />
              </div>
            ))}

            {commits.length === 0 && (
              <p className="px-1 text-[13px] text-muted">No commits on this branch yet.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-[16px] font-semibold">On GitHub</h2>
            <NavLink onClick={() => onNavigate("pull-requests")}>Pull requests</NavLink>
          </div>

          <div className="flex flex-col gap-[6px]">
            <StatRow
              icon={<PullRequestIcon className="h-[15px] w-[15px]" />}
              label="Open pull requests"
              value={pullRequests.filter((p) => p.state === "open" || p.state === "draft").length}
              onClick={() => onNavigate("pull-requests")}
            />
            <StatRow
              icon={<IssueIcon className="h-[15px] w-[15px]" />}
              label="Open issues"
              value={issues.filter((i) => i.state === "open").length}
              hint={myIssues > 0 ? `${myIssues} assigned to you` : undefined}
              onClick={() => onNavigate("issues")}
            />
            <StatRow
              icon={<PlayIcon className="h-[15px] w-[15px]" />}
              label="Failing checks"
              value={failing}
              tone={failing > 0 ? "danger" : undefined}
              onClick={() => onNavigate("checks")}
            />
            <StatRow
              icon={<BranchIcon className="h-[15px] w-[15px]" />}
              label="Branches"
              value={branchCount}
              hint={`You are on ${repo.branch}`}
              onClick={() => onNavigate("branches")}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

interface TaskCard {
  tone: "danger" | "warn" | "accent" | "info";
  icon: React.ReactNode;
  title: string;
  body: string;
  action: string;
  view: View;
}

function TaskTile({ task, onGo }: { task: TaskCard; onGo: () => void }) {
  const tones = {
    danger: "border-deleted/40 bg-deleted/8",
    warn: "border-modified/40 bg-modified/8",
    accent: "border-accent/35 bg-accent/8",
    info: "border-line/70 bg-surface/50",
  }[task.tone];

  const chips = {
    danger: "bg-deleted/15 text-deleted",
    warn: "bg-modified/15 text-modified",
    accent: "bg-accent/15 text-accent",
    info: "bg-surface-alt text-muted",
  }[task.tone];

  return (
    <div className={`flex flex-col gap-3 rounded-card border p-4 ${tones}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 flex-none place-items-center rounded-lg ${chips}`}>
          {task.icon}
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold">{task.title}</div>
          <p className="mt-[3px] text-[12.5px] leading-relaxed text-muted">{task.body}</p>
        </div>
      </div>

      <Button
        variant={task.tone === "info" ? "secondary" : "primary"}
        onClick={onGo}
        className="self-start px-3 py-[6px] text-[13px]"
      >
        {task.action}
      </Button>
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="settings-row py-[10px]">
      <span className="grid h-[28px] w-[28px] flex-none place-items-center rounded-lg border border-line-soft bg-surface-alt text-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[13px] font-medium">{label}</span>
        {hint && <span className="mt-[1px] block text-[12px] text-faint">{hint}</span>}
      </span>
      <span
        className={`flex-none font-mono text-[15px] tabular-nums ${
          tone === "danger" && value > 0 ? "text-deleted" : "text-muted"
        }`}
      >
        {value}
      </span>
    </button>
  );
}

function NavLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12.5px] text-accent transition-colors hover:underline"
    >
      {children}
    </button>
  );
}

/** Memoised: the parent re-renders on every keystroke in the commit box. */
export const HomeView = memo(HomeViewImpl);
