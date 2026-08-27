import { memo, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs, PageHeader } from "@/components/ui/PageHeader";
import { Explain } from "@/components/Explain";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  HistoryIcon,
  MergeIcon,
  RefreshIcon,
  SearchIcon,
  TagIcon,
  UndoIcon,
  WarningIcon,
} from "@/components/Icons";
import { timeAgo } from "@/lib/time";
import type { CheckState, Commit, Repository } from "@/types/git";

type Filter = "all" | "mine" | "unpushed";

interface HistoryViewProps {
  repo: Repository;
  commits: Commit[];
  loading: boolean;
  onRevert: (hash: string) => void;
  onCherryPick: (hash: string) => void;
  onOpenOnGitHub: (hash: string) => void;
}

/**
 * A flat, readable list rather than a commit graph.
 *
 * Graphs are the first thing that scares people off Git clients, and the
 * information they carry — who, when, what, and whether it is public yet — is
 * all expressible in a row. Merge commits are marked so the shape of the
 * history is still legible.
 */
export function HistoryView({
  repo,
  commits,
  loading,
  onRevert,
  onCherryPick,
  onOpenOnGitHub,
}: HistoryViewProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  // Stable identity, so memoised rows survive a re-render of the list.
  const toggleRow = useCallback(
    (hash: string) => setSelected((current) => (current === hash ? null : hash)),
    [],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return commits.filter((c) => {
      if (filter === "mine" && c.author !== "You") return false;
      if (filter === "unpushed" && !c.isLocal) return false;
      if (!needle) return true;
      return `${c.message} ${c.author} ${c.shortHash}`.toLowerCase().includes(needle);
    });
  }, [commits, filter, query]);

  const unpushed = commits.filter((c) => c.isLocal).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="History"
        subtitle={
          <>
            Every commit on{" "}
            <span className="font-mono text-[13px] text-content">{repo.branch}</span>, newest
            first. Commits marked <span className="text-modified">not pushed</span> exist only on
            this computer.
          </>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterTabs
            active={filter}
            onChange={setFilter}
            tabs={[
              { id: "all", label: "Everyone", count: commits.length },
              { id: "mine", label: "Mine", count: commits.filter((c) => c.author === "You").length },
              { id: "unpushed", label: "Not pushed", count: unpushed },
            ]}
          />

          <div className="relative w-[220px]">
            <SearchIcon className="pointer-events-none absolute left-[10px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search commits"
              aria-label="Search commits"
              className="w-full rounded-md border border-line bg-ground py-[7px] pl-[30px] pr-3 text-[13px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      </PageHeader>

      {loading ? (
        <p className="py-12 text-center text-[13.5px] text-muted">Reading history…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon className="h-6 w-6" />}
          title="Nothing here"
          body={
            query
              ? `No commit matches “${query}”.`
              : "This branch has no commits matching that filter yet."
          }
        />
      ) : (
        <div className="flex flex-col gap-[6px]">
          {visible.map((commit) => (
            <CommitRow
              key={commit.hash}
              commit={commit}
              open={selected === commit.hash}
              hasRemote={repo.githubUrl !== null}
              onToggle={toggleRow}
              onRevert={onRevert}
              onCherryPick={onCherryPick}
              onOpenOnGitHub={onOpenOnGitHub}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One commit, memoised.
 *
 * History routinely runs to a couple of hundred rows, each with an avatar and a
 * relative timestamp to compute. The handlers take the hash rather than closing
 * over it, so their identity is stable and a re-render of the list does not
 * rebuild every row.
 */
const CommitRow = memo(function CommitRow({
  commit,
  open,
  hasRemote,
  onToggle,
  onRevert,
  onCherryPick,
  onOpenOnGitHub,
}: {
  commit: Commit;
  open: boolean;
  hasRemote: boolean;
  onToggle: (hash: string) => void;
  onRevert: (hash: string) => void;
  onCherryPick: (hash: string) => void;
  onOpenOnGitHub: (hash: string) => void;
}) {
  return (
    <div
      className={`overflow-hidden rounded-card border border-line/70 bg-surface/50 row-contain ${
        open ? "" : "row-skip"
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(commit.hash)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
      >
        <Avatar name={commit.author} />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium">{commit.message}</span>
            {commit.isMerge && (
              <MergeIcon className="h-[14px] w-[14px] flex-none text-faint" />
            )}
          </span>
          <span className="mt-[2px] flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-faint">
            <span>{commit.author}</span>
            <span>·</span>
            <span>{timeAgo(commit.at)}</span>
            <span>·</span>
            <span className="font-mono">{commit.shortHash}</span>
            {commit.tags.map((tag) => (
              <Badge key={tag} tone="accent" icon={<TagIcon className="h-[10px] w-[10px]" />}>
                {tag}
              </Badge>
            ))}
          </span>
        </span>

        <span className="flex flex-none items-center gap-2">
          {commit.isLocal && <Badge tone="warn">Not pushed</Badge>}
          <ChecksDot state={commit.checks} />
          <span className="font-mono text-2xs tabular-nums text-faint">
            <span className="text-added">+{commit.additions}</span>{" "}
            <span className="text-deleted">−{commit.deletions}</span>
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-line-soft bg-ground/40 px-4 py-3">
          {commit.body && (
            <p className="mb-3 max-w-[70ch] whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
              {commit.body}
            </p>
          )}

          <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-[5px] text-[12.5px]">
            <dt className="text-faint">Author</dt>
            <dd className="text-muted">
              {commit.author} &lt;{commit.authorEmail}&gt;
            </dd>
            <dt className="text-faint">Full hash</dt>
            <dd className="font-mono text-[12px] text-muted">{commit.hash}</dd>
            <dt className="text-faint">Touched</dt>
            <dd className="text-muted">
              {commit.fileCount} {commit.fileCount === 1 ? "file" : "files"}
            </dd>
          </dl>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => onRevert(commit.hash)}
              title="Add a new commit that undoes this one. Safe even after pushing."
              className="px-3 py-[6px] text-[13px]"
            >
              <UndoIcon className="h-[14px] w-[14px]" />
              Revert
              <Explain term="revert" />
            </Button>

            <Button
              onClick={() => onCherryPick(commit.hash)}
              title="Apply just this commit onto another branch."
              className="px-3 py-[6px] text-[13px]"
            >
              <CopyIcon className="h-[14px] w-[14px]" />
              Copy to another branch
              <Explain term="cherryPick" />
            </Button>

            {hasRemote && !commit.isLocal && (
              <Button onClick={() => onOpenOnGitHub(commit.hash)} className="px-3 py-[6px] text-[13px]">
                View on GitHub
                <ExternalLinkIcon className="h-[13px] w-[13px]" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

/** Initial-in-a-circle, tinted deterministically so people stay recognisable. */
export const Avatar = memo(function Avatar({
  name,
  size = 30,
}: {
  name: string;
  size?: number;
}) {
  const hue = [...name].reduce((total, char) => total + char.charCodeAt(0), 0) % 360;

  return (
    <span
      aria-hidden="true"
      className="grid flex-none place-items-center rounded-full text-[12px] font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(140deg, hsl(${hue} 58% 52%), hsl(${(hue + 40) % 360} 58% 42%))`,
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
});

/** Shared by history, pull requests and the checks screen. */
export function ChecksDot({ state }: { state: CheckState }) {
  if (state === "none") return null;

  const config = {
    passing: { icon: <CheckIcon className="h-[13px] w-[13px]" />, cls: "text-added", label: "Checks passed" },
    failing: { icon: <WarningIcon className="h-[13px] w-[13px]" />, cls: "text-deleted", label: "Checks failed" },
    running: {
      icon: <RefreshIcon className="h-[13px] w-[13px] animate-spin" />,
      cls: "text-modified",
      label: "Checks running",
    },
  }[state];

  return (
    <span className={`flex-none ${config.cls}`} title={config.label}>
      {config.icon}
    </span>
  );
}
