import { memo, useState } from "react";
import { Button } from "@/components/Button";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Explain, TermHeading } from "@/components/Explain";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ExternalLinkIcon,
  ForkIcon,
  GitHubIcon,
  PlusIcon,
  SyncIcon,
  TrashIcon,
  WarningIcon,
} from "@/components/Icons";
import { timeAgo } from "@/lib/time";
import type { Remote, Repository, SyncState } from "@/types/git";

type PullStrategy = "merge" | "rebase";

interface SyncViewProps {
  repo: Repository;
  sync: SyncState | null;
  remotes: Remote[];
  busy: string | null;
  onFetch: () => void;
  onPull: (strategy: PullStrategy) => void;
  onPush: () => void;
  onSyncFork: () => void;
  onAddRemote: () => void;
  onRemoveRemote: (name: string) => void;
  onOpenUrl: (url: string) => void;
}

/**
 * One screen for every conversation this project has with a server.
 *
 * Grouped by direction rather than by command, because "am I behind or
 * ahead?" is the question people actually arrive with — and because a fork's
 * two remotes are otherwise impossible to keep straight.
 */
const SyncViewImpl = ({
  repo,
  sync,
  remotes,
  busy,
  onFetch,
  onPull,
  onPush,
  onSyncFork,
  onAddRemote,
  onRemoveRemote,
  onOpenUrl,
}: SyncViewProps) => {
  const [strategy, setStrategy] = useState<PullStrategy>("merge");

  const ahead = sync?.ahead ?? 0;
  const behind = sync?.behind ?? 0;
  const upstreamBehind = sync?.upstreamBehind ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sync"
        subtitle={
          <>
            Everything that moves work between this computer and GitHub. Checking costs nothing
            and changes nothing — do it whenever you are unsure. <Explain term="fetch" />
          </>
        }
        actions={
          <Button onClick={onFetch} disabled={busy !== null}>
            <SyncIcon className={`h-[15px] w-[15px] ${busy === "fetch" ? "animate-spin" : ""}`} />
            {busy === "fetch" ? "Checking…" : "Check for updates"}
          </Button>
        }
      />

      {/* Where you stand right now, before any verbs. */}
      <section className="grid gap-[6px] sm:grid-cols-2">
        <StatusCard
          tone={behind > 0 ? "warn" : "ok"}
          icon={<ArrowDownIcon className="h-[18px] w-[18px]" />}
          count={behind}
          title={behind === 0 ? "You have everything" : `${behind} waiting for you`}
          body={
            behind === 0
              ? `Nothing new on ${repo.branch} since you last checked.`
              : `Other people have pushed ${behind} commit${behind === 1 ? "" : "s"} you do not have yet.`
          }
        />
        <StatusCard
          tone={ahead > 0 ? "accent" : "ok"}
          icon={<ArrowUpIcon className="h-[18px] w-[18px]" />}
          count={ahead}
          title={ahead === 0 ? "Nothing to share" : `${ahead} ready to push`}
          body={
            ahead === 0
              ? "Everything you have committed is already on GitHub."
              : `You have ${ahead} commit${ahead === 1 ? "" : "s"} that only exist on this computer.`
          }
        />
      </section>

      {sync?.lastCheckedAt && (
        <p className="-mt-3 text-[12.5px] text-faint">
          Last checked {timeAgo(sync.lastCheckedAt)}.
        </p>
      )}

      {/* Bring work down. */}
      <ActionSection
        icon={<ArrowDownIcon className="h-[18px] w-[18px]" />}
        title={<TermHeading term="pull">Get the latest work</TermHeading>}
        body="Downloads what other people have pushed and combines it with yours. Do this before you start working and before you push."
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StrategyChip
              active={strategy === "merge"}
              onClick={() => setStrategy("merge")}
              title="Merge"
              body="Keeps both histories and adds a merge commit. The safe default."
            />
            <StrategyChip
              active={strategy === "rebase"}
              onClick={() => setStrategy("rebase")}
              title="Rebase"
              body="Replays your commits on top for a tidy straight line. Avoid on shared branches."
            />
          </div>

          {sync?.hasBlockingChanges && (
            <Notice tone="warn">
              You have uncommitted changes that touch the same files. Commit or shelve them
              first, or the merge will stop halfway.
            </Notice>
          )}

          <Button
            variant="primary"
            onClick={() => onPull(strategy)}
            disabled={busy !== null || behind === 0}
            className="self-start"
          >
            <ArrowDownIcon className="h-[15px] w-[15px]" />
            {busy === "pull"
              ? "Getting updates…"
              : behind === 0
                ? "Nothing to get"
                : `Pull ${behind} commit${behind === 1 ? "" : "s"}`}
          </Button>
        </div>
      </ActionSection>

      {/* Send work up. */}
      <ActionSection
        icon={<ArrowUpIcon className="h-[18px] w-[18px]" />}
        title={<TermHeading term="push">Share your work</TermHeading>}
        body="Uploads the commits sitting on this computer. This is the step that makes your work visible to everyone else."
      >
        <div className="flex flex-col gap-3">
          {behind > 0 && ahead > 0 && (
            <Notice tone="warn">
              You are both ahead and behind. Pull first — GitHub will reject a push that would
              overwrite the {behind} commit{behind === 1 ? "" : "s"} you are missing.
            </Notice>
          )}

          <Button
            variant="danger"
            onClick={onPush}
            disabled={busy !== null || ahead === 0}
            className="self-start"
          >
            <ArrowUpIcon className="h-[15px] w-[15px]" />
            {busy === "push"
              ? "Pushing…"
              : ahead === 0
                ? "Nothing to push"
                : `Push ${ahead} commit${ahead === 1 ? "" : "s"}`}
          </Button>
        </div>
      </ActionSection>

      {/* The requested fork flow. Only shown when there is an upstream. */}
      {repo.upstream ? (
        <ActionSection
          icon={<ForkIcon className="h-[18px] w-[18px]" />}
          title={<TermHeading term="syncFork">Update from the original project</TermHeading>}
          body={
            <>
              This project is a fork of{" "}
              <button
                type="button"
                onClick={() => onOpenUrl(repo.upstream!.url)}
                className="inline-flex items-center gap-[3px] font-medium text-accent hover:underline"
              >
                {repo.upstream.slug}
                <ExternalLinkIcon className="h-[12px] w-[12px]" />
              </button>
              . Your copy does not update itself — pull their newest work in so what you build
              sits on current code.
            </>
          }
          highlight={upstreamBehind > 0}
        >
          <div className="flex flex-col gap-3">
            {upstreamBehind > 0 ? (
              <Notice tone="warn">
                The original project is <strong>{upstreamBehind} commits ahead</strong> of your
                fork. Sync before you open a pull request, or reviewers will see conflicts that
                are not really yours.
              </Notice>
            ) : (
              <Notice tone="ok">
                Your fork is level with {repo.upstream.slug}. Nothing to bring down.
              </Notice>
            )}

            <Button
              variant={upstreamBehind > 0 ? "primary" : "secondary"}
              onClick={onSyncFork}
              disabled={busy !== null || upstreamBehind === 0}
              className="self-start"
            >
              <ForkIcon className="h-[15px] w-[15px]" />
              {busy === "fork"
                ? "Syncing…"
                : upstreamBehind === 0
                  ? "Already up to date"
                  : `Pull ${upstreamBehind} commits from ${repo.upstream.slug}`}
            </Button>
          </div>
        </ActionSection>
      ) : (
        <ActionSection
          icon={<ForkIcon className="h-[18px] w-[18px]" />}
          title={<TermHeading term="fork">Contributing to someone else&rsquo;s project?</TermHeading>}
          body="If this project is a copy of one you do not own, add the original as a second remote. GitEasy will then keep track of how far behind you are and offer to pull their changes in."
        >
          <Button onClick={onAddRemote} className="self-start">
            <PlusIcon className="h-[15px] w-[15px]" />
            Add the original project
          </Button>
        </ActionSection>
      )}

      {/* Remotes. */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="display flex items-center gap-[6px] text-[16px] font-semibold">
            <TermHeading term="remote">Servers this project talks to</TermHeading>
          </h2>
          <Button onClick={onAddRemote} className="px-3 py-[6px] text-[13px]">
            <PlusIcon className="h-[14px] w-[14px]" />
            Add
          </Button>
        </div>

        <div className="flex flex-col gap-[6px]">
          {remotes.map((remote) => (
            <div key={remote.name} className="settings-row group">
              <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg border border-line-soft bg-surface-alt text-muted">
                {remote.role === "upstream" ? (
                  <ForkIcon className="h-[15px] w-[15px]" />
                ) : (
                  <GitHubIcon className="h-[15px] w-[15px]" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[13.5px] font-medium">{remote.name}</span>
                  <Badge tone={remote.role === "origin" ? "accent" : "neutral"}>
                    {remote.role === "origin"
                      ? "Your copy"
                      : remote.role === "upstream"
                        ? "The original"
                        : "Other"}
                  </Badge>
                </span>
                <span className="mt-[2px] block truncate font-mono text-[12px] text-faint">
                  {remote.url}
                </span>
              </span>

              {remote.role !== "origin" && (
                <button
                  type="button"
                  onClick={() => onRemoveRemote(remote.name)}
                  title={`Stop tracking ${remote.name}`}
                  aria-label={`Remove remote ${remote.name}`}
                  className="flex-none rounded-md border border-line-soft p-[7px] text-muted opacity-0 transition-all hover:border-deleted/50 hover:bg-deleted/10 hover:text-deleted focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <TrashIcon className="h-[14px] w-[14px]" />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatusCard({
  tone,
  icon,
  count,
  title,
  body,
}: {
  tone: "ok" | "warn" | "accent";
  icon: React.ReactNode;
  count: number;
  title: string;
  body: string;
}) {
  const styles = {
    ok: "border-line/70 text-faint",
    warn: "border-modified/40 text-modified",
    accent: "border-accent/35 text-accent",
  }[tone];

  return (
    <div className={`flex items-start gap-3 rounded-card border bg-surface/50 p-4 ${styles}`}>
      <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-surface-alt">
        {count === 0 ? <CheckIcon className="h-[17px] w-[17px] text-added" /> : icon}
      </span>
      <div className="min-w-0">
        <div className="text-[14.5px] font-medium text-content">{title}</div>
        <p className="mt-[3px] text-[12.5px] leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}

function ActionSection({
  icon,
  title,
  body,
  children,
  highlight = false,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  body: React.ReactNode;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <section
      className={`flex flex-col gap-4 rounded-card border bg-surface/50 p-5 ${
        highlight ? "border-accent/40" : "border-line/70"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-line-soft bg-surface-alt text-muted">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="display text-[16px] font-semibold">{title}</h2>
          <p className="mt-[4px] max-w-[64ch] text-[13px] leading-relaxed text-muted">{body}</p>
        </div>
      </div>

      {children}
    </section>
  );
}

function StrategyChip({
  active,
  onClick,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-lg border px-3 py-[9px] text-left transition-colors ${
        active
          ? "border-accent bg-accent/10"
          : "border-line-soft bg-surface-alt/40 hover:border-line"
      }`}
    >
      <span className="block text-[13px] font-medium">{title}</span>
      <span className="mt-[2px] block text-[12px] leading-relaxed text-muted">{body}</span>
    </button>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "warn" | "ok";
  children: React.ReactNode;
}) {
  const styles =
    tone === "warn"
      ? "border-modified/40 bg-modified/10 text-modified"
      : "border-added/35 bg-added/10 text-added";

  return (
    <div className={`flex items-start gap-[10px] rounded-lg border px-3 py-[9px] ${styles}`}>
      <span className="mt-[1px] flex-none">
        {tone === "warn" ? (
          <WarningIcon className="h-[15px] w-[15px]" />
        ) : (
          <CheckIcon className="h-[15px] w-[15px]" />
        )}
      </span>
      <p className="text-[12.5px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

/** Memoised: the parent re-renders on every keystroke in the commit box. */
export const SyncView = memo(SyncViewImpl);
