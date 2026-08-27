import { memo, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs, PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Explain } from "@/components/Explain";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BranchIcon,
  CheckIcon,
  MergeIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
  WarningIcon,
} from "@/components/Icons";
import { timeAgo } from "@/lib/time";
import type { Branch, Repository } from "@/types/git";

type Filter = "all" | "local" | "remote" | "stale";

/** A branch nobody has touched in a fortnight is probably finished with. */
const STALE_MS = 14 * 24 * 3_600_000;

interface BranchesViewProps {
  repo: Repository;
  branches: Branch[];
  busy: boolean;
  onSwitch: (name: string) => void;
  onCreate: () => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
  onMergeInto: (from: string) => void;
  onOpenPullRequest: (branch: string) => void;
}

const BranchesViewImpl = ({
  repo,
  branches,
  busy,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
  onMergeInto,
  onOpenPullRequest,
}: BranchesViewProps) => {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState<Branch | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return branches
      .filter((b) => {
        if (filter === "local" && b.isRemoteOnly) return false;
        if (filter === "remote" && !b.isRemoteOnly) return false;
        if (filter === "stale") {
          const at = b.lastCommit?.at ?? 0;
          if (b.isCurrent || Date.now() - at < STALE_MS) return false;
        }
        return !needle || b.name.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return (b.lastCommit?.at ?? 0) - (a.lastCommit?.at ?? 0);
      });
  }, [branches, filter, query]);

  const staleCount = branches.filter(
    (b) => !b.isCurrent && Date.now() - (b.lastCommit?.at ?? 0) >= STALE_MS,
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Branches"
        subtitle={
          <>
            Each branch is a separate line of work. Make one per task, and merge it back — or
            open a pull request — when it is ready. <Explain term="branch" />
          </>
        }
        actions={
          <Button variant="primary" onClick={onCreate}>
            <PlusIcon className="h-[15px] w-[15px]" />
            New branch
          </Button>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterTabs
            active={filter}
            onChange={setFilter}
            tabs={[
              { id: "all", label: "All", count: branches.length },
              {
                id: "local",
                label: "On this computer",
                count: branches.filter((b) => !b.isRemoteOnly).length,
              },
              {
                id: "remote",
                label: "On GitHub only",
                count: branches.filter((b) => b.isRemoteOnly).length,
              },
              { id: "stale", label: "Untouched", count: staleCount },
            ]}
          />

          <div className="relative w-[200px]">
            <SearchIcon className="pointer-events-none absolute left-[10px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a branch"
              aria-label="Find a branch"
              className="w-full rounded-md border border-line bg-ground py-[7px] pl-[30px] pr-3 text-[13px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      </PageHeader>

      {visible.length === 0 ? (
        <EmptyState
          icon={<BranchIcon className="h-6 w-6" />}
          title="No branches here"
          body={
            filter === "stale"
              ? "Nothing has been left lying around. Every branch has recent work on it."
              : "Nothing matches that filter yet."
          }
          action={
            <Button variant="primary" onClick={onCreate}>
              <PlusIcon className="h-[15px] w-[15px]" />
              New branch
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-[6px]">
          {visible.map((branch) => (
            <BranchRow
              key={branch.name}
              branch={branch}
              currentBranch={repo.branch}
              busy={busy}
              onSwitch={() => onSwitch(branch.name)}
              onRename={() => setRenaming(branch)}
              onDelete={() => setDeleting(branch)}
              onMerge={() => onMergeInto(branch.name)}
              onOpenPullRequest={() => onOpenPullRequest(branch.name)}
              hasRemote={repo.githubUrl !== null}
            />
          ))}
        </div>
      )}

      {renaming && (
        <RenameModal
          branch={renaming}
          busy={busy}
          onCancel={() => setRenaming(null)}
          onRename={(to) => {
            onRename(renaming.name, to);
            setRenaming(null);
          }}
        />
      )}

      {deleting && (
        <DeleteModal
          branch={deleting}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onDelete={() => {
            onDelete(deleting.name);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function BranchRow({
  branch,
  currentBranch,
  busy,
  hasRemote,
  onSwitch,
  onRename,
  onDelete,
  onMerge,
  onOpenPullRequest,
}: {
  branch: Branch;
  currentBranch: string;
  busy: boolean;
  hasRemote: boolean;
  onSwitch: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMerge: () => void;
  onOpenPullRequest: () => void;
}) {
  return (
    <div className="settings-row group" data-selected={branch.isCurrent || undefined}>
      <span
        className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-lg border border-line-soft ${
          branch.isCurrent ? "bg-accent/15 text-accent" : "bg-surface-alt text-muted"
        }`}
      >
        {branch.isCurrent ? (
          <CheckIcon className="h-[15px] w-[15px]" />
        ) : (
          <BranchIcon className="h-[15px] w-[15px]" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-[6px]">
          <span className="truncate font-mono text-[13.5px] font-medium">{branch.name}</span>
          {branch.isCurrent && <Badge tone="accent">You are here</Badge>}
          {branch.isDefault && <Badge tone="neutral">Main branch</Badge>}
          {branch.isProtected && (
            <Badge tone="warn" icon={<ShieldIcon className="h-[10px] w-[10px]" />}>
              Protected
            </Badge>
          )}
          {branch.isRemoteOnly && <Badge tone="neutral">On GitHub only</Badge>}
          {!branch.upstream && !branch.isRemoteOnly && (
            <Badge tone="neutral" >Never pushed</Badge>
          )}
        </span>

        <span className="mt-[3px] flex flex-wrap items-center gap-x-2 text-[12.5px] text-faint">
          {branch.lastCommit ? (
            <>
              <span className="truncate">{branch.lastCommit.message}</span>
              <span>·</span>
              <span>{branch.lastCommit.author}</span>
              <span>·</span>
              <span>{timeAgo(branch.lastCommit.at)}</span>
            </>
          ) : (
            <span>No commits yet</span>
          )}
        </span>
      </span>

      {(branch.ahead > 0 || branch.behind > 0) && (
        <span className="flex-none font-mono text-2xs tabular-nums text-faint">
          {branch.ahead > 0 && (
            <span className="text-added" title={`${branch.ahead} commits not on GitHub`}>
              <ArrowUpIcon className="mr-[1px] inline h-3 w-3" />
              {branch.ahead}
            </span>
          )}
          {branch.behind > 0 && (
            <span className="ml-2 text-modified" title={`${branch.behind} commits you do not have`}>
              <ArrowDownIcon className="mr-[1px] inline h-3 w-3" />
              {branch.behind}
            </span>
          )}
        </span>
      )}

      {/* Actions appear on hover so the list stays calm at rest. */}
      <span className="flex flex-none items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {!branch.isCurrent && (
          <>
            <IconAction label={`Switch to ${branch.name}`} onClick={onSwitch} disabled={busy}>
              <CheckIcon className="h-[14px] w-[14px]" />
            </IconAction>
            <IconAction
              label={`Merge ${branch.name} into ${currentBranch}`}
              onClick={onMerge}
              disabled={busy}
            >
              <MergeIcon className="h-[14px] w-[14px]" />
            </IconAction>
          </>
        )}

        {hasRemote && !branch.isDefault && (
          <IconAction
            label={`Open a pull request for ${branch.name}`}
            onClick={onOpenPullRequest}
            disabled={busy}
          >
            <ArrowUpIcon className="h-[14px] w-[14px]" />
          </IconAction>
        )}

        <IconAction label={`Rename ${branch.name}`} onClick={onRename} disabled={busy}>
          <PencilIcon className="h-[14px] w-[14px]" />
        </IconAction>

        {!branch.isCurrent && !branch.isDefault && (
          <IconAction
            label={`Delete ${branch.name}`}
            onClick={onDelete}
            disabled={busy}
            danger
          >
            <TrashIcon className="h-[14px] w-[14px]" />
          </IconAction>
        )}
      </span>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`rounded-md border border-line-soft p-[6px] text-muted transition-colors disabled:opacity-40 ${
        danger
          ? "hover:border-deleted/50 hover:bg-deleted/10 hover:text-deleted"
          : "hover:border-line hover:bg-surface-alt hover:text-content"
      }`}
    >
      {children}
    </button>
  );
}

function RenameModal({
  branch,
  busy,
  onCancel,
  onRename,
}: {
  branch: Branch;
  busy: boolean;
  onCancel: () => void;
  onRename: (to: string) => void;
}) {
  const [name, setName] = useState(branch.name);
  const clean = name.trim().replace(/\s+/g, "-");

  return (
    <Modal
      title="Rename branch"
      icon={<PencilIcon className="h-6 w-6" />}
      busy={busy}
      onClose={onCancel}
      width="sm"
      subtitle={
        branch.upstream
          ? "This branch already exists on GitHub. Renaming it here creates a new name there the next time you push — the old one stays until someone deletes it."
          : "This branch only exists on your computer, so renaming it affects nobody else."
      }
      footer={
        <>
          <Button onClick={onCancel} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={clean.length === 0 || clean === branch.name || busy}
            onClick={() => onRename(clean)}
          >
            Rename
          </Button>
        </>
      }
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        data-autofocus
        aria-label="New branch name"
        className="w-full rounded-md border border-line bg-ground px-3 py-[9px] font-mono text-[13px] focus:border-accent focus:outline-none"
      />
    </Modal>
  );
}

function DeleteModal({
  branch,
  busy,
  onCancel,
  onDelete,
}: {
  branch: Branch;
  busy: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const unpushed = branch.ahead > 0;

  return (
    <Modal
      title={`Delete ${branch.name}?`}
      tone={unpushed ? "danger" : "warn"}
      icon={<WarningIcon className="h-6 w-6" />}
      busy={busy}
      onClose={onCancel}
      width="sm"
      subtitle={
        unpushed
          ? `This branch has ${branch.ahead} commit${branch.ahead === 1 ? "" : "s"} that are not on GitHub. Deleting it throws that work away, and there is no way to get it back.`
          : "Everything on this branch is already on GitHub, so deleting the local copy is safe. You can bring it back at any time."
      }
      footer={
        <>
          <Button onClick={onCancel} disabled={busy} className="flex-1">
            Keep it
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={busy}
            onClick={onDelete}
          >
            {busy ? "Deleting…" : "Delete branch"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[6px] rounded-lg border border-line bg-surface-alt/50 px-3 py-[10px] text-[12.5px]">
        <Line label="Last commit" value={branch.lastCommit?.message ?? "No commits"} />
        <Line
          label="Not on GitHub"
          value={
            branch.ahead === 0
              ? "Nothing — it is all safely pushed"
              : `${branch.ahead} commit${branch.ahead === 1 ? "" : "s"}`
          }
          alarm={branch.ahead > 0}
        />
      </div>
    </Modal>
  );
}

function Line({
  label,
  value,
  alarm = false,
}: {
  label: string;
  value: string;
  alarm?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-[92px] flex-none text-faint">{label}</span>
      <span className={`min-w-0 flex-1 truncate ${alarm ? "text-deleted" : "text-muted"}`}>
        {value}
      </span>
    </div>
  );
}

/** Memoised: the parent re-renders on every keystroke in the commit box. */
export const BranchesView = memo(BranchesViewImpl);
