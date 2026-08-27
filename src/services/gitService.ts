import type {
  AppError,
  BlameLine,
  Branch,
  ChangedFile,
  Commit,
  CommitSuggestion,
  CommitWarning,
  Comparison,
  Conflict,
  DiffHunk,
  DiffLine,
  Environment,
  GitIdentity,
  LocalSave,
  PushResult,
  RecentRepository,
  Remote,
  RepoOperation,
  Repository,
  SaveResult,
  Stash,
  SyncState,
  Tag,
} from "@/types/git";

/**
 * Git service.
 *
 * The UI talks only to this interface. Today it is backed by fixtures; the
 * Tauri implementation in `tauriGitService.ts` implements the same shape
 * against real repositories, so swapping them is a one-line import change.
 *
 * Method names use the real Git verbs. The *labels* the user reads come from
 * `copy/terms.ts` — keeping the two apart means renaming a button never means
 * renaming a function.
 */
export interface GitService {
  /* --- Environment and identity ------------------------------------------ */

  /** Whether the Git CLI is on this machine at all. Checked before "New project". */
  isGitInstalled(): Promise<boolean>;
  /** Git, the GitHub CLI, the Git identity and the signed-in account, in one call. */
  getEnvironment(): Promise<Environment>;
  /** The name and email commits are stamped with. */
  getIdentity(repo?: Repository | null): Promise<GitIdentity>;
  /**
   * Write the Git identity. Only ever called from the setup screen, which shows
   * the user exactly what will be written — this is never done silently.
   */
  setIdentity(name: string, email: string, repo?: Repository | null): Promise<GitIdentity>;

  /* --- Opening a project ------------------------------------------------ */

  selectRepository(): Promise<Repository | null>;
  /** Open a known path directly, for the recent-projects list. */
  openRepositoryAt(path: string): Promise<Repository>;
  getRecentRepositories(): Promise<RecentRepository[]>;
  forgetRepository(path: string): Promise<void>;
  /** Clone a repository from a URL into a folder the user chooses. */
  clone(url: string): Promise<Repository | null>;
  /**
   * Turn a folder the user chooses into a brand-new Git project.
   * `withReadme` writes a starter README.md as the first file, if there is
   * nothing in the folder yet — Git has nothing to snapshot without one.
   */
  createRepository(name: string, withReadme: boolean): Promise<Repository | null>;
  /** Create the matching GitHub repository and connect it as `origin`. */
  publishRepository(
    repo: Repository,
    name: string,
    description: string,
    isPrivate: boolean,
  ): Promise<Repository>;
  /** True when the project has no commits at all yet. */
  isEmptyRepository(repo: Repository): Promise<boolean>;

  /* --- The everyday loop ------------------------------------------------ */

  getChangedFiles(repo: Repository): Promise<ChangedFile[]>;
  getFileDiff(repo: Repository, file: string): Promise<DiffLine[]>;
  /** One file's diff split into hunks, for staging part of a file. */
  getFileHunks(repo: Repository, file: string, staged?: boolean): Promise<DiffHunk[]>;

  stageFiles(repo: Repository, files: string[]): Promise<void>;
  unstageFiles(repo: Repository, files: string[]): Promise<void>;
  stageHunk(repo: Repository, file: string, hunk: number): Promise<void>;
  unstageHunk(repo: Repository, file: string, hunk: number): Promise<void>;

  /**
   * Draft a commit message from the changes. Local and deterministic unless
   * `useAi` is set and a key is configured, so the app works offline.
   */
  suggestCommitMessage(
    files: ChangedFile[],
    repo?: Repository | null,
    useAi?: boolean,
  ): Promise<CommitSuggestion>;

  /** Guard-rail checks the UI runs before committing. */
  getCommitWarnings(
    repo: Repository,
    files: ChangedFile[],
    options?: { largeFiles?: boolean; secrets?: boolean },
  ): Promise<CommitWarning[]>;

  /**
   * Commit the staged files. Local and reversible — nothing leaves the
   * machine until `push`.
   */
  commit(repo: Repository, files: ChangedFile[], message: string): Promise<SaveResult>;
  /** Replace the most recent commit instead of adding another one. */
  amendCommit(repo: Repository, message: string): Promise<SaveResult>;
  /** Whether the last commit is already public, so amending it can be warned about. */
  isHeadPushed(repo: Repository): Promise<boolean>;
  /** Permanently drop uncommitted changes to one file. */
  discardFile(repo: Repository, path: string): Promise<void>;

  /** Commits made here that have not been pushed, oldest first. */
  getPendingCommits(repo: Repository): Promise<LocalSave[]>;

  /* --- Talking to the remote -------------------------------------------- */

  /** Public and hard to undo, which is why the UI always confirms first. */
  push(repo: Repository, force?: boolean): Promise<PushResult>;
  /** Push tags, which is what turns a local tag into a GitHub release. */
  pushTags(repo: Repository): Promise<void>;
  pull(repo: Repository, strategy?: "merge" | "rebase"): Promise<Conflict[]>;
  /** Check the remote without touching any local file. */
  fetch(repo: Repository): Promise<SyncState>;
  getSyncState(repo: Repository): Promise<SyncState>;

  /** Merge the original project's latest work into this fork. */
  syncFork(repo: Repository): Promise<Conflict[]>;

  getRemotes(repo: Repository): Promise<Remote[]>;
  addRemote(repo: Repository, name: string, url: string): Promise<void>;
  setRemoteUrl(repo: Repository, name: string, url: string): Promise<void>;
  removeRemote(repo: Repository, name: string): Promise<void>;

  /* --- Branches ---------------------------------------------------------- */

  getBranches(repo: Repository): Promise<Branch[]>;
  createBranch(repo: Repository, name: string, from: string): Promise<Branch>;
  switchBranch(repo: Repository, name: string): Promise<void>;
  renameBranch(repo: Repository, from: string, to: string): Promise<void>;
  /** `force` is required to lose unmerged work; the UI counts it first. */
  deleteBranch(repo: Repository, name: string, force?: boolean): Promise<void>;
  /** How many commits deleting this branch would throw away. */
  getUnmergedCount(repo: Repository, name: string): Promise<number>;
  mergeBranch(repo: Repository, from: string): Promise<Conflict[]>;
  rebaseBranch(repo: Repository, onto: string): Promise<Conflict[]>;
  /** Compare two branches or commits. */
  compare(repo: Repository, base: string, head: string): Promise<Comparison>;

  /* --- History ----------------------------------------------------------- */

  getHistory(repo: Repository, branch: string): Promise<Commit[]>;
  getCommitFiles(repo: Repository, hash: string): Promise<ChangedFile[]>;
  getCommitDetail(repo: Repository, hash: string): Promise<Commit>;
  /** Every commit that touched one file, following it across renames. */
  getFileHistory(repo: Repository, file: string): Promise<Commit[]>;
  /** Who last changed each line of a file. */
  getBlame(repo: Repository, file: string, rev?: string): Promise<BlameLine[]>;
  /** Undo a commit by adding one that reverses it. Safe after pushing. */
  revertCommit(repo: Repository, hash: string): Promise<Conflict[]>;
  /** Apply a single commit from another branch onto this one. */
  cherryPick(repo: Repository, hash: string): Promise<Conflict[]>;
  /** Move the branch to another commit. "hard" throws away uncommitted work. */
  resetTo(repo: Repository, hash: string, mode: "soft" | "mixed" | "hard"): Promise<void>;

  /* --- Shelved work (stash) ---------------------------------------------- */

  getStashes(repo: Repository): Promise<Stash[]>;
  shelve(repo: Repository, message: string): Promise<Stash>;
  /** Put it back and take it off the shelf. Returns conflicts if any arise. */
  unshelve(repo: Repository, id: string): Promise<Conflict[]>;
  /** Put it back but leave it on the shelf. */
  applyShelf(repo: Repository, id: string): Promise<Conflict[]>;
  dropShelf(repo: Repository, id: string): Promise<void>;
  getShelfDiff(repo: Repository, id: string): Promise<DiffLine[]>;

  /* --- Conflicts ---------------------------------------------------------- */

  getConflicts(repo: Repository): Promise<Conflict[]>;
  /** Which merge/rebase/cherry-pick, if any, is part-way through. */
  getOperation(repo: Repository): Promise<RepoOperation>;
  resolveConflict(repo: Repository, path: string, keep: "mine" | "theirs"): Promise<void>;
  /** The file as it stands, for editing a resolution by hand. */
  getConflictContents(repo: Repository, path: string): Promise<string>;
  resolveConflictManually(repo: Repository, path: string, contents: string): Promise<void>;
  /** Mark a file the user fixed in their own editor as resolved. */
  markResolved(repo: Repository, path: string): Promise<void>;
  /** Finish the merge or rebase that stopped on conflicts. */
  continueOperation(repo: Repository): Promise<void>;
  /** Abandon it and put the branch back as it was. */
  abortOperation(repo: Repository): Promise<void>;

  /* --- Tags --------------------------------------------------------------- */

  getTags(repo: Repository): Promise<Tag[]>;
  createTag(repo: Repository, name: string, message: string): Promise<Tag>;
  deleteTag(repo: Repository, name: string): Promise<void>;

  /* --- AI (always optional) ------------------------------------------------ */

  /** Whether AI explanations are configured. Everything works without them. */
  isAiAvailable(): Promise<boolean>;
  explainChanges(repo: Repository, files: ChangedFile[]): Promise<string>;
  explainError(error: AppError): Promise<string>;
  explainConflict(repo: Repository, path: string): Promise<string>;

  /* --- Settings ------------------------------------------------------------- */

  getSettings(): Promise<Record<string, string>>;
  setSetting(key: string, value: string): Promise<void>;

  /* --- Misc ---------------------------------------------------------------- */

  openInBrowser(url: string): Promise<void>;
  /** Reveal the project folder in Explorer / Finder. */
  openFolder(repo: Repository): Promise<void>;
}

/* ========================================================================== */
/* Fixtures                                                                    */
/* ========================================================================== */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();

const MOCK_REPO: Repository = {
  name: "aurora-web",
  path: "C:\\Users\\you\\Developer\\aurora-web",
  branch: "feature/new-auth",
  githubUrl: "https://github.com/you/aurora-web",
  defaultBranch: "main",
  upstream: {
    slug: "aurora-labs/aurora-web",
    url: "https://github.com/aurora-labs/aurora-web",
    defaultBranch: "main",
  },
};

const MOCK_FILES: ChangedFile[] = [
  {
    path: "src/login.js",
    status: "modified",
    additions: 12,
    deletions: 4,
    staged: true,
    diff: [
      { kind: "meta", lineNumber: null, content: "@@ -1,6 +1,8 @@" },
      { kind: "context", lineNumber: 1, content: "import { api } from './api'" },
      { kind: "add", lineNumber: 2, content: "import { signIn } from './auth'" },
      { kind: "context", lineNumber: 3, content: "" },
      { kind: "context", lineNumber: 4, content: "export async function login(email, password) {" },
      { kind: "delete", lineNumber: null, content: '  const res = await api.post("/login", { email, password })' },
      { kind: "delete", lineNumber: null, content: '  localStorage.setItem("token", res.token)' },
      { kind: "add", lineNumber: 5, content: "  const session = await signIn(email, password)" },
      { kind: "add", lineNumber: 6, content: "  return session.user" },
      { kind: "context", lineNumber: 7, content: "}" },
    ],
  },
  {
    path: "src/dashboard.jsx",
    status: "modified",
    additions: 7,
    deletions: 3,
    staged: true,
    diff: [
      { kind: "meta", lineNumber: null, content: "@@ -14,7 +14,9 @@" },
      { kind: "context", lineNumber: 14, content: "export function Dashboard() {" },
      { kind: "delete", lineNumber: null, content: '  const token = localStorage.getItem("token")' },
      { kind: "add", lineNumber: 15, content: "  const { user, loading } = useSession()" },
      { kind: "context", lineNumber: 16, content: "" },
      { kind: "add", lineNumber: 17, content: "  if (loading) return <Spinner />" },
      { kind: "context", lineNumber: 18, content: "  return <Layout user={user} />" },
      { kind: "context", lineNumber: 19, content: "}" },
    ],
  },
  {
    path: "src/auth.js",
    status: "added",
    additions: 34,
    deletions: 0,
    staged: true,
    diff: [
      { kind: "meta", lineNumber: null, content: "@@ -0,0 +1,34 @@" },
      { kind: "add", lineNumber: 1, content: "import { api } from './api'" },
      { kind: "add", lineNumber: 2, content: "" },
      { kind: "add", lineNumber: 3, content: "export async function signIn(email, password) {" },
      { kind: "add", lineNumber: 4, content: '  const res = await api.post("/login", { email, password })' },
      { kind: "add", lineNumber: 5, content: "  saveSession(res.token)" },
      { kind: "add", lineNumber: 6, content: "  return res" },
      { kind: "add", lineNumber: 7, content: "}" },
    ],
  },
  {
    path: "notes/todo.txt",
    status: "untracked",
    additions: 3,
    deletions: 0,
    staged: false,
    diff: [
      { kind: "meta", lineNumber: null, content: "@@ -0,0 +1,3 @@" },
      { kind: "add", lineNumber: 1, content: "- ask design about the empty state" },
      { kind: "add", lineNumber: 2, content: "- check token expiry copy" },
      { kind: "add", lineNumber: 3, content: "- ship friday?" },
    ],
  },
  {
    path: "src/legacy/session.js",
    status: "deleted",
    additions: 0,
    deletions: 41,
    staged: false,
    diff: [
      { kind: "meta", lineNumber: null, content: "@@ -1,41 +0,0 @@" },
      { kind: "delete", lineNumber: null, content: "// superseded by src/auth.js" },
      { kind: "delete", lineNumber: null, content: "export function readToken() {" },
      { kind: "delete", lineNumber: null, content: '  return localStorage.getItem("token")' },
      { kind: "delete", lineNumber: null, content: "}" },
    ],
  },
];

const MOCK_BRANCHES: Branch[] = [
  {
    name: "feature/new-auth",
    isCurrent: true,
    isRemoteOnly: false,
    upstream: "origin/feature/new-auth",
    ahead: 2,
    behind: 0,
    isDefault: false,
    isProtected: false,
    lastCommit: { message: "feat: add shared auth helper", author: "You", at: now - 2 * HOUR },
  },
  {
    name: "main",
    isCurrent: false,
    isRemoteOnly: false,
    upstream: "origin/main",
    ahead: 0,
    behind: 6,
    isDefault: true,
    isProtected: true,
    lastCommit: { message: "chore: bump dependencies", author: "Priya", at: now - 5 * HOUR },
  },
  {
    name: "fix/checkout-total",
    isCurrent: false,
    isRemoteOnly: false,
    upstream: null,
    ahead: 1,
    behind: 3,
    isDefault: false,
    isProtected: false,
    lastCommit: { message: "fix: correct total on checkout", author: "You", at: now - 2 * DAY },
  },
  {
    name: "design/settings-refresh",
    isCurrent: false,
    isRemoteOnly: true,
    upstream: "origin/design/settings-refresh",
    ahead: 0,
    behind: 0,
    isDefault: false,
    isProtected: false,
    lastCommit: { message: "wip: new settings layout", author: "Marco", at: now - 9 * HOUR },
  },
  {
    name: "release/2.4",
    isCurrent: false,
    isRemoteOnly: true,
    upstream: "origin/release/2.4",
    ahead: 0,
    behind: 0,
    isDefault: false,
    isProtected: true,
    lastCommit: { message: "chore: cut 2.4.0", author: "Priya", at: now - 6 * DAY },
  },
];

const MOCK_HISTORY: Commit[] = [
  {
    hash: "8f2a1c94b3e7d5a6f8c9012345678901abcdef12",
    shortHash: "8f2a1c9",
    message: "feat: add shared auth helper",
    body: "Login and dashboard both needed session handling, so it now lives in one place.",
    author: "You",
    authorEmail: "you@example.com",
    at: now - 2 * HOUR,
    additions: 53,
    deletions: 7,
    fileCount: 3,
    tags: [],
    isLocal: true,
    isMerge: false,
    checks: "none",
  },
  {
    hash: "3d9e77a1c2b4e6f8091234567890abcdef123456",
    shortHash: "3d9e77a",
    message: "refactor: move session storage out of the pages",
    body: "",
    author: "You",
    authorEmail: "you@example.com",
    at: now - 4 * HOUR,
    additions: 18,
    deletions: 22,
    fileCount: 4,
    tags: [],
    isLocal: true,
    isMerge: false,
    checks: "none",
  },
  {
    hash: "c1b4f30d8e2a5c7091234567890abcdef1234567",
    shortHash: "c1b4f30",
    message: "Merge pull request #142 from aurora-labs/design/tokens",
    body: "Design tokens for the new settings surface.",
    author: "Priya",
    authorEmail: "priya@example.com",
    at: now - 5 * HOUR,
    additions: 210,
    deletions: 96,
    fileCount: 14,
    tags: [],
    isLocal: false,
    isMerge: true,
    checks: "passing",
  },
  {
    hash: "77aa0219e4c6b8d091234567890abcdef1234567",
    shortHash: "77aa021",
    message: "chore: bump dependencies",
    body: "",
    author: "Priya",
    authorEmail: "priya@example.com",
    at: now - DAY,
    additions: 640,
    deletions: 612,
    fileCount: 2,
    tags: [],
    isLocal: false,
    isMerge: false,
    checks: "passing",
  },
  {
    hash: "5e6d8c0b1a293847561234567890abcdef123456",
    shortHash: "5e6d8c0",
    message: "fix: correct total on the checkout page",
    body: "Tax was applied before the discount instead of after.",
    author: "Marco",
    authorEmail: "marco@example.com",
    at: now - 2 * DAY,
    additions: 6,
    deletions: 4,
    fileCount: 1,
    tags: [],
    isLocal: false,
    isMerge: false,
    checks: "failing",
  },
  {
    hash: "a0f1e2d3c4b5a69788123456789abcdef1234567",
    shortHash: "a0f1e2d",
    message: "chore: cut 2.4.0",
    body: "",
    author: "Priya",
    authorEmail: "priya@example.com",
    at: now - 6 * DAY,
    additions: 3,
    deletions: 3,
    fileCount: 1,
    tags: ["v2.4.0"],
    isLocal: false,
    isMerge: false,
    checks: "passing",
  },
  {
    hash: "b9c8d7e6f5a4b3c2d1123456789abcdef1234567",
    shortHash: "b9c8d7e",
    message: "feat: add profile settings page",
    body: "",
    author: "You",
    authorEmail: "you@example.com",
    at: now - 9 * DAY,
    additions: 288,
    deletions: 12,
    fileCount: 6,
    tags: [],
    isLocal: false,
    isMerge: false,
    checks: "passing",
  },
];

const MOCK_STASHES: Stash[] = [
  {
    id: "stash@{0}",
    message: "Half-finished password reset form",
    branch: "feature/new-auth",
    at: now - 6 * HOUR,
    fileCount: 2,
  },
  {
    id: "stash@{1}",
    message: "Experiment: dark mode for the emails",
    branch: "main",
    at: now - 4 * DAY,
    fileCount: 5,
  },
];

const MOCK_REMOTES: Remote[] = [
  { name: "origin", url: "https://github.com/you/aurora-web.git", role: "origin" },
  {
    name: "upstream",
    url: "https://github.com/aurora-labs/aurora-web.git",
    role: "upstream",
  },
];

const MOCK_TAGS: Tag[] = [
  {
    name: "v2.4.0",
    commitHash: "a0f1e2d",
    at: now - 6 * DAY,
    message: "Settings refresh and faster startup",
    isPublished: true,
  },
  {
    name: "v2.3.1",
    commitHash: "4c5b6a7",
    at: now - 21 * DAY,
    message: "Checkout total hotfix",
    isPublished: true,
  },
  {
    name: "v2.5.0-rc1",
    commitHash: "8f2a1c9",
    at: now - HOUR,
    message: "Release candidate for the new auth flow",
    isPublished: false,
  },
];

const MOCK_CONFLICTS: Conflict[] = [
  {
    path: "src/config.js",
    mine: ["export const SESSION_MINUTES = 30", "export const RETRY_LIMIT = 3"],
    theirs: ["export const SESSION_MINUTES = 120", "export const RETRY_LIMIT = 5"],
    choice: null,
  },
];

const MOCK_SUGGESTIONS: CommitSuggestion[] = [
  {
    message: "feat: improve authentication and dashboard",
    explanation: "Login and dashboard were updated to use a new shared auth helper.",
  },
  {
    message: "feat: add shared auth helper for sign-in",
    explanation: "Sign-in logic moved into one file so login and dashboard reuse it.",
  },
  {
    message: "refactor: move session handling into auth module",
    explanation: "Session storage now lives in auth.js instead of each page handling it.",
  },
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let suggestionIndex = 0;

/** Commits made locally and not yet pushed. */
const pendingCommits: LocalSave[] = [];

/** Mutable copies so the fixture app behaves like a real one within a session. */
let branches = MOCK_BRANCHES.map((b) => ({ ...b }));
let stashes = MOCK_STASHES.map((s) => ({ ...s }));
let remotes = MOCK_REMOTES.map((r) => ({ ...r }));
let tags = MOCK_TAGS.map((t) => ({ ...t }));
let conflicts: Conflict[] = [];

let syncState: SyncState = {
  ahead: 2,
  behind: 6,
  upstreamBehind: 14,
  lastCheckedAt: now - 18 * 60_000,
  hasBlockingChanges: false,
};

let identity: GitIdentity = {
  name: "You",
  email: "you@example.com",
  configured: true,
};

/** The GitHub account the fixture environment reports as signed in. */
const account = { login: "you", name: "You", avatarUrl: null };

let settings: Record<string, string> = {};

/**
 * Fixture-backed implementation, for running the UI in a browser.
 *
 * `npm run dev` uses this so every screen works with no Rust, no Git and no
 * network. The real implementation is `tauriGitService.ts`; both satisfy the
 * same interface, so swapping them is the one-line import change in `App.tsx`.
 */
export const gitService: GitService = {
  async isGitInstalled() {
    await delay(150);
    return true;
  },

  async getEnvironment() {
    await delay(150);
    return {
      gitInstalled: true,
      gitVersion: "2.55.0",
      ghInstalled: true,
      ghVersion: "2.96.0",
      identity: { name: "You", email: "you@example.com", configured: true },
      account: account ? { ...account } : null,
      identityWarning: null,
    };
  },

  async getIdentity() {
    await delay(80);
    return { ...identity };
  },

  async setIdentity(name, email) {
    await delay(200);
    identity = { name, email, configured: name.length > 0 && email.length > 0 };
    return { ...identity };
  },

  async selectRepository() {
    await delay(280);
    return { ...MOCK_REPO };
  },

  async openRepositoryAt(path) {
    await delay(200);
    return { ...MOCK_REPO, path };
  },

  async getRecentRepositories() {
    await delay(100);
    return [
      {
        path: MOCK_REPO.path,
        name: MOCK_REPO.name,
        lastOpenedAt: now - HOUR,
        exists: true,
      },
    ];
  },

  async forgetRepository() {
    await delay(80);
  },

  async createRepository(name, _withReadme) {
    await delay(280);
    return {
      ...MOCK_REPO,
      name,
      path: `C:\\Users\\you\\Developer\\${name}`,
      branch: "main",
      githubUrl: null,
      upstream: null,
    };
  },

  async clone(url) {
    await delay(1100);
    const slug = url.replace(/\.git$/, "").split("/").slice(-2).join("/");
    const name = slug.split("/").at(-1) ?? "project";
    return {
      ...MOCK_REPO,
      name,
      path: `C:\\Users\\you\\Developer\\${name}`,
      branch: "main",
      githubUrl: `https://github.com/${slug}`,
      upstream: null,
    };
  },

  async publishRepository(repo, name) {
    await delay(900);
    return {
      ...repo,
      name,
      githubUrl: `https://github.com/you/${name}`,
    };
  },

  async isEmptyRepository() {
    await delay(60);
    return false;
  },

  async getChangedFiles() {
    await delay(180);
    return MOCK_FILES.map((file) => ({ ...file }));
  },

  async getFileDiff(_repo, file) {
    await delay(120);
    return MOCK_FILES.find((f) => f.path === file)?.diff.map((d) => ({ ...d })) ?? [];
  },

  async getFileHunks(_repo, file) {
    await delay(120);
    const diff = MOCK_FILES.find((f) => f.path === file)?.diff ?? [];
    const header = diff.find((line) => line.kind === "meta");

    if (!header) return [];

    return [
      {
        index: 0,
        header: header.content,
        patch: diff
          .map((line) =>
            line.kind === "add"
              ? `+${line.content}`
              : line.kind === "delete"
                ? `-${line.content}`
                : line.kind === "meta"
                  ? line.content
                  : ` ${line.content}`,
          )
          .join("\n"),
        additions: diff.filter((l) => l.kind === "add").length,
        deletions: diff.filter((l) => l.kind === "delete").length,
      },
    ];
  },

  async stageFiles() {
    await delay(120);
  },

  async unstageFiles() {
    await delay(120);
  },

  async stageHunk() {
    await delay(150);
  },

  async unstageHunk() {
    await delay(150);
  },

  async suggestCommitMessage(files) {
    await delay(560);
    if (files.length === 0) return { message: "", explanation: "" };
    const suggestion = MOCK_SUGGESTIONS[suggestionIndex % MOCK_SUGGESTIONS.length]!;
    suggestionIndex += 1;
    return suggestion;
  },

  async getCommitWarnings() {
    await delay(120);
    return [];
  },

  async commit(_repo, files, message) {
    await delay(450);
    const save: LocalSave = {
      id: `save-${Date.now()}`,
      message,
      files: files.map((f) => ({ ...f })),
      savedAt: Date.now(),
    };
    pendingCommits.push(save);
    syncState = { ...syncState, ahead: syncState.ahead + 1 };
    return { save, pendingCount: pendingCommits.length };
  },

  async amendCommit(_repo, message) {
    await delay(400);
    const last = pendingCommits.at(-1);
    if (last) {
      last.message = message;
      return { save: last, pendingCount: pendingCommits.length };
    }
    const save: LocalSave = { id: `save-${Date.now()}`, message, files: [], savedAt: Date.now() };
    pendingCommits.push(save);
    return { save, pendingCount: pendingCommits.length };
  },

  async isHeadPushed() {
    await delay(80);
    return false;
  },

  async discardFile() {
    await delay(220);
  },

  async getPendingCommits() {
    await delay(80);
    return pendingCommits.map((s) => ({ ...s }));
  },

  async push(repo) {
    await delay(800);
    const fileCount = pendingCommits.reduce((total, save) => total + save.files.length, 0);
    const message = pendingCommits.at(-1)?.message ?? "";
    pendingCommits.length = 0;
    syncState = { ...syncState, ahead: 0, lastCheckedAt: Date.now() };

    return {
      message,
      fileCount,
      commitUrl: repo.githubUrl ? `${repo.githubUrl}/commits/${repo.branch}` : null,
    };
  },

  async pull() {
    await delay(900);
    syncState = { ...syncState, behind: 0, lastCheckedAt: Date.now() };
    return [];
  },

  async fetch() {
    await delay(700);
    syncState = { ...syncState, lastCheckedAt: Date.now() };
    return { ...syncState };
  },

  async getSyncState() {
    await delay(120);
    return { ...syncState };
  },

  async syncFork() {
    await delay(1200);
    // The fixture repo has a conflicting config file, so this demonstrates the
    // conflict flow rather than pretending merges always succeed.
    conflicts = MOCK_CONFLICTS.map((c) => ({ ...c }));
    syncState = { ...syncState, upstreamBehind: 0, lastCheckedAt: Date.now() };
    return conflicts.map((c) => ({ ...c }));
  },

  async getRemotes() {
    await delay(100);
    return remotes.map((r) => ({ ...r }));
  },

  async addRemote(_repo, name, url) {
    await delay(300);
    remotes = [
      ...remotes,
      { name, url, role: name === "upstream" ? "upstream" : name === "origin" ? "origin" : "other" },
    ];
  },

  async pushTags() {
    await delay(500);
  },

  async setRemoteUrl(_repo, name, url) {
    await delay(240);
    remotes = remotes.map((r) => (r.name === name ? { ...r, url } : r));
  },

  async removeRemote(_repo, name) {
    await delay(240);
    remotes = remotes.filter((r) => r.name !== name);
  },

  async getBranches() {
    await delay(160);
    return branches.map((b) => ({ ...b }));
  },

  async createBranch(_repo, name) {
    await delay(380);
    const created: Branch = {
      name,
      isCurrent: true,
      isRemoteOnly: false,
      upstream: null,
      ahead: 0,
      behind: 0,
      isDefault: false,
      isProtected: false,
      lastCommit: null,
    };
    branches = [created, ...branches.map((b) => ({ ...b, isCurrent: false }))];
    return created;
  },

  async switchBranch(_repo, name) {
    await delay(420);
    branches = branches.map((b) => ({
      ...b,
      isCurrent: b.name === name,
      isRemoteOnly: b.name === name ? false : b.isRemoteOnly,
    }));
  },

  async renameBranch(_repo, from, to) {
    await delay(300);
    branches = branches.map((b) => (b.name === from ? { ...b, name: to } : b));
  },

  async deleteBranch(_repo, name) {
    await delay(300);
    branches = branches.filter((b) => b.name !== name);
  },

  async getUnmergedCount() {
    await delay(120);
    return 2;
  },

  async mergeBranch() {
    await delay(950);
    return [];
  },

  async rebaseBranch() {
    await delay(950);
    return [];
  },

  async compare(_repo, base, head) {
    await delay(400);
    return {
      base,
      head,
      ahead: 2,
      behind: 6,
      commits: MOCK_HISTORY.slice(0, 2).map((c) => ({ ...c })),
      files: MOCK_FILES.slice(0, 3).map((f) => ({ ...f })),
    };
  },

  async getHistory() {
    await delay(240);
    return MOCK_HISTORY.map((c) => ({ ...c }));
  },

  async getCommitFiles() {
    await delay(200);
    return MOCK_FILES.slice(0, 3).map((f) => ({ ...f }));
  },

  async getCommitDetail(_repo, hash) {
    await delay(180);
    const found = MOCK_HISTORY.find((c) => c.hash === hash || c.shortHash === hash);
    return { ...(found ?? MOCK_HISTORY[0]!) };
  },

  async getFileHistory() {
    await delay(240);
    return MOCK_HISTORY.slice(0, 3).map((c) => ({ ...c }));
  },

  async getBlame(_repo, file) {
    await delay(300);
    const lines = MOCK_FILES.find((f) => f.path === file)?.diff ?? [];
    return lines
      .filter((line) => line.kind !== "meta" && line.kind !== "delete")
      .map((line, index) => ({
        lineNumber: index + 1,
        content: line.content,
        hash: MOCK_HISTORY[0]!.hash,
        shortHash: MOCK_HISTORY[0]!.shortHash,
        author: MOCK_HISTORY[0]!.author,
        at: MOCK_HISTORY[0]!.at,
        summary: MOCK_HISTORY[0]!.message,
      }));
  },

  async revertCommit() {
    await delay(600);
    return [];
  },

  async cherryPick() {
    await delay(650);
    return [];
  },

  async resetTo() {
    await delay(400);
  },

  async getStashes() {
    await delay(120);
    return stashes.map((s) => ({ ...s }));
  },

  async shelve(_repo, message) {
    await delay(420);
    const stash: Stash = {
      id: `stash@{${stashes.length}}`,
      message,
      branch: MOCK_REPO.branch,
      at: Date.now(),
      fileCount: MOCK_FILES.length,
    };
    stashes = [stash, ...stashes];
    return stash;
  },

  async unshelve(_repo, id) {
    await delay(400);
    stashes = stashes.filter((s) => s.id !== id);
    return [];
  },

  async applyShelf() {
    await delay(400);
    return [];
  },

  async dropShelf(_repo, id) {
    await delay(260);
    stashes = stashes.filter((s) => s.id !== id);
  },

  async getShelfDiff() {
    await delay(200);
    return MOCK_FILES[0]!.diff.map((line) => ({ ...line }));
  },

  async getConflicts() {
    await delay(120);
    return conflicts.map((c) => ({ ...c }));
  },

  async getOperation() {
    await delay(80);
    return {
      kind: conflicts.length > 0 ? ("merge" as const) : ("none" as const),
      conflictedFiles: conflicts.map((c) => c.path),
    };
  },

  async resolveConflict(_repo, path, keep) {
    await delay(220);
    conflicts = conflicts.map((c) => (c.path === path ? { ...c, choice: keep } : c));
  },

  async getConflictContents(_repo, path) {
    await delay(150);
    const found = conflicts.find((c) => c.path === path);
    if (!found) return "";
    return [
      "<<<<<<< HEAD",
      ...found.mine,
      "=======",
      ...found.theirs,
      ">>>>>>> incoming",
    ].join("\n");
  },

  async resolveConflictManually(_repo, path) {
    await delay(220);
    conflicts = conflicts.filter((c) => c.path !== path);
  },

  async markResolved(_repo, path) {
    await delay(180);
    conflicts = conflicts.filter((c) => c.path !== path);
  },

  async continueOperation() {
    await delay(500);
    conflicts = [];
  },

  async abortOperation() {
    await delay(400);
    conflicts = [];
  },

  async getTags() {
    await delay(140);
    return tags.map((t) => ({ ...t }));
  },

  async createTag(_repo, name, message) {
    await delay(360);
    const tag: Tag = {
      name,
      commitHash: MOCK_HISTORY[0]!.shortHash,
      at: Date.now(),
      message,
      isPublished: false,
    };
    tags = [tag, ...tags];
    return tag;
  },

  async deleteTag(_repo, name) {
    await delay(240);
    tags = tags.filter((t) => t.name !== name);
  },

  // The fixture has no key and no network, which is exactly the state the app
  // is designed to stay fully usable in.
  async isAiAvailable() {
    await delay(60);
    return false;
  },

  async explainChanges() {
    await delay(400);
    return "Login and dashboard were changed to use a new shared authentication helper, so the sign-in logic lives in one place instead of being repeated.";
  },

  async explainError(error) {
    await delay(400);
    return `${error.message} This usually means the project on GitHub has moved on since you last checked — bringing their work down first normally clears it.`;
  },

  async explainConflict() {
    await delay(500);
    return "Your version keeps the shorter session timeout and the lower retry limit; theirs raises both. Pick whichever matches what the team agreed — the values are independent, so you may want one from each.";
  },

  async getSettings() {
    await delay(80);
    return { ...settings };
  },

  async setSetting(key, value) {
    await delay(60);
    settings = { ...settings, [key]: value };
  },

  async openInBrowser(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  },

  async openFolder() {
    await delay(120);
  },
};

/** Reset between runs so the demo always opens in the same state. */
export function resetFixtures() {
  suggestionIndex = 0;
  pendingCommits.length = 0;
  branches = MOCK_BRANCHES.map((b) => ({ ...b }));
  stashes = MOCK_STASHES.map((s) => ({ ...s }));
  remotes = MOCK_REMOTES.map((r) => ({ ...r }));
  tags = MOCK_TAGS.map((t) => ({ ...t }));
  conflicts = [];
}
