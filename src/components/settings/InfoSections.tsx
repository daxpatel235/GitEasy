import { SettingsRow } from "./SettingsRow";
import { Button } from "../Button";
import { Badge } from "../ui/Badge";
import { Avatar } from "@/views/HistoryView";
import {
  ArchiveIcon,
  BranchIcon,
  FolderIcon,
  ForkIcon,
  GitEasyLogo,
  GitHubIcon,
  KeyboardIcon,
  PlusIcon,
  RepoIcon,
  ShieldIcon,
  SparkleIcon,
  SyncIcon,
  TrashIcon,
  UserIcon,
} from "../Icons";
import type { GitIdentity, Remote, Repository } from "@/types/git";
import type { GitHubAccount } from "@/types/github";

interface RepositorySectionProps {
  repo: Repository | null;
  onChangeRepository: () => void;
  onOpenFolder: () => void;
}

export function RepositorySection({
  repo,
  onChangeRepository,
  onOpenFolder,
}: RepositorySectionProps) {
  if (!repo) {
    return (
      <EmptyNote>
        No project open yet. Choose one from the Overview screen to see its details here.
      </EmptyNote>
    );
  }

  return (
    <div className="flex flex-col gap-[6px]">
      <SettingsRow
        leading={<RowIcon><RepoIcon className="h-[15px] w-[15px]" /></RowIcon>}
        title={repo.name}
        subtitle="Project name, taken from the folder"
        interactive={false}
      />
      <SettingsRow
        leading={<RowIcon><FolderIcon className="h-[15px] w-[15px]" /></RowIcon>}
        title="Location on this computer"
        subtitle={repo.path}
        onClick={onOpenFolder}
        trailing={<TrailingHint>Open folder</TrailingHint>}
      />
      <SettingsRow
        leading={<RowIcon><BranchIcon className="h-[15px] w-[15px]" /></RowIcon>}
        title="Current branch"
        subtitle={`${repo.branch} — the main branch of this project is ${repo.defaultBranch}`}
        interactive={false}
      />
      <SettingsRow
        leading={<RowIcon><GitHubIcon className="h-[15px] w-[15px]" /></RowIcon>}
        title="GitHub"
        subtitle={repo.githubUrl ?? "No remote configured — you can still commit locally"}
        interactive={false}
        trailing={
          <Badge tone={repo.githubUrl ? "success" : "neutral"}>
            {repo.githubUrl ? "Connected" : "Local only"}
          </Badge>
        }
      />
      {repo.upstream && (
        <SettingsRow
          leading={<RowIcon><ForkIcon className="h-[15px] w-[15px]" /></RowIcon>}
          title="Forked from"
          subtitle={repo.upstream.url}
          interactive={false}
          trailing={<Badge tone="accent">Upstream</Badge>}
        />
      )}

      <SettingsRow
        leading={<RowIcon><FolderIcon className="h-[15px] w-[15px]" /></RowIcon>}
        title="Open a different project"
        subtitle="Pick another folder. This one stays exactly as it is."
        onClick={onChangeRepository}
        trailing={<TrailingHint>Change</TrailingHint>}
      />
    </div>
  );
}

export function RemotesSection({
  remotes,
  onAdd,
  onRemove,
}: {
  remotes: Remote[];
  onAdd: () => void;
  onRemove: (name: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="settings-row">
        <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
          A remote is a nickname for a server holding a copy of this project.{" "}
          <span className="font-mono text-[12.5px] text-content">origin</span> is yours — the one
          you push to. A fork usually has a second one called{" "}
          <span className="font-mono text-[12.5px] text-content">upstream</span>, pointing at the
          original project, which is what makes the Sync screen able to pull their changes in.
        </p>
      </div>

      {remotes.map((remote) => (
        <SettingsRow
          key={remote.name}
          leading={
            <RowIcon>
              {remote.role === "upstream" ? (
                <ForkIcon className="h-[15px] w-[15px]" />
              ) : (
                <GitHubIcon className="h-[15px] w-[15px]" />
              )}
            </RowIcon>
          }
          title={remote.name}
          subtitle={remote.url}
          interactive={false}
          trailing={
            <span className="flex items-center gap-2">
              <Badge tone={remote.role === "origin" ? "accent" : "neutral"}>
                {remote.role === "origin"
                  ? "Your copy"
                  : remote.role === "upstream"
                    ? "The original"
                    : "Other"}
              </Badge>
              {remote.role !== "origin" && (
                <button
                  type="button"
                  onClick={() => onRemove(remote.name)}
                  aria-label={`Remove ${remote.name}`}
                  className="rounded-md border border-line-soft p-[6px] text-muted transition-colors hover:border-deleted/50 hover:bg-deleted/10 hover:text-deleted"
                >
                  <TrashIcon className="h-[13px] w-[13px]" />
                </button>
              )}
            </span>
          }
        />
      ))}

      <SettingsRow
        leading={<RowIcon><PlusIcon className="h-[15px] w-[15px]" /></RowIcon>}
        title="Add a remote"
        subtitle="Point at another copy of this project — usually the one you forked from"
        onClick={onAdd}
        trailing={<TrailingHint>Add</TrailingHint>}
      />
    </div>
  );
}

export interface Behaviour {
  autoFetch: boolean;
  autoSuggest: boolean;
  confirmPush: boolean;
  pullBeforePush: boolean;
  conventionalCommits: boolean;
  warnOnMainBranch: boolean;
  warnOnLargeFiles: boolean;
  warnOnSecrets: boolean;
}

export const DEFAULT_BEHAVIOUR: Behaviour = {
  autoFetch: true,
  autoSuggest: true,
  confirmPush: true,
  pullBeforePush: true,
  conventionalCommits: true,
  warnOnMainBranch: true,
  warnOnLargeFiles: true,
  warnOnSecrets: true,
};

/**
 * Behaviour that would otherwise force the user to learn Git.
 *
 * Every toggle describes an outcome, never a command — and every one of them
 * is a guard rail somebody wished they had had.
 */
export function GitSection({
  behaviour,
  onChange,
}: {
  behaviour: Behaviour;
  onChange: (next: Behaviour) => void;
}) {
  const set = <K extends keyof Behaviour>(key: K, value: Behaviour[K]) =>
    onChange({ ...behaviour, [key]: value });

  return (
    <div className="flex flex-col gap-[6px]">
      <GroupLabel>Keeping up to date</GroupLabel>
      <ToggleRow
        icon={<SyncIcon className="h-[15px] w-[15px]" />}
        title="Check GitHub automatically"
        subtitle="Looks for new work when you open a project and every few minutes after. Nothing is changed without asking."
        checked={behaviour.autoFetch}
        onChange={(v) => set("autoFetch", v)}
      />
      <ToggleRow
        icon={<ArchiveIcon className="h-[15px] w-[15px]" />}
        title="Pull before pushing"
        subtitle="Gets other people's work first, so your push is never rejected for being out of date."
        checked={behaviour.pullBeforePush}
        onChange={(v) => set("pullBeforePush", v)}
      />

      <GroupLabel>Writing commits</GroupLabel>
      <ToggleRow
        icon={<SparkleIcon className="h-[15px] w-[15px]" />}
        title="Suggest a message for me"
        subtitle="Reads what changed and drafts a description. You can always rewrite it."
        checked={behaviour.autoSuggest}
        onChange={(v) => set("autoSuggest", v)}
      />
      <ToggleRow
        icon={<RepoIcon className="h-[15px] w-[15px]" />}
        title="Offer conventional prefixes"
        subtitle="Shows feat / fix / chore chips above the message box. Many teams require them."
        checked={behaviour.conventionalCommits}
        onChange={(v) => set("conventionalCommits", v)}
      />

      <GroupLabel>Guard rails</GroupLabel>
      <ToggleRow
        icon={<ShieldIcon className="h-[15px] w-[15px]" />}
        title="Confirm before pushing"
        subtitle="Shows exactly what is about to become public, with the changed lines, before it goes."
        checked={behaviour.confirmPush}
        onChange={(v) => set("confirmPush", v)}
      />
      <ToggleRow
        icon={<BranchIcon className="h-[15px] w-[15px]" />}
        title="Warn when committing to the main branch"
        subtitle="Most teams expect work to happen on a branch and arrive through a pull request."
        checked={behaviour.warnOnMainBranch}
        onChange={(v) => set("warnOnMainBranch", v)}
      />
      <ToggleRow
        icon={<ArchiveIcon className="h-[15px] w-[15px]" />}
        title="Warn about very large files"
        subtitle="Files over 50 MB bloat a project's history forever and GitHub will reject files over 100 MB."
        checked={behaviour.warnOnLargeFiles}
        onChange={(v) => set("warnOnLargeFiles", v)}
      />
      <ToggleRow
        icon={<ShieldIcon className="h-[15px] w-[15px]" />}
        title="Warn about passwords and keys"
        subtitle="Scans what you are committing for things that look like credentials. Secrets stay in history forever, even if you delete the file later."
        checked={behaviour.warnOnSecrets}
        onChange={(v) => set("warnOnSecrets", v)}
      />
    </div>
  );
}

export function AccountSection({
  account,
  busy,
  onSignIn,
  onSignOut,
  identity,
  identityWarning,
  onEditIdentity,
}: {
  account: GitHubAccount | null;
  busy: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  identity?: GitIdentity | null;
  identityWarning?: string | null;
  onEditIdentity?: () => void;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      {/*
        The Git identity comes first, because it is the one that decides whose
        name ends up on the work — and the one people are surprised by. It is
        deliberately shown as a separate thing from the GitHub sign-in below.
      */}
      {identity && (
        <>
          <GroupLabel>How your commits are signed</GroupLabel>

          <SettingsRow
            leading={<RowIcon><UserIcon className="h-[15px] w-[15px]" /></RowIcon>}
            title={identity.configured ? `${identity.name}` : "Not set yet"}
            subtitle={
              identity.configured
                ? identity.email ?? ""
                : "Git will not let you commit until it has a name and an email."
            }
            onClick={onEditIdentity}
            trailing={
              <span className="flex items-center gap-2">
                {!identity.configured && <Badge tone="warn">Needed</Badge>}
                <TrailingHint>{identity.configured ? "Change" : "Set up"}</TrailingHint>
              </span>
            }
          />

          {identityWarning && (
            <div className="settings-row">
              <p className="max-w-[62ch] text-[13px] leading-relaxed text-modified">
                {identityWarning}
              </p>
            </div>
          )}

          <div className="settings-row">
            <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
              This is what Git writes into every commit you make. It is separate from signing in
              to GitHub below — that decides what GitEasy may do over the network, this decides
              whose name is on the work itself.
            </p>
          </div>

          <GroupLabel>GitHub account</GroupLabel>
        </>
      )}

      {account ? (
        <>
          <div className="settings-row">
            <Avatar name={account.name} size={38} />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium">{account.name}</span>
              <span className="mt-[1px] block font-mono text-[12.5px] text-muted">
                @{account.login}
              </span>
            </span>
            <Button onClick={onSignOut} disabled={busy} className="flex-none">
              Sign out
            </Button>
          </div>

          <div className="settings-row">
            <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
              Signing in lets GitEasy read pull requests, issues and check results, and push
              without asking for a password each time. Committing and browsing history work
              without an account — those happen entirely on this computer.
            </p>
          </div>
        </>
      ) : (
        <>
          <SettingsRow
            leading={<RowIcon><GitHubIcon className="h-[15px] w-[15px]" /></RowIcon>}
            title="Sign in to GitHub"
            subtitle="Needed for pull requests, issues, checks and pushing without a password prompt"
            onClick={onSignIn}
            trailing={<TrailingHint>{busy ? "Signing in…" : "Sign in"}</TrailingHint>}
          />
          <div className="settings-row">
            <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
              You do not have to. Everything that happens on this computer — committing,
              branching, history, the shelf — works with no account at all.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

const SHORTCUTS: { keys: string[]; action: string; note: string }[] = [
  { keys: ["Ctrl", "K"], action: "Open the command palette", note: "Everything the app can do" },
  { keys: ["Ctrl", "Enter"], action: "Commit", note: "Saves a snapshot on this computer" },
  { keys: ["Ctrl", "Shift", "P"], action: "Push", note: "Opens the confirmation first" },
  { keys: ["Ctrl", "Shift", "L"], action: "Pull", note: "Get other people's work" },
  { keys: ["Ctrl", "B"], action: "Switch branch", note: "Opens the branch picker" },
  { keys: ["Ctrl", "1…9"], action: "Jump to a screen", note: "In sidebar order" },
  { keys: ["Ctrl", "R"], action: "Refresh", note: "Re-read the project from disk" },
  { keys: ["Esc"], action: "Close a dialog", note: "Never loses what you typed" },
];

export function ShortcutsSection() {
  return (
    <div className="flex flex-col gap-[6px]">
      {SHORTCUTS.map((shortcut) => (
        <div key={shortcut.action} className="settings-row">
          <RowIcon>
            <KeyboardIcon className="h-[15px] w-[15px]" />
          </RowIcon>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium">{shortcut.action}</span>
            <span className="mt-[1px] block text-[12.5px] text-muted">{shortcut.note}</span>
          </span>
          <span className="flex flex-none gap-1">
            {shortcut.keys.map((key) => (
              <kbd
                key={key}
                className="rounded border border-line-soft bg-surface-alt px-[7px] py-[2px] font-mono text-[11.5px] text-muted"
              >
                {key}
              </kbd>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AboutSection({ onReplayIntro }: { onReplayIntro?: () => void }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <SettingsRow
        leading={<RowIcon><GitEasyLogo className="h-[15px] w-[15px]" /></RowIcon>}
        title="GitEasy"
        subtitle="Version 0.2.0 — free, and always will be"
        interactive={false}
      />

      {onReplayIntro && (
        <SettingsRow
          leading={<RowIcon><SparkleIcon className="h-[15px] w-[15px]" /></RowIcon>}
          title="Show the introduction again"
          subtitle="Walk through the welcome screens from the start"
          onClick={onReplayIntro}
        />
      )}

      <div className="settings-row">
        <p className="max-w-[62ch] text-[14px] leading-relaxed text-muted">
          GitEasy is a Git client for people who have not learned Git yet — and a fast one for
          people who have. It uses the same words as every tutorial and every colleague, and
          explains each of them wherever it says them, so nothing you pick up here is wasted
          when you move to the terminal.
        </p>
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 pb-[2px] pt-3 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">
      {children}
    </div>
  );
}

function RowIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-line-soft bg-surface-alt text-muted">
      {children}
    </span>
  );
}

function TrailingHint({ children }: { children: React.ReactNode }) {
  return <span className="flex-none text-xs text-muted">{children}</span>;
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <p className="max-w-[58ch] text-[13px] text-muted">{children}</p>
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  subtitle,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <SettingsRow
      leading={<RowIcon>{icon}</RowIcon>}
      title={title}
      subtitle={subtitle}
      interactive={false}
      onClick={() => onChange(!checked)}
      selected={checked}
      trailing={<Switch checked={checked} />}
    />
  );
}

/** Presentational only — the parent row owns the click target. */
function Switch({ checked }: { checked: boolean }) {
  return (
    <span
      role="switch"
      aria-checked={checked}
      className={`relative inline-block h-[20px] w-[36px] flex-none rounded-full transition-colors duration-150 ${
        checked ? "bg-accent" : "bg-line"
      }`}
    >
      <span
        className={`absolute top-[3px] h-[14px] w-[14px] rounded-full transition-all duration-150 ${
          checked ? "left-[19px] bg-accent-ink" : "left-[3px] bg-faint"
        }`}
      />
    </span>
  );
}

/** Kept for callers that want the shared toggle. */
export { Switch };
