/** Domain types shared by the UI and the Git service layer. */

export type FileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

/** Single-letter badge shown in the file list. */
export const STATUS_LETTER: Record<FileStatus, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  untracked: "U",
  conflicted: "!",
};

/** Plain-language name for each status, used in tooltips and summaries. */
export const STATUS_LABEL: Record<FileStatus, string> = {
  modified: "Edited",
  added: "New file",
  deleted: "Deleted",
  renamed: "Renamed",
  untracked: "Not tracked yet",
  conflicted: "Needs your decision",
};

export type DiffLineKind = "context" | "add" | "delete" | "meta";

export interface DiffLine {
  kind: DiffLineKind;
  /** Line number in the new file; null for removed and meta lines. */
  lineNumber: number | null;
  content: string;
}

export interface ChangedFile {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  diff: DiffLine[];
  /**
   * Whether this file is included in the next commit.
   *
   * Real Git calls this the index, or "staging". The UI never uses either word
   * — a file is simply ticked or unticked — but the concept has to exist,
   * because committing a subset of your work is one of the things developers
   * do most.
   */
  staged: boolean;
  /** Where a renamed file came from, so the UI can say "A → B". */
  originalPath?: string | null;
}

/** One `@@ … @@` block of a diff, for staging part of a file. */
export interface DiffHunk {
  /** Index within the file's diff, starting at 0. */
  index: number;
  header: string;
  /** The hunk as patch text, including its header. */
  patch: string;
  additions: number;
  deletions: number;
}

export interface Repository {
  name: string;
  /** Absolute path on disk. */
  path: string;
  branch: string;
  /** Parsed from the origin remote; null when the repo has no GitHub remote. */
  githubUrl: string | null;
  /** The repo this one was forked from, when there is an `upstream` remote. */
  upstream: UpstreamRepo | null;
  /** Branch the project treats as its trunk — usually `main` or `master`. */
  defaultBranch: string;
}

/** The original project a fork was made from. */
export interface UpstreamRepo {
  /** `owner/name`, as GitHub writes it. */
  slug: string;
  url: string;
  defaultBranch: string;
}

export interface CommitSuggestion {
  message: string;
  /** One plain-language sentence describing what changed. */
  explanation: string;
  /**
   * Further messages for the same changes, best first, none repeating
   * `message`. "Suggest another" walks this list.
   */
  alternatives?: string[];
}

export interface PushResult {
  message: string;
  fileCount: number;
  /** Link to the pushed commit, when a GitHub remote is configured. */
  commitUrl: string | null;
}

/** A commit made on this computer that has not been pushed yet. */
export interface LocalSave {
  id: string;
  message: string;
  files: ChangedFile[];
  savedAt: number;
}

export interface SaveResult {
  save: LocalSave;
  /** How many local commits are now waiting to be pushed. */
  pendingCount: number;
}

/* -------------------------------------------------------------------------- */
/* Branches                                                                    */
/* -------------------------------------------------------------------------- */

export interface Branch {
  name: string;
  isCurrent: boolean;
  /** Exists on GitHub but not on this computer. */
  isRemoteOnly: boolean;
  /** The remote branch this one follows, e.g. `origin/main`. */
  upstream: string | null;
  /** Commits here that the remote does not have. */
  ahead: number;
  /** Commits on the remote that this branch does not have. */
  behind: number;
  /** The project's trunk. Deleting or force-pushing it is guarded. */
  isDefault: boolean;
  /** GitHub branch protection — pushes have to go through a pull request. */
  isProtected: boolean;
  lastCommit: { message: string; author: string; at: number } | null;
}

/* -------------------------------------------------------------------------- */
/* History                                                                     */
/* -------------------------------------------------------------------------- */

export type CheckState = "passing" | "failing" | "running" | "none";

export interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  /** Everything after the first line of the commit message. */
  body: string;
  author: string;
  authorEmail: string;
  at: number;
  additions: number;
  deletions: number;
  fileCount: number;
  /** Tags pointing at this commit. */
  tags: string[];
  /** Still only on this computer — not pushed. */
  isLocal: boolean;
  /** More than one parent, i.e. the result of a merge. */
  isMerge: boolean;
  checks: CheckState;
  /** Parent hashes, for drawing the commit graph. */
  parents?: string[];
}

/** One line of `git blame`. */
export interface BlameLine {
  lineNumber: number;
  content: string;
  hash: string;
  shortHash: string;
  author: string;
  at: number;
  summary: string;
}

/** The result of comparing two branches or commits. */
export interface Comparison {
  base: string;
  head: string;
  /** Commits on `head` that `base` does not have. */
  ahead: number;
  /** Commits on `base` that `head` does not have. */
  behind: number;
  commits: Commit[];
  files: ChangedFile[];
}

/* -------------------------------------------------------------------------- */
/* Shelved work                                                                */
/* -------------------------------------------------------------------------- */

/** Git calls this a stash: work set aside without committing it. */
export interface Stash {
  id: string;
  message: string;
  branch: string;
  at: number;
  fileCount: number;
}

/* -------------------------------------------------------------------------- */
/* Remotes and sync                                                            */
/* -------------------------------------------------------------------------- */

export interface Remote {
  name: string;
  url: string;
  /** `origin` is your copy; `upstream` is the project you forked. */
  role: "origin" | "upstream" | "other";
}

/** Everything the Sync screen needs in one shape. */
export interface SyncState {
  /** Local commits not yet on GitHub. */
  ahead: number;
  /** Commits on GitHub not yet here. */
  behind: number;
  /** Commits in the original project this fork does not have. */
  upstreamBehind: number;
  /** Epoch ms of the last check against the remote, or null if never. */
  lastCheckedAt: number | null;
  /** True while the working tree has changes that block a merge. */
  hasBlockingChanges: boolean;
}

/* -------------------------------------------------------------------------- */
/* Conflicts                                                                   */
/* -------------------------------------------------------------------------- */

export type ConflictChoice = "mine" | "theirs" | null;

export interface Conflict {
  path: string;
  /** The version from the branch you are on. */
  mine: string[];
  /** The version arriving from the other branch. */
  theirs: string[];
  /** The common ancestor both sides started from, when Git recorded one. */
  base?: string[];
  /** Which side the user picked, or null while undecided. */
  choice: ConflictChoice;
}

/** Which multi-step operation the repository is part-way through. */
export type OperationKind = "none" | "merge" | "rebase" | "cherry-pick" | "revert";

export interface RepoOperation {
  kind: OperationKind;
  conflictedFiles: string[];
}

/* -------------------------------------------------------------------------- */
/* Tags                                                                        */
/* -------------------------------------------------------------------------- */

export interface Tag {
  name: string;
  commitHash: string;
  at: number;
  message: string;
  /** Pushed to GitHub, as opposed to existing only on this computer. */
  isPublished: boolean;
}

/* -------------------------------------------------------------------------- */
/* Identity and environment                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `user.name` and `user.email` — what gets stamped on a commit.
 *
 * Deliberately separate from the GitHub account: this decides whose name
 * appears on your work, the account decides what the network calls may do.
 */
export interface GitIdentity {
  name: string | null;
  email: string | null;
  /** True when both are set, which is what committing requires. */
  configured: boolean;
}

/** What GitEasy found on this machine at startup. */
export interface Environment {
  gitInstalled: boolean;
  gitVersion: string | null;
  ghInstalled: boolean;
  ghVersion: string | null;
  identity: GitIdentity;
  /** The signed-in GitHub account, or null. */
  account: import("./github").GitHubAccount | null;
  /** Set when the Git email is not on the signed-in GitHub account. */
  identityWarning: string | null;
}

/** A guard-rail warning raised before a commit. */
export interface CommitWarning {
  kind: "largeFile" | "secret" | "mainBranch";
  path: string | null;
  message: string;
}

/** A project GitEasy has opened before. */
export interface RecentRepository {
  path: string;
  name: string;
  lastOpenedAt: number;
  /** False once the folder has been moved or deleted. */
  exists: boolean;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

/** The categories the UI branches on — offer a retry, open sign-in, and so on. */
export type ErrorKind =
  | "notARepository"
  | "gitMissing"
  | "gitHubCliMissing"
  | "notAuthenticated"
  | "network"
  | "conflict"
  | "dirtyWorkingTree"
  | "rejected"
  | "invalidInput"
  | "unknown";

/** A structured error from the backend. */
export interface AppError {
  kind: ErrorKind;
  /** Plain English, safe to show as-is. */
  message: string;
  /** Git's own words, for a "what actually happened" line. Never secrets. */
  detail?: string;
}
