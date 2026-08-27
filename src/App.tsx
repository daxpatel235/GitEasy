import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar, type NavCounts } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { PushModal } from "@/components/PushModal";
import { CloneModal } from "@/components/CloneModal";
import { NewProjectModal } from "@/components/NewProjectModal";
import { ConflictModal } from "@/components/ConflictModal";
import { AddRemoteModal } from "@/components/AddRemoteModal";
import { CommandPalette, type Command } from "@/components/CommandPalette";
import { NewBranchModal, RepoConnectedModal } from "@/components/RepoConnectedModal";
import { Button } from "@/components/Button";
import { Toasts, useToasts } from "@/components/Toast";
import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BookIcon,
  BranchIcon,
  CheckIcon,
  ForkIcon,
  PlusIcon,
  PullRequestIcon,
  SyncIcon,
  TagIcon,
} from "@/components/Icons";

import { ChangesView } from "@/views/ChangesView";
import { ConnectView } from "@/views/ConnectView";
import { HomeView } from "@/views/HomeView";
import { HistoryView } from "@/views/HistoryView";
import { BranchesView } from "@/views/BranchesView";
import { ShelfView } from "@/views/ShelfView";
import { SyncView } from "@/views/SyncView";
import { PullRequestsView } from "@/views/PullRequestsView";
import { IssuesView } from "@/views/IssuesView";
import { ChecksView } from "@/views/ChecksView";
import { ReleasesView } from "@/views/ReleasesView";
import { LearnView } from "@/views/LearnView";
import { SettingsView } from "@/views/SettingsView";
import { Onboarding } from "@/views/onboarding/Onboarding";

import { useFirstRun } from "@/hooks/useFirstRun";
import { gitService, githubService, setActiveRepoPath } from "@/services";
import { toAppError } from "@/services/shared";
import { useRepositoryWatcher } from "@/hooks/useRepositoryWatcher";
import { usePersistentBehaviour } from "@/hooks/usePersistentBehaviour";
import { IdentityModal } from "@/components/IdentityModal";
import type {
  AppError,
  Branch,
  ChangedFile,
  Commit,
  Conflict,
  Environment,
  LocalSave,
  PushResult,
  RecentRepository,
  Remote,
  Repository,
  Stash,
  SyncState,
  Tag,
} from "@/types/git";
import type { GitHubAccount, Issue, PullRequest, Release, RemoteRepo, WorkflowRun } from "@/types/github";
import type { View } from "@/types/navigation";

/** Sidebar order, for the Ctrl+1…9 shortcuts. */
const VIEW_ORDER: View[] = [
  "home",
  "changes",
  "history",
  "branches",
  "shelf",
  "sync",
  "pull-requests",
  "issues",
  "checks",
];

export default function App() {
  const { onboarded, complete: completeOnboarding, reset: replayIntro } = useFirstRun();
  const { toasts, push: toast, dismiss } = useToasts();

  /* --- Project state ------------------------------------------------------ */

  const [repo, setRepo] = useState<Repository | null>(null);

  /**
   * The current project, readable without making it a dependency.
   *
   * Callbacks that only need to know "which project is open right now" read
   * this instead of closing over `repo`, so opening a project does not rebuild
   * every handler in the app.
   */
  const repoRef = useRef<Repository | null>(null);
  repoRef.current = repo;

  const [files, setFiles] = useState<ChangedFile[]>([]);

  /** The current file list, for callbacks that must not depend on it. */
  const filesRef = useRef<ChangedFile[]>([]);
  filesRef.current = files;
  const [pendingCommits, setPendingCommits] = useState<LocalSave[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [stashes, setStashes] = useState<Stash[]>([]);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [sync, setSync] = useState<SyncState | null>(null);

  /* --- GitHub state -------------------------------------------------------- */

  const [account, setAccount] = useState<GitHubAccount | null>(null);
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [myRepos, setMyRepos] = useState<RemoteRepo[]>([]);

  /* --- UI state ------------------------------------------------------------ */

  const [view, setView] = useState<View>("home");
  const [behaviour, setBehaviour] = usePersistentBehaviour();

  /** What Git and GitHub look like on this machine. */
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);

  /** Projects opened before, so reopening one does not mean re-navigating. */
  const [recents, setRecents] = useState<RecentRepository[]>([]);

  const [message, setMessage] = useState("");
  const [description, setDescription] = useState("");
  const [explanation, setExplanation] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [loadingGitHub, setLoadingGitHub] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);

  /** Which long-running action is in flight, so buttons can label themselves. */
  const [busy, setBusy] = useState<string | null>(null);

  // Dialogs. Only one is ever open at a time in practice.
  const [connectedRepo, setConnectedRepo] = useState<Repository | null>(null);
  const [pushOpen, setPushOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [prDraftBranch, setPrDraftBranch] = useState<string | null>(null);

  /* ---------------------------------------------------------------------- */
  /* Loading                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Draft a commit message from the current changes.
   *
   * Never overwrites something the user has started typing — losing a
   * half-written message to a background refresh is worse than having no
   * suggestion at all.
   */
  const loadSuggestion = useCallback(
    async (forFiles: ChangedFile[], target?: Repository | null) => {
      if (!behaviour.autoSuggest || forFiles.length === 0) {
        setExplanation("");
        return;
      }

      const project = target ?? repoRef.current;
      if (!project) return;

      try {
        const suggestion = await gitService.suggestCommitMessage(forFiles, project);
        // Re-check after the await: the user may have typed while it ran.
        setMessage((current) => (current.trim().length > 0 ? current : suggestion.message));
        setExplanation(suggestion.explanation);
      } catch {
        // A missing suggestion is not worth reporting — the box still works.
      }
    },
    [behaviour.autoSuggest],
  );

  /**
   * The part of the project that changes when a file is saved.
   *
   * This is what the filesystem watcher runs, so it is deliberately the short
   * list: what changed, whether anything is conflicted, and how far ahead the
   * branch is. Re-reading history, tags, stashes and remotes on every keystroke
   * in an editor is what made the window stop responding.
   */
  const loadWorkingState = useCallback(async (target: Repository) => {
    const [changed, conflictList, syncState] = await Promise.all([
      gitService.getChangedFiles(target),
      gitService.getConflicts(target),
      gitService.getSyncState(target),
    ]);

    setFiles(changed);
    setConflicts(conflictList);
    setSync(syncState);
    return changed;
  }, []);

  /**
   * Everything that comes from the folder on disk.
   *
   * Run when a project is opened or the branch changes — the moments when all
   * of it really can be different. Each piece is applied as it arrives rather
   * than after the slowest one, so the screen fills in progressively instead of
   * staying blank until history has been read.
   */
  const loadRepoState = useCallback(
    async (target: Repository) => {
      const changed = await gitService.getChangedFiles(target);
      setFiles(changed);

      // The rest are independent; none of them blocks showing the files.
      void gitService.getConflicts(target).then(setConflicts).catch(() => undefined);
      void gitService.getSyncState(target).then(setSync).catch(() => undefined);
      void gitService.getBranches(target).then(setBranches).catch(() => undefined);
      void gitService
        .getHistory(target, target.branch)
        .then(setCommits)
        .catch(() => undefined);
      void gitService.getStashes(target).then(setStashes).catch(() => undefined);
      void gitService.getRemotes(target).then(setRemotes).catch(() => undefined);
      void gitService.getTags(target).then(setTags).catch(() => undefined);

      return changed;
    },
    [],
  );

  /** Everything that needs the network. Failures here must not break the app. */
  const loadGitHubState = useCallback(async (target: Repository) => {
    if (!target.githubUrl) return;
    setLoadingGitHub(true);
    try {
      const [prs, issueList, runList, releaseList] = await Promise.all([
        githubService.getPullRequests(target.githubUrl),
        githubService.getIssues(target.githubUrl),
        githubService.getWorkflowRuns(target.githubUrl),
        githubService.getReleases(target.githubUrl),
      ]);
      setPullRequests(prs);
      setIssues(issueList);
      setRuns(runList);
      setReleases(releaseList);
    } catch {
      toast("Could not reach GitHub. Everything on this computer still works.", "warn");
    } finally {
      setLoadingGitHub(false);
    }
  }, [toast]);

  /**
   * Report a failed operation in the user's own terms.
   *
   * Backend errors arrive structured, so the message is already plain English
   * and the `kind` says whether this is worth suggesting a fix for. Nothing is
   * ever swallowed — a button that did nothing is the worst outcome here.
   */
  const reportError = useCallback(
    (error: unknown, fallback: string): AppError => {
      const appError = toAppError(error);
      const message = appError.message || fallback;

      if (appError.kind === "notAuthenticated" || appError.kind === "gitHubCliMissing") {
        toast(message, "warn");
        return appError;
      }

      toast(message, appError.kind === "network" ? "warn" : "error");
      return appError;
    },
    [toast],
  );

  /** What Git and GitHub look like on this machine, plus who is signed in. */
  const loadEnvironment = useCallback(async () => {
    try {
      const found = await gitService.getEnvironment();
      setEnvironment(found);
      setAccount(found.account);

      // A Git identity is required before anything can be committed, so the
      // setup is offered up front rather than at the moment a commit fails.
      if (!found.identity.configured) setIdentityOpen(true);

      // A mismatch is worth saying once, not on every commit.
      if (found.identityWarning) toast(found.identityWarning, "warn");

      if (found.account) {
        void githubService
          .getMyRepos()
          .then(setMyRepos)
          .catch(() => {
            // The clone dialog falls back to a plain URL box without this.
          });
      }

      return found;
    } catch {
      // Without an environment the app still runs; the checks that need it
      // simply report Git as missing when they are reached.
      return null;
    }
  }, [toast]);

  useEffect(() => {
    void loadEnvironment();
  }, [loadEnvironment]);

  /** The recent-projects list, refreshed whenever the picker is on screen. */
  const loadRecents = useCallback(async () => {
    try {
      setRecents(await gitService.getRecentRepositories());
    } catch {
      // An empty list is the same as never having opened anything, which the
      // picker already handles.
    }
  }, []);

  useEffect(() => {
    if (!repo) void loadRecents();
  }, [repo, loadRecents]);

  const forgetRecent = useCallback(
    async (path: string) => {
      await gitService.forgetRepository(path).catch(() => undefined);
      await loadRecents();
    },
    [loadRecents],
  );

  /* ---------------------------------------------------------------------- */
  /* Opening a project                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Picking a folder does not drop the user straight into the app — it opens
   * the connection dialog, which confirms Git is wired up and asks which
   * branch to work on. That dialog is the only "you're connected" moment.
   */
  const openRepository = useCallback(
    async (selected: Repository) => {
      // `gh` works out which project is meant from the folder it runs in, so
      // this has to happen before any GitHub call for the new repository.
      setActiveRepoPath(selected.path);

      const changed = await loadRepoState(selected);
      setRepo(selected);
      setPushResult(null);
      setPendingCommits(await gitService.getPendingCommits(selected).catch(() => []));
      setConnectedRepo(selected);
      await loadSuggestion(changed);
      void loadGitHubState(selected);
    },
    [loadRepoState, loadSuggestion, loadGitHubState],
  );

  /**
   * Re-read the project when it changes on disk.
   *
   * The backend watches with native filesystem events and debounces them, so
   * this runs on settled bursts rather than on every keystroke in an editor.
   */
  const refreshFromDisk = useCallback(async () => {
    if (!repo) return;
    try {
      // Only the working state — the cheap half. History, branches and tags do
      // not change because somebody saved a file.
      await loadWorkingState(repo);
    } catch {
      // A refresh that fails is not worth interrupting anyone over — the next
      // event, or the heartbeat, will try again.
    }
  }, [repo, loadWorkingState]);

  useRepositoryWatcher(repo?.path ?? null, refreshFromDisk);

  const connect = useCallback(async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const selected = await gitService.selectRepository();
      if (!selected) return;
      await openRepository(selected);
    } catch (error) {
      // The backend already explains this in the user's terms — "not a Git
      // project", "the folder has moved" and "Git is not installed" are all
      // different problems and each deserves its own sentence.
      setConnectError(toAppError(error).message);
    } finally {
      setConnecting(false);
    }
  }, [openRepository]);

  /** Reopen a project from the recent list without the folder picker. */
  const openRecent = useCallback(
    async (path: string) => {
      setConnecting(true);
      setConnectError(null);
      try {
        await openRepository(await gitService.openRepositoryAt(path));
      } catch (error) {
        setConnectError(toAppError(error).message);
      } finally {
        setConnecting(false);
      }
    },
    [openRepository],
  );

  /**
   * The two real steps behind "new project", run one after the other: turn a
   * folder into a Git repository, then create the matching project on GitHub
   * and connect it as `origin`. If the GitHub half fails, the local half is
   * left as-is rather than undone — a Git repository on its own computer is
   * never wrong, and the user can add the remote from Sync afterwards.
   *
   * Returns false, without throwing, if the user cancelled the folder picker
   * — that is a normal way out, not a failure the dialog should report.
   */
  const createProject = useCallback(
    async (input: { name: string; withReadme: boolean; private: boolean }) => {
      const created = await gitService.createRepository(input.name, input.withReadme);
      if (!created) return false;

      // The local half exists now. If the GitHub half fails, that is left
      // as-is rather than undone — a Git repository on its own computer is
      // never wrong, and the remote can be added from Sync afterwards.
      let connected = created;
      let published = true;

      try {
        connected = await gitService.publishRepository(created, input.name, "", input.private);
      } catch (error) {
        published = false;
        reportError(
          error,
          "The project was created on this computer, but not on GitHub. You can connect it from Sync.",
        );
      }

      setNewProjectOpen(false);
      await openRepository(connected);

      if (published) {
        toast(`${connected.name} created, and connected to GitHub.`, "success");
      } else {
        toast(`${connected.name} created on this computer.`, "success");
      }
      return true;
    },
    [openRepository, toast, reportError],
  );

  /**
   * Sign in from the New Project dialog.
   *
   * Defined as a plain function rather than a `useCallback` so it can reach
   * `signIn`, which is declared further down with the other account handlers.
   */
  async function signInForNewProject() {
    return signIn();
  }

  const clone = useCallback(
    async (url: string) => {
      setBusy("clone");
      try {
        const cloned = await gitService.clone(url);
        if (!cloned) return;
        setCloneOpen(false);
        await openRepository(cloned);
        toast(`${cloned.name} downloaded to your computer.`, "success");
      } catch (error) {
        reportError(error, "Could not download that project. Check the address and try again.");
      } finally {
        setBusy(null);
      }
    },
    [openRepository, toast, reportError],
  );

  /** "Thanks!" on the connection dialog. Creates the branch if asked. */
  const confirmConnection = useCallback(
    async (branch: string, create: boolean, from: string) => {
      if (!repo) return;
      setBusy("connect");
      try {
        if (create) {
          await gitService.createBranch(repo, branch, from);
          toast(`You are now on ${branch}. Nothing here affects ${from} until you merge.`, "success");
        } else if (branch !== repo.branch) {
          await gitService.switchBranch(repo, branch);
          toast(`Switched to ${branch}.`, "success");
        }

        const updated = { ...repo, branch };
        setRepo(updated);
        await loadRepoState(updated);
        setConnectedRepo(null);
        setView("home");
        if (!onboarded) completeOnboarding();
      } finally {
        setBusy(null);
      }
    },
    [repo, loadRepoState, onboarded, completeOnboarding, toast],
  );

  /* ---------------------------------------------------------------------- */
  /* The everyday loop                                                       */
  /* ---------------------------------------------------------------------- */

  const stagedFiles = useMemo(() => files.filter((f) => f.staged), [files]);
  const canCommit = stagedFiles.length > 0 && message.trim().length > 0;

  // Stable, so it does not invalidate the memoised Changes screen on every
  // keystroke in the message box.
  const regenerate = useCallback(async () => {
    setRegenerating(true);
    try {
      // Clearing first lets the suggestion replace what is there — otherwise
      // `loadSuggestion` keeps the existing text rather than overwriting it.
      setMessage("");
      await loadSuggestion(filesRef.current);
    } finally {
      setRegenerating(false);
    }
  }, [loadSuggestion]);

  /**
   * Tick or untick a file.
   *
   * The tick box *is* Git's index, so this stages or unstages for real rather
   * than only marking the row. The UI updates first so the click feels
   * instant, and rolls back if Git refuses.
   */
  const toggleFile = useCallback(
    (path: string) => {
      const file = files.find((f) => f.path === path);
      if (!repo || !file) return;

      const next = !file.staged;
      setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, staged: next } : f)));

      const action = next
        ? gitService.stageFiles(repo, [path])
        : gitService.unstageFiles(repo, [path]);

      void action.catch((error) => {
        setFiles((prev) =>
          prev.map((f) => (f.path === path ? { ...f, staged: !next } : f)),
        );
        reportError(error, "Could not change what is included in the next commit.");
      });
    },
    [repo, files, reportError],
  );

  const toggleAll = useCallback(
    (staged: boolean) => {
      if (!repo) return;

      const paths = files.map((f) => f.path);
      setFiles((prev) => prev.map((f) => ({ ...f, staged })));

      const action = staged
        ? gitService.stageFiles(repo, paths)
        : gitService.unstageFiles(repo, paths);

      void action.catch((error) => {
        setFiles((prev) => prev.map((f) => ({ ...f, staged: !staged })));
        reportError(error, "Could not change what is included in the next commit.");
      });
    },
    [repo, files, reportError],
  );

  /** Local and reversible — the step users take most often. */
  const commit = useCallback(async () => {
    if (!repo || !canCommit) return;

    const currentBranch = branches.find((b) => b.name === repo.branch);
    if (behaviour.warnOnMainBranch && currentBranch?.isDefault) {
      toast(
        `You are committing straight to ${repo.branch}. Most teams expect a branch and a pull request instead.`,
        "warn",
      );
    }

    setBusy("commit");
    try {
      // Guard rails run against the real files on disk. They warn rather than
      // block: the user decides, but not without being told.
      if (behaviour.warnOnLargeFiles || behaviour.warnOnSecrets) {
        const warnings = await gitService
          .getCommitWarnings(repo, stagedFiles, {
            largeFiles: behaviour.warnOnLargeFiles,
            secrets: behaviour.warnOnSecrets,
          })
          .catch(() => []);

        for (const warning of warnings) toast(warning.message, "warn");
      }

      const full = description.trim() ? `${message}\n\n${description.trim()}` : message;
      const result = await gitService.commit(repo, stagedFiles, full);

      setPendingCommits((prev) => [...prev, result.save]);
      setMessage("");
      setDescription("");
      setExplanation("");

      // Re-read rather than filtering locally: a commit can leave files behind
      // (unticked ones, and anything edited again while it ran).
      const changed = await loadRepoState(repo);
      await loadSuggestion(changed);
      toast("Committed on this computer. Push when you want to share it.", "success");
    } catch (error) {
      const failure = reportError(error, "Could not commit.");
      // Committing without a Git identity is the one failure with an obvious
      // next step, so the setup is offered instead of just being reported.
      if (failure.kind === "invalidInput" && !environment?.identity.configured) {
        setIdentityOpen(true);
      }
    } finally {
      setBusy(null);
    }
  }, [
    repo,
    canCommit,
    branches,
    behaviour.warnOnMainBranch,
    behaviour.warnOnLargeFiles,
    behaviour.warnOnSecrets,
    description,
    message,
    stagedFiles,
    toast,
    loadRepoState,
    loadSuggestion,
    reportError,
    environment,
  ]);

  /** Public and hard to undo, so it always goes through the confirmation. */
  const confirmPush = useCallback(async () => {
    if (!repo) return;
    setBusy("push");
    try {
      // "Pull before pushing" exists so a push is never rejected for being out
      // of date. A conflict here stops the push rather than pressing on.
      if (behaviour.pullBeforePush) {
        const found = await gitService.pull(repo, "merge").catch(() => [] as Conflict[]);
        if (found.length > 0) {
          setConflicts(found);
          setConflictOpen(true);
          setPushOpen(false);
          toast(
            `${found.length} file needs your decision before this can go to GitHub.`,
            "warn",
          );
          return;
        }
      }

      const result = await gitService.push(repo);
      setPushResult(result);
      setPendingCommits([]);
      setPushOpen(false);
      setSync(await gitService.getSyncState(repo));
      setBranches(await gitService.getBranches(repo));
      setCommits(await gitService.getHistory(repo, repo.branch));
      setView("changes");
      toast("Your work is on GitHub.", "success");
    } catch (error) {
      reportError(error, "Could not push to GitHub.");
    } finally {
      setBusy(null);
    }
  }, [repo, behaviour.pullBeforePush, toast, reportError]);

  const startPush = useCallback(() => {
    if (!repo) return;
    if (!behaviour.confirmPush) {
      void confirmPush();
      return;
    }
    setPushOpen(true);
  }, [repo, behaviour.confirmPush, confirmPush]);

  const pull = useCallback(
    async (strategy: "merge" | "rebase" = "merge") => {
      if (!repo) return;
      setBusy("pull");
      try {
        const found = await gitService.pull(repo, strategy);
        if (found.length > 0) {
          setConflicts(found);
          setConflictOpen(true);
          toast(
            `${found.length} ${found.length === 1 ? "file needs" : "files need"} your decision before the merge can finish.`,
            "warn",
          );
        } else {
          toast("You now have everyone else's latest work.", "success");
        }
        const changed = await loadRepoState(repo);
        await loadSuggestion(changed);
      } catch (error) {
        reportError(error, "Could not pull from GitHub.");
      } finally {
        setBusy(null);
      }
    },
    [repo, loadRepoState, loadSuggestion, toast, reportError],
  );

  const checkForUpdates = useCallback(async () => {
    if (!repo) return;
    setBusy("fetch");
    try {
      const state = await gitService.fetch(repo);
      setSync(state);
      setBranches(await gitService.getBranches(repo));
      toast(
        state.behind > 0
          ? `${state.behind} new commit${state.behind === 1 ? "" : "s"} on GitHub. Nothing has changed on your computer yet.`
          : "You are up to date with GitHub.",
        "info",
      );
    } catch (error) {
      reportError(error, "Could not check GitHub for updates.");
    } finally {
      setBusy(null);
    }
  }, [repo, toast, reportError]);

  /** The fork flow: pull the original project's work into this copy. */
  const syncFork = useCallback(async () => {
    if (!repo?.upstream) return;
    setBusy("fork");
    try {
      const found = await gitService.syncFork(repo);
      if (found.length > 0) {
        setConflicts(found);
        setConflictOpen(true);
        toast(
          `${repo.upstream.slug} changed the same lines you did. Pick which version to keep.`,
          "warn",
        );
      } else {
        toast(`Your fork now matches ${repo.upstream.slug}.`, "success");
      }
      setSync(await gitService.getSyncState(repo));
      setCommits(await gitService.getHistory(repo, repo.branch));
    } catch (error) {
      reportError(error, "Could not pull the original project's work.");
    } finally {
      setBusy(null);
    }
  }, [repo, toast, reportError]);

  /* ---------------------------------------------------------------------- */
  /* Branches, shelf, history                                                */
  /* ---------------------------------------------------------------------- */

  const switchBranch = useCallback(
    async (name: string) => {
      if (!repo) return;
      setBusy("switch");
      try {
        await gitService.switchBranch(repo, name);
        const updated = { ...repo, branch: name };
        setRepo(updated);
        const changed = await loadRepoState(updated);
        await loadSuggestion(changed);
        setPendingCommits(await gitService.getPendingCommits(updated).catch(() => []));
        toast(`Now on ${name}.`, "success");
      } catch (error) {
        reportError(error, `Could not switch to ${name}.`);
      } finally {
        setBusy(null);
      }
    },
    [repo, loadRepoState, loadSuggestion, toast, reportError],
  );

  const createBranch = useCallback(
    async (name: string, from: string) => {
      if (!repo) return;
      setBusy("branch");
      try {
        await gitService.createBranch(repo, name, from);
        const updated = { ...repo, branch: name };
        setRepo(updated);
        await loadRepoState(updated);
        setNewBranchOpen(false);
        toast(`${name} created from ${from}. You are on it now.`, "success");
      } catch (error) {
        reportError(error, `Could not create ${name}.`);
      } finally {
        setBusy(null);
      }
    },
    [repo, loadRepoState, toast, reportError],
  );

  const shelve = useCallback(async () => {
    if (!repo || files.length === 0) return;
    setBusy("shelve");
    try {
      const label = message.trim() || `Work in progress on ${repo.branch}`;
      await gitService.shelve(repo, label);
      setStashes(await gitService.getStashes(repo));
      setFiles(await gitService.getChangedFiles(repo));
      setMessage("");
      setDescription("");
      setExplanation("");
      toast("Set aside. Your project is clean — put it back from the Shelf whenever.", "success");
    } catch (error) {
      reportError(error, "Could not set that work aside.");
    } finally {
      setBusy(null);
    }
  }, [repo, files.length, message, toast, reportError]);

  const resolveConflict = useCallback(
    async (path: string, keep: "mine" | "theirs") => {
      if (!repo) return;
      try {
        await gitService.resolveConflict(repo, path, keep);
        setConflicts((prev) => prev.map((c) => (c.path === path ? { ...c, choice: keep } : c)));
      } catch (error) {
        reportError(error, "Could not keep that version.");
      }
    },
    [repo, reportError],
  );

  /**
   * Finish the merge, rebase or cherry-pick that stopped on conflicts.
   *
   * Every side has been chosen and staged by now, so this completes the real
   * Git operation — leaving the repository mid-merge would be worse than not
   * having started it.
   */
  const finishConflicts = useCallback(async () => {
    if (!repo) return;
    setBusy("conflicts");
    try {
      await gitService.continueOperation(repo);
      setConflicts([]);
      setConflictOpen(false);
      const changed = await loadRepoState(repo);
      await loadSuggestion(changed);
      setCommits(await gitService.getHistory(repo, repo.branch));
      setSync(await gitService.getSyncState(repo));
      toast("Merge finished.", "success");
    } catch (error) {
      reportError(error, "Could not finish the merge.");
      // Something is still unresolved — show what, rather than closing.
      setConflicts(await gitService.getConflicts(repo).catch(() => []));
    } finally {
      setBusy(null);
    }
  }, [repo, loadRepoState, loadSuggestion, toast, reportError]);

  /** Abandon the merge or rebase and put the branch back as it was. */
  const abortConflicts = useCallback(async () => {
    if (!repo) return;
    setBusy("conflicts");
    try {
      await gitService.abortOperation(repo);
      setConflicts([]);
      setConflictOpen(false);
      const changed = await loadRepoState(repo);
      await loadSuggestion(changed);
      toast("Stopped. Your branch is back as it was before.", "info");
    } catch (error) {
      reportError(error, "Could not stop that operation.");
    } finally {
      setBusy(null);
    }
  }, [repo, loadRepoState, loadSuggestion, toast, reportError]);

  /**
   * Fetch one file's diff, for a row opened in a list that shipped without it.
   *
   * Long changesets arrive with only the first page of patches attached, so
   * this fills in the rest one row at a time — the file the user actually
   * opened, and nothing else.
   */
  const requestDiff = useCallback(async (path: string) => {
    const project = repoRef.current;
    if (!project) return;

    try {
      const diff = await gitService.getFileDiff(project, path);
      if (diff.length === 0) return;
      setFiles((prev) =>
        prev.map((f) => (f.path === path && f.diff.length === 0 ? { ...f, diff } : f)),
      );
    } catch {
      // The row shows "no preview available" — not worth a toast.
    }
  }, []);

  const openUrl = useCallback((url: string) => {
    void gitService.openInBrowser(url);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Row actions                                                             */
  /* ---------------------------------------------------------------------- */

  /** Throw away one file's uncommitted changes. Cannot be undone. */
  const discardFile = useCallback(
    async (path: string) => {
      if (!repo) return;
      try {
        await gitService.discardFile(repo, path);
        setFiles(await gitService.getChangedFiles(repo));
        toast("Changes thrown away. That one cannot be undone.", "warn");
      } catch (error) {
        reportError(error, "Could not discard those changes.");
      }
    },
    [repo, toast, reportError],
  );

  /** Undo a commit by adding one that reverses it. */
  const revertCommit = useCallback(
    async (hash: string) => {
      if (!repo) return;
      setBusy("revert");
      try {
        const found = await gitService.revertCommit(repo, hash);
        if (found.length > 0) {
          setConflicts(found);
          setConflictOpen(true);
          toast("That undo overlaps with other work. Pick which version to keep.", "warn");
          return;
        }
        const changed = await loadRepoState(repo);
        await loadSuggestion(changed);
        setView("changes");
        toast("A change undoing that commit is waiting in Changes.", "success");
      } catch (error) {
        reportError(error, "Could not undo that commit.");
      } finally {
        setBusy(null);
      }
    },
    [repo, loadRepoState, loadSuggestion, toast, reportError],
  );

  /** Apply one commit from another branch onto this one. */
  const cherryPick = useCallback(
    async (hash: string) => {
      if (!repo) return;
      setBusy("cherry-pick");
      try {
        const found = await gitService.cherryPick(repo, hash);
        if (found.length > 0) {
          setConflicts(found);
          setConflictOpen(true);
          toast("That commit overlaps with your work. Pick which version to keep.", "warn");
          return;
        }
        await loadRepoState(repo);
        toast("That commit has been applied to your branch.", "success");
      } catch (error) {
        reportError(error, "Could not apply that commit.");
      } finally {
        setBusy(null);
      }
    },
    [repo, loadRepoState, toast, reportError],
  );

  const renameBranch = useCallback(
    async (from: string, to: string) => {
      if (!repo) return;
      setBusy("rename");
      try {
        await gitService.renameBranch(repo, from, to);
        setBranches(await gitService.getBranches(repo));
        if (repo.branch === from) setRepo({ ...repo, branch: to });
        toast(`Renamed to ${to}.`, "success");
      } catch (error) {
        reportError(error, `Could not rename ${from}.`);
      } finally {
        setBusy(null);
      }
    },
    [repo, toast, reportError],
  );

  /**
   * Delete a branch.
   *
   * Unmerged work is counted first and the user is told exactly how much would
   * be lost, so the second attempt is an informed decision rather than a
   * repeated click.
   */
  const deleteBranch = useCallback(
    async (name: string) => {
      if (!repo) return;
      setBusy("delete");
      try {
        await gitService.deleteBranch(repo, name);
        setBranches(await gitService.getBranches(repo));
        toast(`${name} deleted.`, "success");
      } catch (error) {
        const failure = toAppError(error);

        if (failure.kind === "rejected") {
          const lost = await gitService.getUnmergedCount(repo, name).catch(() => 0);
          const confirmed = window.confirm(
            `${failure.message}\n\nDelete ${name} anyway and lose ${
              lost === 1 ? "that commit" : `those ${lost} commits`
            } for good?`,
          );

          if (confirmed) {
            try {
              await gitService.deleteBranch(repo, name, true);
              setBranches(await gitService.getBranches(repo));
              toast(`${name} deleted, along with its unpushed work.`, "warn");
              return;
            } catch (forced) {
              reportError(forced, `Could not delete ${name}.`);
              return;
            }
          }
          return;
        }

        reportError(error, `Could not delete ${name}.`);
      } finally {
        setBusy(null);
      }
    },
    [repo, toast, reportError],
  );

  const mergeBranch = useCallback(
    async (from: string) => {
      if (!repo) return;
      setBusy("merge");
      try {
        const found = await gitService.mergeBranch(repo, from);
        if (found.length > 0) {
          setConflicts(found);
          setConflictOpen(true);
          toast(`${from} changed the same lines you did. Pick which version to keep.`, "warn");
          return;
        }
        await loadRepoState(repo);
        toast(`${from} merged into ${repo.branch}.`, "success");
      } catch (error) {
        reportError(error, `Could not merge ${from}.`);
      } finally {
        setBusy(null);
      }
    },
    [repo, loadRepoState, toast, reportError],
  );

  const unshelve = useCallback(
    async (id: string) => {
      if (!repo) return;
      setBusy("unshelve");
      try {
        const found = await gitService.unshelve(repo, id);
        const changed = await loadRepoState(repo);
        await loadSuggestion(changed);

        if (found.length > 0) {
          setConflicts(found);
          setConflictOpen(true);
          toast("That work overlaps with your current edits. Pick which version to keep.", "warn");
          return;
        }

        setView("changes");
        toast("Your changes are back in the project.", "success");
      } catch (error) {
        reportError(error, "Could not put that work back.");
      } finally {
        setBusy(null);
      }
    },
    [repo, loadRepoState, loadSuggestion, toast, reportError],
  );

  const dropShelf = useCallback(
    async (id: string) => {
      if (!repo) return;
      try {
        await gitService.dropShelf(repo, id);
        setStashes(await gitService.getStashes(repo));
        toast("Removed from the shelf.", "warn");
      } catch (error) {
        reportError(error, "Could not remove that from the shelf.");
      }
    },
    [repo, toast, reportError],
  );

  const removeRemote = useCallback(
    async (name: string) => {
      if (!repo) return;
      try {
        await gitService.removeRemote(repo, name);
        setRemotes(await gitService.getRemotes(repo));
        toast(`${name} removed.`, "info");
      } catch (error) {
        reportError(error, `Could not remove ${name}.`);
      }
    },
    [repo, toast, reportError],
  );

  const createTag = useCallback(
    async (name: string, note: string) => {
      if (!repo) return;
      setBusy("tag");
      try {
        await gitService.createTag(repo, name, note);
        setTags(await gitService.getTags(repo));
        toast(`${name} tagged. Push to publish it on GitHub.`, "success");
      } catch (error) {
        reportError(error, `Could not create ${name}.`);
      } finally {
        setBusy(null);
      }
    },
    [repo, toast, reportError],
  );

  /* ---------------------------------------------------------------------- */
  /* GitHub actions                                                          */
  /* ---------------------------------------------------------------------- */

  const createPullRequest = useCallback(
    async (input: { head: string; base: string; title: string; body: string; draft: boolean }) => {
      if (!repo?.githubUrl) return;
      setBusy("pr");
      try {
        const created = await githubService.createPullRequest({
          repoUrl: repo.githubUrl,
          ...input,
        });
        setPullRequests(await githubService.getPullRequests(repo.githubUrl));
        toast(`Pull request #${created.number} opened.`, "success");
      } catch (error) {
        reportError(error, "Could not open that pull request.");
      } finally {
        setBusy(null);
      }
    },
    [repo, toast, reportError],
  );

  const mergePullRequest = useCallback(
    async (number: number) => {
      if (!repo?.githubUrl) return;
      setBusy("merge");
      try {
        await githubService.mergePullRequest(repo.githubUrl, number);
        setPullRequests(await githubService.getPullRequests(repo.githubUrl));
        // Merging changes the default branch on GitHub, so the local view of
        // how far behind it is has just gone stale.
        setSync(await gitService.getSyncState(repo));
        toast(`#${number} merged.`, "success");
      } catch (error) {
        reportError(error, `Could not merge #${number}.`);
      } finally {
        setBusy(null);
      }
    },
    [repo, toast, reportError],
  );

  const createIssue = useCallback(
    async (title: string, body: string) => {
      if (!repo?.githubUrl) return;
      setBusy("issue");
      try {
        const created = await githubService.createIssue(repo.githubUrl, title, body);
        setIssues(await githubService.getIssues(repo.githubUrl));
        toast(`Issue #${created.number} created.`, "success");
      } catch (error) {
        reportError(error, "Could not create that issue.");
      } finally {
        setBusy(null);
      }
    },
    [repo, toast, reportError],
  );

  const rerunWorkflow = useCallback(
    async (id: string) => {
      if (!repo?.githubUrl) return;
      try {
        await githubService.rerunWorkflow(repo.githubUrl, id);
        setRuns(await githubService.getWorkflowRuns(repo.githubUrl));
        toast("Started again on GitHub.", "info");
      } catch (error) {
        reportError(error, "Could not start that run again.");
      }
    },
    [repo, toast, reportError],
  );

  const signOut = useCallback(async () => {
    try {
      await githubService.signOut();
      setAccount(null);
      setPullRequests([]);
      setIssues([]);
      setRuns([]);
      setReleases([]);
      setMyRepos([]);
      await loadEnvironment();
      toast("Signed out of GitHub. Everything on this computer still works.", "info");
    } catch (error) {
      reportError(error, "Could not sign out.");
    }
  }, [loadEnvironment, toast, reportError]);

  /** Write the name and email that go on every commit. Never done silently. */
  const saveIdentity = useCallback(
    async (name: string, email: string) => {
      setBusy("identity");
      try {
        await gitService.setIdentity(name, email, repo);
        setIdentityOpen(false);
        await loadEnvironment();
        toast(`Commits will be signed ${name} <${email}>.`, "success");
      } catch (error) {
        reportError(error, "Could not save that name and email.");
      } finally {
        setBusy(null);
      }
    },
    [repo, loadEnvironment, toast, reportError],
  );

  /** Sign in to GitHub through the official browser flow. */
  const signIn = useCallback(async () => {
    setBusy("signin");
    try {
      const found = await githubService.signIn();
      setAccount(found);
      await loadEnvironment();
      if (found) {
        toast(`Signed in to GitHub as ${found.login}.`, "success");
        if (repo) void loadGitHubState(repo);
      }
      return found;
    } catch (error) {
      reportError(error, "Could not sign in to GitHub.");
      return null;
    } finally {
      setBusy(null);
    }
  }, [loadEnvironment, loadGitHubState, repo, toast, reportError]);

  /* ---------------------------------------------------------------------- */
  /* Keyboard shortcuts                                                      */
  /* ---------------------------------------------------------------------- */

  /**
   * The shortcut handlers, kept in a ref.
   *
   * Several of these change identity whenever the commit message does. Listing
   * them as effect dependencies meant removing and re-adding a document-level
   * keydown listener on every character typed; reading them through a ref lets
   * the listener be registered exactly once.
   */
  const shortcuts = useRef({ repo, connectedRepo, canCommit, commit, startPush, pull, loadRepoState });
  shortcuts.current = { repo, connectedRepo, canCommit, commit, startPush, pull, loadRepoState };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const key = e.key.toLowerCase();
      const typing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;

      if (key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }

      const current = shortcuts.current;

      // The rest need a project open and no dialog in the way.
      if (!current.repo || current.connectedRepo) return;

      if (key === "enter" && current.canCommit) {
        e.preventDefault();
        void current.commit();
      } else if (e.shiftKey && key === "p") {
        e.preventDefault();
        current.startPush();
      } else if (e.shiftKey && key === "l") {
        e.preventDefault();
        void current.pull();
      } else if (key === "b" && !typing) {
        e.preventDefault();
        setNewBranchOpen(true);
      } else if (key === "r" && !typing) {
        e.preventDefault();
        void current.loadRepoState(current.repo);
      } else if (/^[1-9]$/.test(key) && !typing) {
        const target = VIEW_ORDER[Number(key) - 1];
        if (target) {
          e.preventDefault();
          setView(target);
        }
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Command palette                                                         */
  /* ---------------------------------------------------------------------- */

  // Built only while the palette is on screen. `commit` changes identity on
  // every keystroke in the message box, so without this gate the whole command
  // list — twenty-odd entries, each with a JSX icon — was rebuilt per character
  // typed, for a dialog that was not open.
  const commands = useMemo<Command[]>(() => {
    if (!paletteOpen) return [];

    if (!repo) return [];

    const go = (id: string, label: string, hint: string, target: View, icon?: React.ReactNode) => ({
      id,
      label,
      hint,
      group: "Go to",
      icon,
      run: () => setView(target),
    });

    return [
      {
        id: "commit",
        label: "Commit",
        hint: "Save a snapshot of the ticked files on this computer",
        group: "Everyday",
        icon: <CheckIcon className="h-[15px] w-[15px]" />,
        disabled: !canCommit,
        run: () => void commit(),
      },
      {
        id: "push",
        label: "Push",
        hint: "Upload your commits to GitHub",
        group: "Everyday",
        icon: <ArrowUpIcon className="h-[15px] w-[15px]" />,
        keywords: "upload share publish send",
        disabled: (sync?.ahead ?? 0) === 0,
        run: startPush,
      },
      {
        id: "pull",
        label: "Pull",
        hint: "Bring down other people's work",
        group: "Everyday",
        icon: <ArrowDownIcon className="h-[15px] w-[15px]" />,
        keywords: "download update get latest",
        run: () => void pull(),
      },
      {
        id: "fetch",
        label: "Check for updates",
        hint: "See what is new on GitHub without changing any file",
        group: "Everyday",
        icon: <SyncIcon className="h-[15px] w-[15px]" />,
        run: () => void checkForUpdates(),
      },
      {
        id: "new-branch",
        label: "New branch",
        hint: "Start a separate line of work",
        group: "Branches",
        icon: <PlusIcon className="h-[15px] w-[15px]" />,
        run: () => setNewBranchOpen(true),
      },
      ...branches
        .filter((b) => !b.isCurrent)
        .slice(0, 6)
        .map((b) => ({
          id: `switch-${b.name}`,
          label: `Switch to ${b.name}`,
          hint: b.lastCommit?.message ?? "No commits yet",
          group: "Branches",
          icon: <BranchIcon className="h-[15px] w-[15px]" />,
          keywords: "checkout branch",
          run: () => void switchBranch(b.name),
        })),
      {
        id: "shelve",
        label: "Shelve current work",
        hint: "Put unfinished changes aside without committing",
        group: "Branches",
        icon: <ArchiveIcon className="h-[15px] w-[15px]" />,
        keywords: "stash save aside",
        disabled: files.length === 0,
        run: () => void shelve(),
      },
      ...(repo.upstream
        ? [
            {
              id: "sync-fork",
              label: `Pull from ${repo.upstream.slug}`,
              hint: "Update your fork with the original project's latest work",
              group: "GitHub",
              icon: <ForkIcon className="h-[15px] w-[15px]" />,
              keywords: "upstream fork sync original",
              run: () => void syncFork(),
            },
          ]
        : []),
      {
        id: "new-pr",
        label: "Open a pull request",
        hint: "Ask for this branch to be reviewed and merged",
        group: "GitHub",
        icon: <PullRequestIcon className="h-[15px] w-[15px]" />,
        keywords: "pr review merge",
        disabled: !repo.githubUrl,
        run: () => {
          setView("pull-requests");
          setPrDraftBranch(repo.branch);
        },
      },
      {
        id: "new-tag",
        label: "Tag this version",
        hint: "Give the latest commit a permanent name",
        group: "GitHub",
        icon: <TagIcon className="h-[15px] w-[15px]" />,
        keywords: "release version semver",
        run: () => setView("releases"),
      },
      go("go-home", "Overview", "What needs your attention", "home"),
      go("go-changes", "Changes", "Files you have edited", "changes"),
      go("go-history", "History", "Every commit on this branch", "history"),
      go("go-branches", "Branches", "Create, switch, merge and delete", "branches"),
      go("go-shelf", "Shelf", "Work you set aside", "shelf"),
      go("go-sync", "Sync", "Push, pull and remotes", "sync"),
      go("go-prs", "Pull requests", "Review and merge", "pull-requests"),
      go("go-issues", "Issues", "Bugs and to-dos", "issues"),
      go("go-checks", "Checks", "Automated test results", "checks"),
      go("go-releases", "Releases", "Tags and published versions", "releases"),
      go("go-learn", "Learn Git", "Every term, explained", "learn", <BookIcon className="h-[15px] w-[15px]" />),
      go("go-settings", "Settings", "Theme, behaviour and account", "settings"),
    ];
  }, [
    paletteOpen,
    repo,
    branches,
    files.length,
    sync,
    canCommit,
    commit,
    startPush,
    pull,
    checkForUpdates,
    switchBranch,
    shelve,
    syncFork,
  ]);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  // First launch: the guided introduction, which ends at the folder picker.
  if (!onboarded) {
    return (
      <>
        <Onboarding
          connecting={connecting}
          connectError={connectError}
          onSelectRepository={connect}
          onCloneRepository={() => setCloneOpen(true)}
          onCreateRepository={() => setNewProjectOpen(true)}
        />

        {connectedRepo && (
          <RepoConnectedModal
            repo={connectedRepo}
            branches={branches}
            busy={busy === "connect"}
            onConfirm={confirmConnection}
          />
        )}

        {cloneOpen && (
          <CloneModal
            repos={myRepos}
            busy={busy === "clone"}
            signedIn={account !== null}
            onCancel={() => setCloneOpen(false)}
            onClone={clone}
          />
        )}

        {newProjectOpen && (
          <NewProjectModal
            onCheckGit={() => gitService.isGitInstalled()}
            onCheckAccount={() => githubService.getAccount()}
            onSignIn={signInForNewProject}
            onCreate={createProject}
            onCancel={() => setNewProjectOpen(false)}
          />
        )}

        <Toasts toasts={toasts} onDismiss={dismiss} />
      </>
    );
  }

  // Returning user with no project open — just the picker.
  if (!repo) {
    return (
      <>
        <ConnectView
          onSelect={connect}
          onClone={() => setCloneOpen(true)}
          onCreate={() => setNewProjectOpen(true)}
          connecting={connecting}
          error={connectError}
          recents={recents}
          onOpenRecent={(path) => void openRecent(path)}
          onForgetRecent={(path) => void forgetRecent(path)}
        />

        {cloneOpen && (
          <CloneModal
            repos={myRepos}
            busy={busy === "clone"}
            signedIn={account !== null}
            onCancel={() => setCloneOpen(false)}
            onClone={clone}
          />
        )}

        {newProjectOpen && (
          <NewProjectModal
            onCheckGit={() => gitService.isGitInstalled()}
            onCheckAccount={() => githubService.getAccount()}
            onSignIn={signInForNewProject}
            onCreate={createProject}
            onCancel={() => setNewProjectOpen(false)}
          />
        )}

        <Toasts toasts={toasts} onDismiss={dismiss} />
      </>
    );
  }

  const counts: NavCounts = {
    changes: files.length,
    shelf: stashes.length,
    sync: (sync?.ahead ?? 0) + (sync?.behind ?? 0),
    pullRequests: pullRequests.filter((p) => p.state === "open" || p.state === "draft").length,
    issues: issues.filter((i) => i.state === "open" && i.assignedToMe).length,
    failingChecks: runs.filter((r) => r.status === "failure").length,
  };

  const currentBranch = branches.find((b) => b.name === repo.branch);
  const showCommitBar = view === "changes" && files.length > 0 && pushResult === null;

  return (
    <div className="ambient relative flex h-full bg-ground">
      <Sidebar
        view={view}
        onNavigate={setView}
        counts={counts}
        hasRemote={repo.githubUrl !== null}
        onOpenPalette={() => setPaletteOpen(true)}
        onNewProject={() => setNewProjectOpen(true)}
      />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <TopBar
          repo={repo}
          branches={branches}
          sync={sync}
          fetching={busy === "fetch"}
          onSwitchBranch={(name) => void switchBranch(name)}
          onNewBranch={() => setNewBranchOpen(true)}
          onFetch={() => void checkForUpdates()}
          onChangeRepository={connect}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[860px] px-6 pb-10 pt-7">
            {view === "home" && (
              <HomeView
                repo={repo}
                files={files}
                branchCount={branches.length}
                commits={commits}
                conflicts={conflicts}
                stashes={stashes}
                sync={sync}
                pullRequests={pullRequests}
                issues={issues}
                runs={runs}
                onNavigate={setView}
              />
            )}

            {view === "changes" && (
              <ChangesView
                repo={repo}
                files={files}
                pendingCommits={pendingCommits}
                conflicts={conflicts}
                message={message}
                description={description}
                explanation={explanation}
                regenerating={regenerating}
                pushResult={pushResult}
                onMessageChange={setMessage}
                onDescriptionChange={setDescription}
                onRegenerate={regenerate}
                onToggleFile={toggleFile}
                onToggleAll={toggleAll}
                onDiscardFile={(path) => void discardFile(path)}
                onRequestDiff={(path) => void requestDiff(path)}
                onShelve={() => void shelve()}
                onDismissSuccess={() => setPushResult(null)}
                onOpenCommit={() => {
                  if (pushResult?.commitUrl) openUrl(pushResult.commitUrl);
                }}
                onReviewPush={startPush}
                onResolveConflicts={() => setConflictOpen(true)}
              />
            )}

            {view === "history" && (
              <HistoryView
                repo={repo}
                commits={commits}
                loading={false}
                onRevert={(hash) => void revertCommit(hash)}
                onCherryPick={(hash) => void cherryPick(hash)}
                onOpenOnGitHub={(hash) => {
                  if (repo.githubUrl) openUrl(`${repo.githubUrl}/commit/${hash}`);
                }}
              />
            )}

            {view === "branches" && (
              <BranchesView
                repo={repo}
                branches={branches}
                busy={busy !== null}
                onSwitch={(name) => void switchBranch(name)}
                onCreate={() => setNewBranchOpen(true)}
                onRename={(from, to) => void renameBranch(from, to)}
                onDelete={(name) => void deleteBranch(name)}
                onMergeInto={(from) => void mergeBranch(from)}
                onOpenPullRequest={(branch) => {
                  setView("pull-requests");
                  setPrDraftBranch(branch);
                }}
              />
            )}

            {view === "shelf" && (
              <ShelfView
                stashes={stashes}
                busy={busy !== null}
                hasChanges={files.length > 0}
                onShelveCurrent={() => void shelve()}
                onRestore={(id) => void unshelve(id)}
                onDrop={(id) => void dropShelf(id)}
              />
            )}

            {view === "sync" && (
              <SyncView
                repo={repo}
                sync={sync}
                remotes={remotes}
                busy={busy}
                onFetch={() => void checkForUpdates()}
                onPull={(strategy) => void pull(strategy)}
                onPush={startPush}
                onSyncFork={() => void syncFork()}
                onAddRemote={() => setRemoteOpen(true)}
                onRemoveRemote={(name) => void removeRemote(name)}
                onOpenUrl={openUrl}
              />
            )}

            {view === "pull-requests" && (
              <PullRequestsView
                pullRequests={pullRequests}
                branches={branches}
                currentBranch={repo.branch}
                defaultBranch={repo.defaultBranch}
                loading={loadingGitHub}
                busy={busy !== null}
                signedIn={account !== null}
                draftBranch={prDraftBranch}
                onDraftBranchChange={setPrDraftBranch}
                onCreate={(input) => void createPullRequest(input)}
                onMerge={(number) => void mergePullRequest(number)}
                onOpenUrl={openUrl}
                onSignIn={() => void signIn()}
              />
            )}

            {view === "issues" && (
              <IssuesView
                issues={issues}
                loading={loadingGitHub}
                busy={busy !== null}
                signedIn={account !== null}
                onCreate={(title, body) => void createIssue(title, body)}
                onOpenUrl={openUrl}
                onSignIn={() => void signIn()}
              />
            )}

            {view === "checks" && (
              <ChecksView
                runs={runs}
                currentBranch={repo.branch}
                loading={loadingGitHub}
                busy={busy !== null}
                signedIn={account !== null}
                onRerun={(id) => void rerunWorkflow(id)}
                onOpenUrl={openUrl}
                onSignIn={() => void signIn()}
              />
            )}

            {view === "releases" && (
              <ReleasesView
                releases={releases}
                tags={tags}
                loading={loadingGitHub}
                busy={busy !== null}
                onCreateTag={(name, note) => void createTag(name, note)}
                onOpenUrl={openUrl}
              />
            )}

            {view === "learn" && <LearnView />}

            {view === "settings" && (
              <SettingsView
                repo={repo}
                remotes={remotes}
                account={account}
                behaviour={behaviour}
                busy={busy !== null}
                onBehaviourChange={setBehaviour}
                onChangeRepository={connect}
                onOpenFolder={() => void gitService.openFolder(repo)}
                onAddRemote={() => setRemoteOpen(true)}
                onRemoveRemote={(name) => void removeRemote(name)}
                onSignIn={() => void signIn()}
                onSignOut={() => void signOut()}
                onReplayIntro={replayIntro}
                identity={environment?.identity ?? null}
                identityWarning={environment?.identityWarning ?? null}
                onEditIdentity={() => setIdentityOpen(true)}
              />
            )}
          </div>
        </div>

        {/* The commit bar. Present only where committing is the next action. */}
        {showCommitBar && (
          <div className="flex flex-none justify-center border-t border-line bg-surface/70 px-6 py-3 backdrop-blur-xl">
            <div className="flex w-full max-w-[860px] items-center gap-[10px]">
              <Button onClick={() => void pull()} disabled={busy !== null}>
                <ArrowDownIcon className="h-[16px] w-[16px]" />
                {busy === "pull" ? "Getting…" : "Pull"}
              </Button>

              <Button
                variant="primary"
                className="flex-1"
                onClick={() => void commit()}
                disabled={busy !== null || !canCommit}
              >
                <CheckIcon className="h-[16px] w-[16px]" />
                {busy === "commit"
                  ? "Committing…"
                  : `Commit ${stagedFiles.length} ${stagedFiles.length === 1 ? "file" : "files"}`}
              </Button>

              <span className="hidden flex-none text-[12px] text-faint sm:block">
                Ctrl + Enter
              </span>
            </div>
          </div>
        )}

        {/* Nothing left to commit, but work is still waiting to go public. */}
        {view === "changes" && files.length === 0 && pendingCommits.length > 0 && !pushResult && (
          <div className="flex flex-none justify-center border-t border-line bg-surface/70 px-6 py-3 backdrop-blur-xl">
            <div className="flex w-full max-w-[860px]">
              <Button variant="danger" className="flex-1" onClick={startPush}>
                <ArrowUpIcon className="h-[16px] w-[16px]" />
                Push {pendingCommits.length}{" "}
                {pendingCommits.length === 1 ? "commit" : "commits"} to GitHub
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* --- Dialogs --------------------------------------------------------- */}

      {connectedRepo && (
        <RepoConnectedModal
          repo={connectedRepo}
          branches={branches}
          busy={busy === "connect"}
          onConfirm={confirmConnection}
        />
      )}

      {pushOpen && (
        <PushModal
          saves={pendingCommits}
          repoName={repo.name}
          branch={repo.branch}
          branchProtected={currentBranch?.isProtected ?? false}
          busy={busy === "push"}
          onCancel={() => setPushOpen(false)}
          onConfirm={() => void confirmPush()}
        />
      )}

      {conflictOpen && conflicts.length > 0 && (
        <ConflictModal
          conflicts={conflicts}
          busy={busy !== null}
          onResolve={(path, keep) => void resolveConflict(path, keep)}
          onFinish={() => void finishConflicts()}
          onCancel={() => setConflictOpen(false)}
          onAbort={() => void abortConflicts()}
          onExplain={
            repo ? (path) => gitService.explainConflict(repo, path) : undefined
          }
        />
      )}

      {/* Git will not commit without a name and an email. */}
      {identityOpen && environment && (
        <IdentityModal
          identity={environment.identity}
          suggestedName={account?.name ?? null}
          suggestedEmail={null}
          warning={environment.identityWarning}
          busy={busy === "identity"}
          onSave={(name, email) => void saveIdentity(name, email)}
          onCancel={
            environment.identity.configured ? () => setIdentityOpen(false) : undefined
          }
        />
      )}

      {newBranchOpen && (
        <NewBranchModal
          branches={branches}
          from={repo.branch}
          busy={busy === "branch"}
          onCancel={() => setNewBranchOpen(false)}
          onCreate={(name, from) => void createBranch(name, from)}
        />
      )}

      {remoteOpen && (
        <AddRemoteModal
          busy={busy === "remote"}
          onCancel={() => setRemoteOpen(false)}
          onAdd={(name, url) => {
            setBusy("remote");
            void gitService
              .addRemote(repo, name, url)
              .then(async () => {
                setRemotes(await gitService.getRemotes(repo));
                setRemoteOpen(false);
                toast(`${name} added. Sync can now pull from it.`, "success");
              })
              .finally(() => setBusy(null));
          }}
        />
      )}

      {cloneOpen && (
        <CloneModal
          repos={myRepos}
          busy={busy === "clone"}
          signedIn={account !== null}
          onCancel={() => setCloneOpen(false)}
          onClone={clone}
        />
      )}

      {newProjectOpen && (
        <NewProjectModal
          onCheckGit={() => gitService.isGitInstalled()}
          onCheckAccount={() => githubService.getAccount()}
          onSignIn={signInForNewProject}
          onCreate={createProject}
          onCancel={() => setNewProjectOpen(false)}
        />
      )}

      {paletteOpen && (
        <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
