import { gitService as fixtureGitService } from "./gitService";
import { githubService as fixtureGitHubService } from "./githubService";
import { tauriGitService } from "./tauriGitService";
import { setGitHubRepoPath, tauriGitHubService } from "./tauriGitHubService";
import type { GitService } from "./gitService";
import type { GitHubService } from "./githubService";

/**
 * Which implementation the app talks to.
 *
 * Inside the Tauri desktop shell, the real Git and GitHub CLIs. In a plain
 * browser (`npm run dev`), the fixtures — so the whole UI can be worked on
 * without Rust installed, which is what that script is for.
 *
 * The check is for Tauri's injected internals rather than a build-time flag,
 * because the same bundle is served in both cases.
 */
const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

export const gitService: GitService = isTauri ? tauriGitService : fixtureGitService;
export const githubService: GitHubService = isTauri
  ? tauriGitHubService
  : fixtureGitHubService;

/** True when running against real repositories rather than fixtures. */
export const isDesktop = isTauri;

/**
 * Tell the GitHub service which folder to run `gh` in.
 *
 * `gh` works out which project is meant from its working directory, so opening
 * a project has to point it at the new path. A no-op against the fixtures.
 */
export function setActiveRepoPath(path: string | null) {
  if (isTauri) setGitHubRepoPath(path);
}

export { toAppError, isRetryable, needsSignIn, parseDiff } from "./shared";
export type { GitService, GitHubService };
