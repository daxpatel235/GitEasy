import { useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./Button";
import { TextField } from "./ui/Field";
import { Explain } from "./Explain";
import { Switch } from "./settings/InfoSections";
import {
  CheckIcon,
  FolderIcon,
  GitHubIcon,
  PlusIcon,
  RefreshIcon,
  TerminalIcon,
  WarningIcon,
} from "./Icons";
import type { GitHubAccount } from "@/types/github";

type Stage =
  | "checking-git"
  | "git-missing"
  | "checking-account"
  | "sign-in"
  | "details"
  | "creating"
  | "create-failed";

interface NewProjectModalProps {
  /** Reads Git off this machine. Resolves false if the CLI cannot be found. */
  onCheckGit: () => Promise<boolean>;
  /** Reads who, if anyone, is signed in to GitHub right now. */
  onCheckAccount: () => Promise<GitHubAccount | null>;
  onSignIn: () => Promise<GitHubAccount | null>;
  /**
   * Does the real work: `git init` locally (writing a README first if asked),
   * then creates the matching GitHub repository and connects it as `origin`.
   * Resolves false, with nothing to report, if the user cancelled the folder
   * picker rather than something failing.
   */
  onCreate: (input: { name: string; withReadme: boolean; private: boolean }) => Promise<boolean>;
  onCancel: () => void;
}

/**
 * "New project", done the way Git and GitHub actually do it — just narrated.
 *
 * A repository is two separate things joined by one command: a `.git` folder
 * on this computer, and (optionally) a matching project on GitHub connected
 * to it as `origin`. Most tools hide that split; this dialog is built around
 * it instead, because it is the split every confused "why won't it push"
 * question eventually comes back to.
 *
 * Both halves need something in place before either can happen — Git itself
 * has to be installed, and GitHub needs someone signed in — so the dialog
 * checks both up front rather than failing midway through.
 */
export function NewProjectModal({
  onCheckGit,
  onCheckAccount,
  onSignIn,
  onCreate,
  onCancel,
}: NewProjectModalProps) {
  const [stage, setStage] = useState<Stage>("checking-git");
  const [account, setAccount] = useState<GitHubAccount | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [withReadme, setWithReadme] = useState(true);
  const [isPrivate, setIsPrivate] = useState(true);

  // Run the two checks in sequence the moment the dialog opens.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const installed = await onCheckGit();
      if (cancelled) return;
      if (!installed) {
        setStage("git-missing");
        return;
      }

      setStage("checking-account");
      const found = await onCheckAccount();
      if (cancelled) return;
      setAccount(found);
      setStage(found ? "details" : "sign-in");
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn() {
    setSigningIn(true);
    setError(null);
    try {
      const found = await onSignIn();
      if (found) {
        setAccount(found);
        setStage("details");
      } else {
        setError("GitHub did not confirm the sign-in. Try again.");
      }
    } finally {
      setSigningIn(false);
    }
  }

  const cleanName = name.trim().replace(/\s+/g, "-");
  const canCreate = cleanName.length > 0;

  async function create() {
    if (!canCreate) return;
    setStage("creating");
    setError(null);
    try {
      const proceeded = await onCreate({ name: cleanName, withReadme, private: isPrivate });
      // The user backed out of the folder picker — not a failure, just back
      // to the form with nothing said about it.
      if (!proceeded) setStage("details");
    } catch {
      setError(
        "Something went wrong partway through. Nothing was left half-connected — check the details and try again.",
      );
      setStage("create-failed");
    }
  }

  return (
    <Modal
      title="Start a new project"
      icon={<PlusIcon className="h-6 w-6" />}
      busy={stage === "creating"}
      onClose={stage === "creating" ? undefined : onCancel}
      width="md"
      subtitle={<StageSubtitle stage={stage} />}
      footer={
        <StageFooter
          stage={stage}
          canCreate={canCreate}
          signingIn={signingIn}
          onCancel={onCancel}
          onSignIn={() => void signIn()}
          onRetryGit={() => setStage("checking-git")}
          onCreate={() => void create()}
          onRetryCreate={() => void create()}
        />
      }
    >
      {(stage === "checking-git" || stage === "checking-account") && (
        <div className="flex items-center justify-center gap-3 py-6 text-[13.5px] text-muted">
          <RefreshIcon className="h-4 w-4 animate-spin" />
          {stage === "checking-git" ? "Looking for Git on this computer…" : "Checking GitHub…"}
        </div>
      )}

      {stage === "git-missing" && (
        <div className="flex items-start gap-3 rounded-card border border-deleted/40 bg-deleted/10 px-4 py-3">
          <WarningIcon className="mt-[2px] h-[17px] w-[17px] flex-none text-deleted" />
          <div>
            <div className="text-[14px] font-medium text-content">Git is not installed</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              GitEasy runs the real <span className="font-mono text-[12px]">git</span> program
              underneath — it is not a replacement for it. Install Git from{" "}
              <span className="font-mono text-[12px] text-content">git-scm.com</span>, then try
              again.
            </p>
          </div>
        </div>
      )}

      {stage === "sign-in" && (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-alt text-content">
            <GitHubIcon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-[14px] font-medium text-content">Connect your GitHub account</p>
            <p className="mx-auto mt-[6px] max-w-[360px] text-[13px] leading-relaxed text-muted">
              A new project usually means two things: a Git repository here, and a matching one on
              GitHub. GitEasy needs to know who to create the second one under.
            </p>
          </div>
          {error && <p className="text-[12.5px] text-deleted">{error}</p>}
        </div>
      )}

      {(stage === "details" || stage === "creating" || stage === "create-failed") && (
        <div className="flex flex-col gap-4">
          {account && (
            <div className="flex items-center gap-[9px] rounded-lg border border-line-soft bg-surface-alt/50 px-3 py-2">
              <CheckIcon className="h-[14px] w-[14px] flex-none text-added" />
              <span className="text-[13px] text-muted">
                Creating this under{" "}
                <span className="font-medium text-content">{account.login}</span> on GitHub.
              </span>
            </div>
          )}

          <TextField
            label="Project name"
            value={name}
            onChange={setName}
            mono
            autoFocus
            placeholder="my-project"
            disabled={stage !== "details"}
            hint="This names both the folder GitEasy creates and the GitHub repository — you will choose exactly where the folder goes in the next step."
          />

          <div className="flex flex-col gap-[10px] rounded-lg border border-line p-3">
            <ToggleLine
              label="Add a README"
              term="readme"
              detail="A starting page explaining what this project is."
              checked={withReadme}
              onChange={setWithReadme}
              disabled={stage !== "details"}
            />
            <div className="h-px bg-line-soft" />
            <ToggleLine
              label="Keep it private"
              detail={
                isPrivate
                  ? "Only you can see it, until you invite someone."
                  : "Anyone on GitHub can see it."
              }
              checked={isPrivate}
              onChange={setIsPrivate}
              disabled={stage !== "details"}
            />
          </div>

          <div className="flex items-start gap-[9px] rounded-lg bg-surface-alt/40 px-3 py-[9px]">
            <TerminalIcon className="mt-[2px] h-[13px] w-[13px] flex-none text-faint" />
            <p className="font-mono text-[11.5px] leading-relaxed text-faint">
              git init{withReadme ? " && git add README.md && git commit -m \"Add README\"" : ""}
              <br />
              gh repo create {cleanName || "<name>"} --{isPrivate ? "private" : "public"} --source=. --remote=origin --push
            </p>
          </div>

          {stage === "creating" && (
            <div className="flex items-center justify-center gap-3 py-2 text-[13px] text-muted">
              <RefreshIcon className="h-4 w-4 animate-spin" />
              Setting up your project on this computer, then on GitHub…
            </div>
          )}

          {stage === "create-failed" && error && (
            <p className="text-[12.5px] text-deleted">{error}</p>
          )}
        </div>
      )}
    </Modal>
  );
}

function StageSubtitle({ stage }: { stage: Stage }) {
  if (stage === "git-missing") {
    return "GitEasy could not find Git itself, which everything else here depends on.";
  }
  if (stage === "sign-in") {
    return "One quick step before GitEasy can create anything on GitHub for you.";
  }
  if (stage === "details" || stage === "creating" || stage === "create-failed") {
    return (
      <>
        This does two real things: turns a folder into a Git project with{" "}
        <span className="font-mono text-[13px] text-content">git init</span>, then creates the
        matching project on GitHub and connects the two. <Explain term="init" align="right" />
      </>
    );
  }
  return "Making sure everything this needs is ready first.";
}

function StageFooter({
  stage,
  canCreate,
  signingIn,
  onCancel,
  onSignIn,
  onRetryGit,
  onCreate,
  onRetryCreate,
}: {
  stage: Stage;
  canCreate: boolean;
  signingIn: boolean;
  onCancel: () => void;
  onSignIn: () => void;
  onRetryGit: () => void;
  onCreate: () => void;
  onRetryCreate: () => void;
}) {
  if (stage === "checking-git" || stage === "checking-account") {
    return (
      <Button className="flex-1" onClick={onCancel}>
        Cancel
      </Button>
    );
  }

  if (stage === "git-missing") {
    return (
      <>
        <Button className="flex-1" onClick={onCancel}>
          Close
        </Button>
        <Button variant="primary" className="flex-1" onClick={onRetryGit}>
          Check again
        </Button>
      </>
    );
  }

  if (stage === "sign-in") {
    return (
      <>
        <Button className="flex-1" onClick={onCancel} disabled={signingIn}>
          Cancel
        </Button>
        <Button variant="primary" className="flex-1" onClick={onSignIn} disabled={signingIn}>
          <GitHubIcon className="h-[15px] w-[15px]" />
          {signingIn ? "Connecting…" : "Sign in to GitHub"}
        </Button>
      </>
    );
  }

  if (stage === "create-failed") {
    return (
      <>
        <Button className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" className="flex-1" onClick={onRetryCreate}>
          Try again
        </Button>
      </>
    );
  }

  return (
    <>
      <Button className="flex-1" onClick={onCancel} disabled={stage === "creating"}>
        Cancel
      </Button>
      <Button
        variant="primary"
        className="flex-1"
        onClick={onCreate}
        disabled={!canCreate || stage === "creating"}
      >
        <FolderIcon className="h-[15px] w-[15px]" />
        {stage === "creating" ? "Creating…" : "Create project"}
      </Button>
    </>
  );
}

function ToggleLine({
  label,
  term,
  detail,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  term?: "readme";
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-4 text-left disabled:opacity-60"
    >
      <span>
        <span className="flex items-center gap-[6px] text-[13.5px] font-medium text-content">
          {label}
          {term && <Explain term={term} />}
        </span>
        <span className="mt-[2px] block text-[12px] text-muted">{detail}</span>
      </span>
      <Switch checked={checked} />
    </button>
  );
}
