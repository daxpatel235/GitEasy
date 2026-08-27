import { useMemo, useState } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./Button";
import { Badge } from "./ui/Badge";
import { Explain } from "./Explain";
import {
  BranchIcon,
  CheckIcon,
  FolderIcon,
  ForkIcon,
  GitHubIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
} from "./Icons";
import { timeAgo } from "@/lib/time";
import type { Branch, Repository } from "@/types/git";

interface RepoConnectedModalProps {
  repo: Repository;
  branches: Branch[];
  busy: boolean;
  /** Called with the branch to work on, and whether it has to be created. */
  onConfirm: (branch: string, create: boolean, from: string) => void;
}

/**
 * Shown the instant a folder is chosen.
 *
 * This is the whole connection ceremony: confirm the folder really is a Git
 * repository, then get the one decision that matters out of the way — which
 * branch the user is about to work on. Everything else the app can infer.
 *
 * There is no dismiss button and no `onClose`: picking a branch is the point,
 * and the current branch is pre-selected so the answer is always one click.
 */
export function RepoConnectedModal({
  repo,
  branches,
  busy,
  onConfirm,
}: RepoConnectedModalProps) {
  const current = branches.find((b) => b.isCurrent)?.name ?? repo.branch;

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selected, setSelected] = useState(current);
  const [newName, setNewName] = useState("");
  const [basedOn, setBasedOn] = useState(repo.defaultBranch);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? branches.filter((b) => b.name.toLowerCase().includes(needle))
      : branches;
    // Current branch first, then the trunk, then everything else by recency.
    return [...matched].sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return (b.lastCommit?.at ?? 0) - (a.lastCommit?.at ?? 0);
    });
  }, [branches, query]);

  const cleanName = newName.trim().replace(/\s+/g, "-");
  const nameTaken = branches.some((b) => b.name === cleanName);
  const canConfirm =
    mode === "existing" ? selected.length > 0 : cleanName.length > 0 && !nameTaken;

  function confirm() {
    if (!canConfirm) return;
    if (mode === "new") onConfirm(cleanName, true, basedOn);
    else onConfirm(selected, false, selected);
  }

  return (
    <Modal
      title="Git is connected"
      tone="success"
      icon={<CheckIcon className="h-6 w-6" />}
      busy={busy}
      width="md"
      subtitle={
        <>
          <span className="font-medium text-content">{repo.name}</span> is a Git project and
          GitEasy is now tracking it. Everything below happens on your computer until you
          choose to push.
        </>
      }
      footer={
        <Button
          variant="primary"
          className="flex-1"
          onClick={confirm}
          disabled={!canConfirm || busy}
        >
          {busy ? "Setting up…" : "Thanks!"}
        </Button>
      }
    >
      {/* What we found, so the connection is not just a claim. */}
      <div className="flex flex-col gap-[6px] rounded-lg border border-line bg-surface-alt/50 p-2">
        <Detail
          icon={<FolderIcon className="h-[15px] w-[15px]" />}
          label="Folder"
          value={repo.path}
          mono
        />
        <Detail
          icon={<GitHubIcon className="h-[15px] w-[15px]" />}
          label="GitHub"
          value={repo.githubUrl ?? "No remote yet — you can add one later"}
          tone={repo.githubUrl ? "good" : "quiet"}
        />
        {repo.upstream && (
          <Detail
            icon={<ForkIcon className="h-[15px] w-[15px]" />}
            label="Forked from"
            value={repo.upstream.slug}
            tone="good"
          />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-[6px]">
            <span className="text-[14px] font-medium">Which branch do you want to work on?</span>
            <Explain term="branch" />
          </div>

          <div className="inline-flex flex-none gap-1 rounded-lg border border-line bg-ground p-[3px]">
            <ModeTab active={mode === "existing"} onClick={() => setMode("existing")}>
              Existing
            </ModeTab>
            <ModeTab active={mode === "new"} onClick={() => setMode("new")}>
              New
            </ModeTab>
          </div>
        </div>

        {mode === "existing" ? (
          <>
            {branches.length > 6 && (
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-[10px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-faint" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a branch"
                  className="w-full rounded-md border border-line bg-ground py-[8px] pl-[32px] pr-3 text-[13.5px] placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>
            )}

            <div
              role="radiogroup"
              aria-label="Branch"
              className="max-h-[240px] overflow-y-auto rounded-lg border border-line"
            >
              {visible.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-muted">
                  No branch matches “{query}”.
                </p>
              ) : (
                visible.map((branch, index) => (
                  <BranchOption
                    key={branch.name}
                    branch={branch}
                    checked={selected === branch.name}
                    first={index === 0}
                    onSelect={() => setSelected(branch.name)}
                  />
                ))
              )}
            </div>

            <p className="text-[12.5px] leading-relaxed text-muted">
              Not sure? Stay on{" "}
              <span className="font-mono text-[12px] text-content">{current}</span> — it is the
              branch you were already on, and you can switch whenever you like.
            </p>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium">Name your branch</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="fix/login-button"
                data-autofocus
                className="w-full rounded-md border border-line bg-ground px-3 py-[9px] font-mono text-[13px] placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium">Start it from</span>
              <select
                value={basedOn}
                onChange={(e) => setBasedOn(e.target.value)}
                className="w-full cursor-pointer rounded-md border border-line bg-ground px-3 py-[9px] text-[13.5px] focus:border-accent focus:outline-none"
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                    {b.isDefault ? "  (main branch)" : ""}
                  </option>
                ))}
              </select>
            </label>

            {nameTaken ? (
              <p className="text-[12.5px] text-deleted">
                A branch called{" "}
                <span className="font-mono text-[12px]">{cleanName}</span> already exists. Pick
                another name.
              </p>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-muted">
                A new branch is a private copy of{" "}
                <span className="font-mono text-[12px] text-content">{basedOn}</span> to
                experiment on. Nothing you do there affects anyone else until you push it.
                Teams usually name them after the task —{" "}
                <span className="font-mono text-[12px]">fix/…</span> or{" "}
                <span className="font-mono text-[12px]">feature/…</span>.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-[5px] px-[11px] py-[4px] text-[12.5px] transition-colors ${
        active ? "bg-accent text-accent-ink font-medium" : "text-muted hover:text-content"
      }`}
    >
      {children}
    </button>
  );
}

function BranchOption({
  branch,
  checked,
  first,
  onSelect,
}: {
  branch: Branch;
  checked: boolean;
  first: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-3 py-[10px] text-left transition-colors ${
        first ? "" : "border-t border-line-soft"
      } ${checked ? "bg-accent/10" : "hover:bg-surface-alt"}`}
    >
      <span
        className={`grid h-[16px] w-[16px] flex-none place-items-center rounded-full border transition-colors ${
          checked ? "border-accent bg-accent" : "border-line"
        }`}
      >
        {checked && <span className="h-[6px] w-[6px] rounded-full bg-accent-ink" />}
      </span>

      <BranchIcon className="h-[15px] w-[15px] flex-none text-faint" />

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-[6px]">
          <span className="truncate font-mono text-[13px]">{branch.name}</span>
          {branch.isCurrent && <Badge tone="accent">You are here</Badge>}
          {branch.isDefault && <Badge tone="neutral">Main</Badge>}
          {branch.isProtected && (
            <ShieldIcon className="h-[13px] w-[13px] flex-none text-modified" />
          )}
          {branch.isRemoteOnly && <Badge tone="neutral">On GitHub only</Badge>}
        </span>
        <span className="mt-[2px] block truncate text-[12px] text-faint">
          {branch.lastCommit
            ? `${branch.lastCommit.author} · ${timeAgo(branch.lastCommit.at)}`
            : "No commits yet"}
        </span>
      </span>

      {(branch.ahead > 0 || branch.behind > 0) && (
        <span className="flex-none font-mono text-2xs tabular-nums text-faint">
          {branch.ahead > 0 && <span className="text-added">↑{branch.ahead}</span>}
          {branch.behind > 0 && <span className="text-modified"> ↓{branch.behind}</span>}
        </span>
      )}
    </button>
  );
}

function Detail({
  icon,
  label,
  value,
  mono = false,
  tone = "normal",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  tone?: "normal" | "good" | "quiet";
}) {
  return (
    <div className="flex items-center gap-3 px-2 py-[6px]">
      <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-surface text-muted">
        {icon}
      </span>
      <span className="w-[86px] flex-none text-[12.5px] text-faint">{label}</span>
      <span
        className={`min-w-0 flex-1 truncate text-[13px] ${mono ? "font-mono text-[12px]" : ""} ${
          tone === "quiet" ? "text-muted" : tone === "good" ? "text-added" : "text-content"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Used by the Branches screen for the same "start a new branch" flow. */
export function NewBranchModal({
  branches,
  from,
  busy,
  onCancel,
  onCreate,
}: {
  branches: Branch[];
  from: string;
  busy: boolean;
  onCancel: () => void;
  onCreate: (name: string, from: string) => void;
}) {
  const [name, setName] = useState("");
  const [basedOn, setBasedOn] = useState(from);

  const clean = name.trim().replace(/\s+/g, "-");
  const taken = branches.some((b) => b.name === clean);

  return (
    <Modal
      title="Start a new branch"
      tone="accent"
      icon={<PlusIcon className="h-6 w-6" />}
      busy={busy}
      onClose={onCancel}
      width="sm"
      subtitle="A separate line of work. Nothing you do on it touches anyone else until you push it."
      footer={
        <>
          <Button onClick={onCancel} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={clean.length === 0 || taken || busy}
            onClick={() => onCreate(clean, basedOn)}
          >
            {busy ? "Creating…" : "Create branch"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-[6px]">
          <span className="text-[13px] font-medium">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="feature/dark-mode"
            data-autofocus
            className="w-full rounded-md border border-line bg-ground px-3 py-[9px] font-mono text-[13px] placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <span className="text-[13px] font-medium">Start it from</span>
          <select
            value={basedOn}
            onChange={(e) => setBasedOn(e.target.value)}
            className="w-full cursor-pointer rounded-md border border-line bg-ground px-3 py-[9px] text-[13.5px] focus:border-accent focus:outline-none"
          >
            {branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
                {b.isDefault ? "  (main branch)" : ""}
              </option>
            ))}
          </select>
        </label>

        {taken && (
          <p className="text-[12.5px] text-deleted">That name is already taken.</p>
        )}
      </div>
    </Modal>
  );
}
