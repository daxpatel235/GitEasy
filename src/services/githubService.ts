import type {
  GitHubAccount,
  Issue,
  PullRequest,
  Release,
  RemoteRepo,
  WorkflowRun,
} from "@/types/github";

/**
 * Everything that needs github.com rather than the folder on disk.
 *
 * Split from `GitService` on purpose: these calls need the network and an
 * account, they can fail in ways local Git cannot, and a user with no GitHub
 * remote should still get a complete app. Every view that consumes this
 * service therefore has to handle "not signed in" as a first-class state.
 */
export interface GitHubService {
  /**
   * Who is signed in, or null. Never throws: "nobody is signed in" is a normal
   * state that every GitHub screen is built to render.
   */
  getAccount(): Promise<GitHubAccount | null>;
  /**
   * Open the official GitHub browser sign-in.
   *
   * GitEasy never asks for a password. The browser flow hands a token to the
   * GitHub CLI, which stores it in the operating system's keychain.
   */
  signIn(): Promise<GitHubAccount | null>;
  signOut(): Promise<void>;

  getPullRequests(repoUrl: string): Promise<PullRequest[]>;
  createPullRequest(input: {
    repoUrl: string;
    head: string;
    base: string;
    title: string;
    body: string;
    draft: boolean;
  }): Promise<PullRequest>;
  mergePullRequest(
    repoUrl: string,
    number: number,
    strategy?: "merge" | "squash" | "rebase",
  ): Promise<void>;
  closePullRequest(repoUrl: string, number: number): Promise<void>;

  getIssues(repoUrl: string): Promise<Issue[]>;
  createIssue(repoUrl: string, title: string, body: string): Promise<Issue>;
  closeIssue(repoUrl: string, number: number): Promise<void>;

  getWorkflowRuns(repoUrl: string): Promise<WorkflowRun[]>;
  rerunWorkflow(repoUrl: string, id: string): Promise<void>;

  getReleases(repoUrl: string): Promise<Release[]>;
  /** Publish a release from a tag that already exists. */
  createRelease(
    repoUrl: string,
    input: {
      tag: string;
      title: string;
      notes: string;
      prerelease: boolean;
      draft: boolean;
    },
  ): Promise<Release>;

  /** Repositories the signed-in user can clone, for the open-from-GitHub flow. */
  getMyRepos(): Promise<RemoteRepo[]>;

  /** Create a new, empty repository on GitHub under the signed-in account. */
  createRepo(input: { name: string; description: string; private: boolean }): Promise<RemoteRepo>;
}

/* ========================================================================== */
/* Fixtures                                                                    */
/* ========================================================================== */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ACCOUNT: GitHubAccount = {
  login: "you",
  name: "You",
  avatarUrl: null,
};

const LABELS = {
  bug: { name: "bug", color: "d73a4a" },
  feature: { name: "enhancement", color: "a2eeef" },
  docs: { name: "documentation", color: "0075ca" },
  goodFirst: { name: "good first issue", color: "7057ff" },
  blocked: { name: "blocked", color: "b60205" },
  design: { name: "design", color: "f9d0c4" },
};

const PULL_REQUESTS: PullRequest[] = [
  {
    number: 148,
    title: "Move session handling into a shared auth module",
    author: "you",
    state: "open",
    head: "feature/new-auth",
    base: "main",
    createdAt: now - 3 * HOUR,
    updatedAt: now - 40 * 60_000,
    commentCount: 4,
    review: "changes-requested",
    checks: "failing",
    additions: 312,
    deletions: 96,
    changedFiles: 9,
    labels: [LABELS.feature],
    url: "https://github.com/aurora-labs/aurora-web/pull/148",
    isMine: true,
    reviewRequested: false,
    mergeable: false,
  },
  {
    number: 147,
    title: "Settings surface: new design tokens",
    author: "marco",
    state: "open",
    head: "design/settings-refresh",
    base: "main",
    createdAt: now - 11 * HOUR,
    updatedAt: now - 2 * HOUR,
    commentCount: 12,
    review: "pending",
    checks: "passing",
    additions: 780,
    deletions: 240,
    changedFiles: 23,
    labels: [LABELS.design, LABELS.feature],
    url: "https://github.com/aurora-labs/aurora-web/pull/147",
    isMine: false,
    reviewRequested: true,
    mergeable: true,
  },
  {
    number: 146,
    title: "Fix tax being applied before the discount",
    author: "priya",
    state: "open",
    head: "fix/checkout-total",
    base: "main",
    createdAt: now - DAY,
    updatedAt: now - 5 * HOUR,
    commentCount: 2,
    review: "approved",
    checks: "passing",
    additions: 6,
    deletions: 4,
    changedFiles: 1,
    labels: [LABELS.bug],
    url: "https://github.com/aurora-labs/aurora-web/pull/146",
    isMine: false,
    reviewRequested: false,
    mergeable: true,
  },
  {
    number: 145,
    title: "WIP: streaming responses on the report page",
    author: "you",
    state: "draft",
    head: "feature/streaming-reports",
    base: "main",
    createdAt: now - 2 * DAY,
    updatedAt: now - DAY,
    commentCount: 0,
    review: "none",
    checks: "running",
    additions: 145,
    deletions: 20,
    changedFiles: 5,
    labels: [],
    url: "https://github.com/aurora-labs/aurora-web/pull/145",
    isMine: true,
    reviewRequested: false,
    mergeable: false,
  },
  {
    number: 142,
    title: "Design tokens for the new settings surface",
    author: "priya",
    state: "merged",
    head: "design/tokens",
    base: "main",
    createdAt: now - 4 * DAY,
    updatedAt: now - 5 * HOUR,
    commentCount: 8,
    review: "approved",
    checks: "passing",
    additions: 210,
    deletions: 96,
    changedFiles: 14,
    labels: [LABELS.design],
    url: "https://github.com/aurora-labs/aurora-web/pull/142",
    isMine: false,
    reviewRequested: false,
    mergeable: false,
  },
  {
    number: 139,
    title: "Add retry logic to the upload queue",
    author: "sam",
    state: "closed",
    head: "feature/upload-retry",
    base: "main",
    createdAt: now - 12 * DAY,
    updatedAt: now - 8 * DAY,
    commentCount: 6,
    review: "changes-requested",
    checks: "failing",
    additions: 88,
    deletions: 14,
    changedFiles: 3,
    labels: [LABELS.blocked],
    url: "https://github.com/aurora-labs/aurora-web/pull/139",
    isMine: false,
    reviewRequested: false,
    mergeable: false,
  },
];

const ISSUES: Issue[] = [
  {
    number: 151,
    title: "Session expires while the user is still typing",
    author: "priya",
    state: "open",
    createdAt: now - 4 * HOUR,
    commentCount: 5,
    labels: [LABELS.bug],
    url: "https://github.com/aurora-labs/aurora-web/issues/151",
    assignedToMe: true,
  },
  {
    number: 150,
    title: "Add keyboard shortcuts to the settings dialog",
    author: "marco",
    state: "open",
    createdAt: now - DAY,
    commentCount: 1,
    labels: [LABELS.feature, LABELS.goodFirst],
    url: "https://github.com/aurora-labs/aurora-web/issues/150",
    assignedToMe: false,
  },
  {
    number: 149,
    title: "Document the environment variables in the README",
    author: "sam",
    state: "open",
    createdAt: now - 3 * DAY,
    commentCount: 0,
    labels: [LABELS.docs, LABELS.goodFirst],
    url: "https://github.com/aurora-labs/aurora-web/issues/149",
    assignedToMe: false,
  },
  {
    number: 144,
    title: "Checkout total is wrong when a coupon is applied",
    author: "you",
    state: "closed",
    createdAt: now - 6 * DAY,
    commentCount: 9,
    labels: [LABELS.bug],
    url: "https://github.com/aurora-labs/aurora-web/issues/144",
    assignedToMe: true,
  },
];

const RUNS: WorkflowRun[] = [
  {
    id: "run-9051",
    name: "Tests",
    status: "failure",
    branch: "feature/new-auth",
    commitMessage: "feat: add shared auth helper",
    shortHash: "8f2a1c9",
    actor: "you",
    startedAt: now - 35 * 60_000,
    durationMs: 4 * 60_000 + 12_000,
    url: "https://github.com/aurora-labs/aurora-web/actions/runs/9051",
  },
  {
    id: "run-9050",
    name: "Lint",
    status: "success",
    branch: "feature/new-auth",
    commitMessage: "feat: add shared auth helper",
    shortHash: "8f2a1c9",
    actor: "you",
    startedAt: now - 35 * 60_000,
    durationMs: 48_000,
    url: "https://github.com/aurora-labs/aurora-web/actions/runs/9050",
  },
  {
    id: "run-9049",
    name: "Build",
    status: "running",
    branch: "design/settings-refresh",
    commitMessage: "wip: new settings layout",
    shortHash: "d4e5f60",
    actor: "marco",
    startedAt: now - 6 * 60_000,
    durationMs: null,
    url: "https://github.com/aurora-labs/aurora-web/actions/runs/9049",
  },
  {
    id: "run-9044",
    name: "Tests",
    status: "success",
    branch: "main",
    commitMessage: "chore: bump dependencies",
    shortHash: "77aa021",
    actor: "priya",
    startedAt: now - DAY,
    durationMs: 3 * 60_000 + 51_000,
    url: "https://github.com/aurora-labs/aurora-web/actions/runs/9044",
  },
  {
    id: "run-9040",
    name: "Deploy preview",
    status: "cancelled",
    branch: "fix/checkout-total",
    commitMessage: "fix: correct total on checkout",
    shortHash: "5e6d8c0",
    actor: "marco",
    startedAt: now - 2 * DAY,
    durationMs: 22_000,
    url: "https://github.com/aurora-labs/aurora-web/actions/runs/9040",
  },
];

const RELEASES: Release[] = [
  {
    tag: "v2.4.0",
    name: "2.4 — Settings refresh",
    publishedAt: now - 6 * DAY,
    isLatest: true,
    isDraft: false,
    isPrerelease: false,
    notes:
      "Rebuilt settings surface, 40% faster cold start, and a fix for the checkout total when a coupon is applied.",
    url: "https://github.com/aurora-labs/aurora-web/releases/tag/v2.4.0",
    downloadCount: 1_284,
  },
  {
    tag: "v2.3.1",
    name: "2.3.1 — Checkout hotfix",
    publishedAt: now - 21 * DAY,
    isLatest: false,
    isDraft: false,
    isPrerelease: false,
    notes: "Tax was applied before the discount instead of after.",
    url: "https://github.com/aurora-labs/aurora-web/releases/tag/v2.3.1",
    downloadCount: 3_902,
  },
  {
    tag: "v2.5.0-rc1",
    name: "2.5 release candidate",
    publishedAt: now - HOUR,
    isLatest: false,
    isDraft: true,
    isPrerelease: true,
    notes: "New authentication flow. Not for production yet.",
    url: "https://github.com/aurora-labs/aurora-web/releases/tag/v2.5.0-rc1",
    downloadCount: 0,
  },
];

const MY_REPOS: RemoteRepo[] = [
  {
    slug: "you/aurora-web",
    description: "Fork of aurora-labs/aurora-web",
    language: "TypeScript",
    stars: 3,
    isPrivate: false,
    isFork: true,
    updatedAt: now - 2 * HOUR,
    url: "https://github.com/you/aurora-web",
  },
  {
    slug: "you/portfolio",
    description: "Personal site, rebuilt every eighteen months forever",
    language: "Astro",
    stars: 17,
    isPrivate: false,
    isFork: false,
    updatedAt: now - 9 * DAY,
    url: "https://github.com/you/portfolio",
  },
  {
    slug: "you/scratch-notes",
    description: "Private notes and half-finished scripts",
    language: null,
    stars: 0,
    isPrivate: true,
    isFork: false,
    updatedAt: now - 30 * DAY,
    url: "https://github.com/you/scratch-notes",
  },
];

let account: GitHubAccount | null = ACCOUNT;
let pullRequests = PULL_REQUESTS.map((p) => ({ ...p }));
let issues = ISSUES.map((i) => ({ ...i }));
let myRepos = MY_REPOS.map((r) => ({ ...r }));

export const githubService: GitHubService = {
  async getAccount() {
    await delay(120);
    return account ? { ...account } : null;
  },

  async signIn() {
    await delay(900);
    account = { ...ACCOUNT };
    return { ...account };
  },

  async signOut() {
    await delay(200);
    account = null;
  },

  async getPullRequests() {
    await delay(320);
    return pullRequests.map((p) => ({ ...p }));
  },

  async createPullRequest({ repoUrl, head, base, title, draft }) {
    await delay(950);
    const created: PullRequest = {
      number: 149 + pullRequests.length,
      title,
      author: account?.login ?? "you",
      state: draft ? "draft" : "open",
      head,
      base,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      commentCount: 0,
      review: "none",
      checks: "running",
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      labels: [],
      url: `${repoUrl}/pull/${149 + pullRequests.length}`,
      isMine: true,
      reviewRequested: false,
      mergeable: false,
    };
    pullRequests = [created, ...pullRequests];
    return created;
  },

  async mergePullRequest(_repoUrl, number) {
    await delay(1000);
    pullRequests = pullRequests.map((p) =>
      p.number === number ? { ...p, state: "merged", updatedAt: Date.now() } : p,
    );
  },

  async closePullRequest(_repoUrl, number) {
    await delay(600);
    pullRequests = pullRequests.map((p) =>
      p.number === number ? { ...p, state: "closed", updatedAt: Date.now() } : p,
    );
  },

  async getIssues() {
    await delay(280);
    return issues.map((i) => ({ ...i }));
  },

  async createIssue(repoUrl, title) {
    await delay(700);
    const created: Issue = {
      number: 152 + issues.length,
      title,
      author: account?.login ?? "you",
      state: "open",
      createdAt: Date.now(),
      commentCount: 0,
      labels: [],
      url: `${repoUrl}/issues/${152 + issues.length}`,
      assignedToMe: true,
    };
    issues = [created, ...issues];
    return created;
  },

  async closeIssue(_repoUrl, number) {
    await delay(500);
    issues = issues.map((i) => (i.number === number ? { ...i, state: "closed" } : i));
  },

  async getWorkflowRuns() {
    await delay(300);
    return RUNS.map((r) => ({ ...r }));
  },

  async rerunWorkflow() {
    await delay(600);
  },

  async getReleases() {
    await delay(260);
    return RELEASES.map((r) => ({ ...r }));
  },

  async createRelease(repoUrl, input) {
    await delay(800);
    return {
      tag: input.tag,
      name: input.title || input.tag,
      publishedAt: Date.now(),
      isLatest: !input.prerelease && !input.draft,
      isDraft: input.draft,
      isPrerelease: input.prerelease,
      notes: input.notes,
      url: `${repoUrl}/releases/tag/${input.tag}`,
      downloadCount: 0,
    };
  },

  async getMyRepos() {
    await delay(420);
    return myRepos.map((r) => ({ ...r }));
  },

  async createRepo(input) {
    await delay(700);
    const login = account?.login ?? "you";
    const created: RemoteRepo = {
      slug: `${login}/${input.name}`,
      description: input.description,
      language: null,
      stars: 0,
      isPrivate: input.private,
      isFork: false,
      updatedAt: Date.now(),
      url: `https://github.com/${login}/${input.name}`,
    };
    myRepos = [created, ...myRepos];
    return created;
  },
};
