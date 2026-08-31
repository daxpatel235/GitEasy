import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { GitService } from "./gitService";
import { parseDiff, toAppError } from "./shared";
import type {
  BlameLine,
  Branch,
  ChangedFile,
  Commit,
  CommitSuggestion,
  CommitWarning,
  Comparison,
  Conflict,
  DiffHunk,
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
 * The real implementation, backed by the Git CLI through Tauri.
 *
 * Every method maps to one named Rust command. Nothing here builds a Git
 * command line — the frontend sends data (a path, a branch name, a message) and
 * the Rust side decides which Git operation that means.
 *
 * Errors arrive as structured `AppError`s rather than strings, so callers can
 * branch on `kind`: offer a retry for a network failure, or the sign-in flow
 * for an authentication one.
 */

/** What Rust returns: the diff is raw patch text, not parsed rows. */
type RawChangedFile = Omit<ChangedFile, "diff"> & { diff?: string };

interface RawLocalSave extends Omit<LocalSave, "files"> {
  files: RawChangedFile[];
}

interface RawSaveResult {
  save: RawLocalSave;
  pendingCount: number;
}

function withParsedDiffs(files: RawChangedFile[]): ChangedFile[] {
  return files.map((file) => ({ ...file, diff: parseDiff(file.diff ?? "") }));
}

function toSaveResult(raw: RawSaveResult): SaveResult {
  return {
    save: { ...raw.save, files: withParsedDiffs(raw.save.files) },
    pendingCount: raw.pendingCount,
  };
}

/** Call a Tauri command, normalising whatever it throws into an AppError. */
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toAppError(error);
  }
}

export const tauriGitService: GitService = {
  /* --- Environment and identity ------------------------------------------ */

  async isGitInstalled() {
    return call<boolean>("git_installed");
  },

  async getEnvironment() {
    return call<Environment>("environment");
  },

  async getIdentity(repo) {
    return call<GitIdentity>("git_identity", { path: repo?.path ?? null });
  },

  async setIdentity(name, email, repo) {
    return call<GitIdentity>("set_git_identity", {
      path: repo?.path ?? null,
      name,
      email,
      global: true,
    });
  },

  /* --- Opening a project -------------------------------------------------- */

  async selectRepository() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose your project folder",
    });

    if (typeof selected !== "string") return null;
    return call<Repository>("open_repository", { path: selected });
  },

  async openRepositoryAt(path) {
    return call<Repository>("open_repository", { path });
  },

  async getRecentRepositories() {
    return call<RecentRepository[]>("recent_repositories");
  },

  async forgetRepository(path) {
    await call("forget_repository", { path });
  },

  async clone(url) {
    const destination = await open({
      directory: true,
      multiple: false,
      title: "Where should the project go?",
    });

    if (typeof destination !== "string") return null;
    return call<Repository>("clone_repository", { url, destination });
  },

  async createRepository(name, withReadme) {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose or create a folder for your new project",
    });

    if (typeof selected !== "string") return null;
    return call<Repository>("init_repository", { path: selected, name, withReadme });
  },

  async publishRepository(repo, name, description, isPrivate) {
    return call<Repository>("publish_repository", {
      path: repo.path,
      name,
      description,
      private: isPrivate,
    });
  },

  async isEmptyRepository(repo) {
    return call<boolean>("is_empty_repository", { path: repo.path });
  },

  /* --- The everyday loop --------------------------------------------------- */

  async getChangedFiles(repo) {
    // One call returns every file with its diff attached, rather than one round
    // trip per file.
    const raw = await call<RawChangedFile[]>("changed_files_with_diffs", {
      path: repo.path,
    });
    return withParsedDiffs(raw);
  },

  async getFileDiff(repo, file) {
    const patch = await call<string>("file_diff", { path: repo.path, file });
    return parseDiff(patch);
  },

  async getFileHunks(repo, file, staged = false) {
    return call<DiffHunk[]>("file_hunks", { path: repo.path, file, staged });
  },

  async stageFiles(repo, files) {
    await call("stage_files", { path: repo.path, files });
  },

  async unstageFiles(repo, files) {
    await call("unstage_files", { path: repo.path, files });
  },

  async stageHunk(repo, file, hunk) {
    await call("stage_hunk", { path: repo.path, file, hunk });
  },

  async unstageHunk(repo, file, hunk) {
    await call("unstage_hunk", { path: repo.path, file, hunk });
  },

  async suggestCommitMessage(files, repo, useAi = false) {
    // Without a repository there is nothing to read the changes from.
    if (!repo) return { message: "", explanation: "", alternatives: [] };

    return call<CommitSuggestion>("suggest_commit_message", {
      path: repo.path,
      files: files.map((f) => f.path),
      useAi,
    });
  },

  async getCommitWarnings(repo, files, options) {
    return call<CommitWarning[]>("commit_warnings", {
      path: repo.path,
      files: files.map((f) => f.path),
      checkLargeFiles: options?.largeFiles ?? true,
      checkSecrets: options?.secrets ?? true,
    });
  },

  async commit(repo, files, message) {
    // Only the ticked files go in; Rust stages exactly this list.
    const paths = files.filter((f) => f.staged).map((f) => f.path);
    const raw = await call<RawSaveResult>("commit", {
      path: repo.path,
      files: paths,
      message,
    });
    return toSaveResult(raw);
  },

  async amendCommit(repo, message) {
    const raw = await call<RawSaveResult>("amend_commit", {
      path: repo.path,
      message,
      files: null,
    });
    return toSaveResult(raw);
  },

  async isHeadPushed(repo) {
    return call<boolean>("head_is_pushed", { path: repo.path });
  },

  async discardFile(repo, path) {
    await call("discard_file", { path: repo.path, file: path });
  },

  async getPendingCommits(repo) {
    const raw = await call<RawLocalSave[]>("pending_commits", { path: repo.path });
    return raw.map((save) => ({ ...save, files: withParsedDiffs(save.files) }));
  },

  /* --- Talking to the remote ------------------------------------------------ */

  async push(repo, force = false) {
    return call<PushResult>("push_to_github", { path: repo.path, force });
  },

  async pushTags(repo) {
    await call("push_tags", { path: repo.path });
  },

  async pull(repo, strategy = "merge") {
    return call<Conflict[]>("pull", { path: repo.path, strategy });
  },

  async fetch(repo) {
    return call<SyncState>("fetch_remotes", { path: repo.path });
  },

  async getSyncState(repo) {
    return call<SyncState>("sync_state", { path: repo.path });
  },

  async syncFork(repo) {
    return call<Conflict[]>("sync_fork", { path: repo.path });
  },

  async getRemotes(repo) {
    return call<Remote[]>("remotes", { path: repo.path });
  },

  async addRemote(repo, name, url) {
    await call("add_remote", { path: repo.path, name, url });
  },

  async setRemoteUrl(repo, name, url) {
    await call("set_remote_url", { path: repo.path, name, url });
  },

  async removeRemote(repo, name) {
    await call("remove_remote", { path: repo.path, name });
  },

  /* --- Branches -------------------------------------------------------------- */

  async getBranches(repo) {
    return call<Branch[]>("branches", { path: repo.path });
  },

  async createBranch(repo, name, from) {
    return call<Branch>("create_branch", { path: repo.path, name, from });
  },

  async switchBranch(repo, name) {
    await call("switch_branch", { path: repo.path, name });
  },

  async renameBranch(repo, from, to) {
    await call("rename_branch", { path: repo.path, from, to });
  },

  async deleteBranch(repo, name, force = false) {
    await call("delete_branch", { path: repo.path, name, force });
  },

  async getUnmergedCount(repo, name) {
    return call<number>("unmerged_count", { path: repo.path, name });
  },

  async mergeBranch(repo, from) {
    return call<Conflict[]>("merge_branch", { path: repo.path, from });
  },

  async rebaseBranch(repo, onto) {
    return call<Conflict[]>("rebase_branch", { path: repo.path, onto });
  },

  async compare(repo, base, head) {
    return call<Comparison>("compare_refs", { path: repo.path, base, head });
  },

  /* --- History ---------------------------------------------------------------- */

  async getHistory(repo, branch) {
    return call<Commit[]>("history", { path: repo.path, branch, limit: 200 });
  },

  async getCommitFiles(repo, hash) {
    const raw = await call<RawChangedFile[]>("commit_files", { path: repo.path, hash });
    return withParsedDiffs(raw);
  },

  async getCommitDetail(repo, hash) {
    return call<Commit>("commit_detail", { path: repo.path, hash });
  },

  async getFileHistory(repo, file) {
    return call<Commit[]>("file_history", { path: repo.path, file, limit: 100 });
  },

  async getBlame(repo, file, rev) {
    return call<BlameLine[]>("blame", { path: repo.path, file, rev: rev ?? null });
  },

  async revertCommit(repo, hash) {
    return call<Conflict[]>("revert_commit", { path: repo.path, hash });
  },

  async cherryPick(repo, hash) {
    return call<Conflict[]>("cherry_pick", { path: repo.path, hash });
  },

  async resetTo(repo, hash, mode) {
    await call("reset_to", { path: repo.path, hash, mode });
  },

  /* --- Shelved work (stash) ---------------------------------------------------- */

  async getStashes(repo) {
    return call<Stash[]>("stashes", { path: repo.path });
  },

  async shelve(repo, message) {
    return call<Stash>("stash_push", { path: repo.path, message });
  },

  async unshelve(repo, id) {
    return call<Conflict[]>("stash_pop", { path: repo.path, id });
  },

  async applyShelf(repo, id) {
    return call<Conflict[]>("stash_apply", { path: repo.path, id });
  },

  async dropShelf(repo, id) {
    await call("stash_drop", { path: repo.path, id });
  },

  async getShelfDiff(repo, id) {
    const patch = await call<string>("stash_show", { path: repo.path, id });
    return parseDiff(patch);
  },

  /* --- Conflicts ----------------------------------------------------------------- */

  async getConflicts(repo) {
    return call<Conflict[]>("conflicts", { path: repo.path });
  },

  async getOperation(repo) {
    return call<RepoOperation>("repo_operation", { path: repo.path });
  },

  async resolveConflict(repo, path, keep) {
    await call("resolve_conflict", { path: repo.path, file: path, keep });
  },

  async getConflictContents(repo, path) {
    return call<string>("conflict_file_contents", { path: repo.path, file: path });
  },

  async resolveConflictManually(repo, path, contents) {
    await call("resolve_conflict_manually", { path: repo.path, file: path, contents });
  },

  async markResolved(repo, path) {
    await call("mark_resolved", { path: repo.path, file: path });
  },

  async continueOperation(repo) {
    await call("continue_operation", { path: repo.path });
  },

  async abortOperation(repo) {
    await call("abort_operation", { path: repo.path });
  },

  /* --- Tags ------------------------------------------------------------------------ */

  async getTags(repo) {
    return call<Tag[]>("tags", { path: repo.path });
  },

  async createTag(repo, name, message) {
    return call<Tag>("create_tag", { path: repo.path, name, message, target: null });
  },

  async deleteTag(repo, name) {
    await call("delete_tag", { path: repo.path, name });
  },

  /* --- AI --------------------------------------------------------------------------- */

  async isAiAvailable() {
    return call<boolean>("ai_available");
  },

  async explainChanges(repo, files) {
    return call<string>("explain_changes", {
      path: repo.path,
      files: files.map((f) => f.path),
    });
  },

  async explainError(error) {
    return call<string>("explain_error", {
      message: error.message,
      detail: error.detail ?? null,
    });
  },

  async explainConflict(repo, path) {
    return call<string>("explain_conflict", { path: repo.path, file: path });
  },

  /* --- Settings ---------------------------------------------------------------------- */

  async getSettings() {
    return call<Record<string, string>>("get_settings");
  },

  async setSetting(key, value) {
    await call("set_setting", { key, value });
  },

  /* --- Misc -------------------------------------------------------------------------- */

  async openInBrowser(url) {
    await openUrl(url);
  },

  async openFolder(repo) {
    await call("open_folder", { path: repo.path });
  },
};
