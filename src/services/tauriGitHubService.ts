import { invoke } from "@tauri-apps/api/core";
import type { GitHubService } from "./githubService";
import { toAppError } from "./shared";
import type {
  GitHubAccount,
  Issue,
  PullRequest,
  Release,
  RemoteRepo,
  WorkflowRun,
} from "@/types/github";

/**
 * The real GitHub implementation, backed by the official GitHub CLI.
 *
 * `gh` owns the credentials. GitEasy never sees, asks for or stores a password
 * or a token: signing in opens github.com in the user's own browser, and the
 * token that comes back is written to the OS keychain by `gh` itself.
 *
 * Every method needs the path of the local repository rather than its URL,
 * because `gh` infers which project is meant from the folder it runs in — which
 * is also what makes it work for private repositories without extra plumbing.
 * The service therefore holds the current repository path, set by the app when
 * a project is opened.
 */

/** The folder `gh` runs in. Set whenever a project is opened. */
let repoPath: string | null = null;

/** Point the GitHub calls at a project. Pass null when the project closes. */
export function setGitHubRepoPath(path: string | null) {
  repoPath = path;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Run a command that needs a repository.
 *
 * Without one there is nothing to ask about, so these resolve empty rather than
 * throwing — the GitHub screens all render a "no project" state, and an
 * exception here would turn that into an error toast for a situation that is
 * not an error.
 */
async function withRepo<T>(command: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  if (!repoPath) return fallback;
  return call<T>(command, { path: repoPath, ...args });
}

export const tauriGitHubService: GitHubService = {
  async getAccount() {
    return call<GitHubAccount | null>("github_account");
  },

  async signIn() {
    // Opens the official GitHub browser flow and blocks until it finishes.
    return call<GitHubAccount>("github_sign_in");
  },

  async signOut() {
    await call("github_sign_out");
  },

  /* --- Pull requests ------------------------------------------------------ */

  async getPullRequests() {
    return withRepo<PullRequest[]>("pull_requests", {}, []);
  },

  async createPullRequest({ head, base, title, body, draft }) {
    if (!repoPath) {
      throw toAppError("Open a project before opening a pull request.");
    }
    return call<PullRequest>("create_pull_request", {
      path: repoPath,
      head,
      base,
      title,
      body,
      draft,
    });
  },

  async mergePullRequest(_repoUrl, number, strategy = "merge") {
    if (!repoPath) return;
    await call("merge_pull_request", { path: repoPath, number, strategy });
  },

  async closePullRequest(_repoUrl, number) {
    if (!repoPath) return;
    await call("close_pull_request", { path: repoPath, number });
  },

  /* --- Issues -------------------------------------------------------------- */

  async getIssues() {
    return withRepo<Issue[]>("issues", {}, []);
  },

  async createIssue(_repoUrl, title, body) {
    if (!repoPath) {
      throw toAppError("Open a project before creating an issue.");
    }
    return call<Issue>("create_issue", { path: repoPath, title, body });
  },

  async closeIssue(_repoUrl, number) {
    if (!repoPath) return;
    await call("close_issue", { path: repoPath, number });
  },

  /* --- Checks --------------------------------------------------------------- */

  async getWorkflowRuns() {
    return withRepo<WorkflowRun[]>("workflow_runs", { limit: 30 }, []);
  },

  async rerunWorkflow(_repoUrl, id) {
    if (!repoPath) return;
    await call("rerun_workflow", { path: repoPath, id });
  },

  /* --- Releases -------------------------------------------------------------- */

  async getReleases() {
    return withRepo<Release[]>("releases", { limit: 30 }, []);
  },

  async createRelease(_repoUrl, input) {
    if (!repoPath) {
      throw toAppError("Open a project before publishing a release.");
    }
    return call<Release>("create_release", {
      path: repoPath,
      tag: input.tag,
      title: input.title,
      notes: input.notes,
      prerelease: input.prerelease,
      draft: input.draft,
    });
  },

  /* --- The account's own repositories ------------------------------------------ */

  async getMyRepos() {
    return call<RemoteRepo[]>("my_repos", { limit: 50 });
  },

  async createRepo(input) {
    return call<RemoteRepo>("create_github_repo", {
      name: input.name,
      description: input.description,
      private: input.private,
    });
  },
};
