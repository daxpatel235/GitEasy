//! The Tauri command surface — everything the frontend can call.
//!
//! Each command is named, typed and narrow. There is deliberately no generic
//! "run a git command" entry point: the frontend passes data (a branch name, a
//! file path), and this layer decides which Git operation that means.
//!
//! Every command returns `Result<T, AppError>`, so the frontend gets structured
//! errors it can branch on rather than strings it has to match against.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::exec;
use crate::git;
use crate::github;
use crate::models::*;
use crate::store::Store;
use crate::watcher::{self, Watch};

/// Everything the app holds between commands.
pub struct AppState {
    pub store: Store,
    /// The repository currently being watched, if any.
    pub watch: Mutex<Option<Watch>>,
}

impl AppState {
    pub fn new(store: Store) -> Self {
        Self {
            store,
            watch: Mutex::new(None),
        }
    }
}

/// Resolve and validate a repository path from the frontend.
fn repo(path: &str) -> AppResult<PathBuf> {
    git::repo_path(path)
}

/* ========================================================================== */
/* Environment, identity and authentication                                    */
/* ========================================================================== */

/// Everything GitEasy needs to know about this machine, in one call.
#[tauri::command]
pub fn environment() -> Environment {
    let git_installed = exec::git_installed();
    let gh_installed = exec::gh_installed();

    let git_version = git_installed
        .then(|| exec::git_global(&["--version"]).ok())
        .flatten()
        .map(|v| v.trim().replace("git version ", ""));

    let gh_version = gh_installed
        .then(|| exec::gh(None, &["--version"]).ok())
        .flatten()
        .and_then(|v| {
            v.lines()
                .next()
                .map(|l| l.replace("gh version ", "").trim().to_string())
        });

    let identity = git::commits::identity(None);
    let account = github::auth::account();
    let identity_warning =
        github::auth::identity_warning(identity.email.as_deref(), account.as_ref());

    Environment {
        git_installed,
        git_version,
        gh_installed,
        gh_version,
        identity,
        account,
        identity_warning,
    }
}

/// Whether the Git CLI is on this machine at all.
#[tauri::command]
pub fn git_installed() -> bool {
    exec::git_installed()
}

/// The Git identity commits are stamped with.
#[tauri::command]
pub fn git_identity(path: Option<String>) -> GitIdentity {
    let repo = path.as_deref().and_then(|p| git::repo_path(p).ok());
    git::commits::identity(repo.as_deref())
}

/// Write the Git identity. Only ever called from the setup screen, which shows
/// the user exactly what will be written first.
#[tauri::command]
pub fn set_git_identity(
    path: Option<String>,
    name: String,
    email: String,
    global: Option<bool>,
) -> AppResult<GitIdentity> {
    let repo = path.as_deref().and_then(|p| git::repo_path(p).ok());
    git::commits::set_identity(repo.as_deref(), &name, &email, global.unwrap_or(true))
}

/// Who is signed in to GitHub, or null.
#[tauri::command]
pub fn github_account() -> Option<GitHubAccount> {
    github::auth::account()
}

/// Start the official GitHub browser sign-in.
#[tauri::command]
pub fn github_sign_in() -> AppResult<GitHubAccount> {
    github::auth::sign_in()
}

/// Sign out of GitHub.
#[tauri::command]
pub fn github_sign_out() -> AppResult<()> {
    github::auth::sign_out()
}

/* ========================================================================== */
/* Repository                                                                  */
/* ========================================================================== */

/// Open a repository and start watching it.
#[tauri::command]
pub fn open_repository(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> AppResult<Repository> {
    let repository = git::repo::open(&path)?;

    state
        .store
        .remember_repository(&repository.path, &repository.name, &repository.branch)
        .ok();

    start_watching(&app, &state, &repository.path);

    Ok(repository)
}

/// Whether a folder is a Git repository, without opening it.
#[tauri::command]
pub fn is_repository(path: String) -> bool {
    git::repo::detect(&path)
}

/// Create a new repository in a folder.
#[tauri::command]
pub fn init_repository(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: String,
    with_readme: bool,
) -> AppResult<Repository> {
    let repository = git::repo::init(&path, &name, with_readme)?;

    state
        .store
        .remember_repository(&repository.path, &repository.name, &repository.branch)
        .ok();

    start_watching(&app, &state, &repository.path);

    Ok(repository)
}

/// Clone a repository into a folder.
#[tauri::command]
pub fn clone_repository(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    destination: String,
) -> AppResult<Repository> {
    let repository = git::repo::clone(&url, &destination)?;

    state
        .store
        .remember_repository(&repository.path, &repository.name, &repository.branch)
        .ok();

    start_watching(&app, &state, &repository.path);

    Ok(repository)
}

/// Create a GitHub repository and connect this folder to it as `origin`.
#[tauri::command]
pub fn publish_repository(
    path: String,
    name: String,
    description: String,
    private: bool,
) -> AppResult<Repository> {
    let repo = repo(&path)?;

    let created = github::auth::create_repo(&name, &description, private)?;
    github::auth::connect_and_push(&repo, &created.slug)?;

    git::repo::describe(&repo)
}

/// Recently opened projects.
#[tauri::command]
pub fn recent_repositories(state: State<'_, AppState>) -> AppResult<Vec<RecentRepository>> {
    state.store.recent_repositories(12)
}

/// Drop one project from the recent list.
#[tauri::command]
pub fn forget_repository(state: State<'_, AppState>, path: String) -> AppResult<()> {
    state.store.forget_repository(&path)
}

/// Whether the repository has no commits yet.
#[tauri::command]
pub fn is_empty_repository(path: String) -> AppResult<bool> {
    Ok(git::repo::is_empty(&repo(&path)?))
}

/* ========================================================================== */
/* Watching                                                                    */
/* ========================================================================== */

fn start_watching(app: &AppHandle, state: &State<'_, AppState>, path: &str) {
    let Ok(mut guard) = state.watch.lock() else {
        return;
    };

    // Already watching this project — leave the existing watch alone.
    if guard.as_ref().map(|w| w.path() == PathBuf::from(path)) == Some(true) {
        return;
    }

    // Dropping the old watch stops its thread.
    *guard = watcher::watch(app.clone(), std::path::Path::new(path)).ok();
}

/// Stop watching, for when the last project is closed.
#[tauri::command]
pub fn stop_watching(state: State<'_, AppState>) {
    if let Ok(mut guard) = state.watch.lock() {
        *guard = None;
    }
}

/* ========================================================================== */
/* Changes                                                                     */
/* ========================================================================== */

/// Everything that differs from the last commit.
#[tauri::command]
pub fn changed_files(path: String) -> AppResult<Vec<ChangedFile>> {
    git::status::changed_files(&repo(&path)?)
}

/// Changed files, with diffs attached for the ones the screen will actually
/// render.
///
/// The file list itself is always complete — every changed file appears, with
/// its name, status and line counts, because that is what the user is choosing
/// between. What is bounded is the *patch text*: diffs are fetched only for the
/// first page of rows, and a single enormous patch is left out entirely.
///
/// The rest arrive through `file_diff` when a row is opened. A patch nobody
/// scrolled to costs three copies — Git builds it, this process holds it, the
/// webview parses it — and that is the work that makes the window stop
/// responding on a large change.
#[tauri::command]
pub fn changed_files_with_diffs(path: String) -> AppResult<Vec<ChangedFile>> {
    let repo = repo(&path)?;
    let mut files = git::status::changed_files(&repo)?;

    /// Rows to attach diffs for up front. Beyond this the list still renders in
    /// full; opening a row fetches that file's diff on its own.
    const EAGER_ROWS: usize = 40;
    let max_diff = git::status::MAX_DIFF_BYTES as usize;

    // Only the tracked files in the first page are named, so Git is never asked
    // to diff anything the user cannot currently see.
    let wanted: Vec<String> = files
        .iter()
        .take(EAGER_ROWS)
        .filter(|f| f.status != "untracked")
        .map(|f| f.path.clone())
        .collect();

    let mut diffs = git::status::diffs_for(&repo, &wanted);

    for file in files.iter_mut().take(EAGER_ROWS) {
        if let Some(diff) = diffs.remove(&file.path) {
            if diff.len() <= max_diff {
                file.diff = diff;
            }
            continue;
        }

        // Untracked files have no diff against HEAD, so they are read one at a
        // time — and `file_diff` skips anything binary or oversized.
        if file.status == "untracked" {
            let diff = git::status::file_diff(&repo, &file.path).unwrap_or_default();
            if diff.len() <= max_diff {
                file.diff = diff;
            }
        }
    }

    Ok(files)
}

/// The unified diff for one file.
#[tauri::command]
pub fn file_diff(path: String, file: String) -> AppResult<String> {
    git::status::file_diff(&repo(&path)?, &file)
}

/// One file's diff split into hunks.
#[tauri::command]
pub fn file_hunks(path: String, file: String, staged: Option<bool>) -> AppResult<Vec<DiffHunk>> {
    git::status::file_hunks(&repo(&path)?, &file, staged.unwrap_or(false))
}

/// Stage files. An empty list stages everything.
#[tauri::command]
pub fn stage_files(path: String, files: Vec<String>) -> AppResult<()> {
    git::status::stage(&repo(&path)?, &files)
}

/// Unstage files. An empty list unstages everything.
#[tauri::command]
pub fn unstage_files(path: String, files: Vec<String>) -> AppResult<()> {
    git::status::unstage(&repo(&path)?, &files)
}

/// Stage one hunk of one file.
#[tauri::command]
pub fn stage_hunk(path: String, file: String, hunk: usize) -> AppResult<()> {
    git::status::stage_hunk(&repo(&path)?, &file, hunk)
}

/// Unstage one hunk of one file.
#[tauri::command]
pub fn unstage_hunk(path: String, file: String, hunk: usize) -> AppResult<()> {
    git::status::unstage_hunk(&repo(&path)?, &file, hunk)
}

/// Permanently drop uncommitted changes to one file.
#[tauri::command]
pub fn discard_file(path: String, file: String) -> AppResult<()> {
    git::status::discard_file(&repo(&path)?, &file)
}

/* ========================================================================== */
/* Commits                                                                     */
/* ========================================================================== */

/// Commit the given files.
#[tauri::command]
pub fn commit(path: String, files: Vec<String>, message: String) -> AppResult<SaveResult> {
    git::commits::commit(&repo(&path)?, &files, &message)
}

/// Replace the most recent commit.
#[tauri::command]
pub fn amend_commit(
    path: String,
    message: String,
    files: Option<Vec<String>>,
) -> AppResult<SaveResult> {
    git::commits::amend(&repo(&path)?, &message, &files.unwrap_or_default())
}

/// Whether the last commit is already on the remote, so the UI can warn before
/// amending it.
#[tauri::command]
pub fn head_is_pushed(path: String) -> AppResult<bool> {
    Ok(git::commits::head_is_pushed(&repo(&path)?))
}

/// Commits made here that the remote does not have yet.
#[tauri::command]
pub fn pending_commits(path: String) -> AppResult<Vec<LocalSave>> {
    git::commits::pending_commits(&repo(&path)?)
}

/// Files touched by one commit, with diffs.
#[tauri::command]
pub fn commit_files(path: String, hash: String) -> AppResult<Vec<ChangedFile>> {
    git::commits::commit_files(&repo(&path)?, &hash)
}

/// Full detail for one commit.
#[tauri::command]
pub fn commit_detail(path: String, hash: String) -> AppResult<Commit> {
    git::history::commit_detail(&repo(&path)?, &hash)
}

/// Undo a commit by adding one that reverses it.
#[tauri::command]
pub fn revert_commit(path: String, hash: String) -> AppResult<Vec<Conflict>> {
    let repo = repo(&path)?;
    let conflicted = git::commits::revert(&repo, &hash)?;

    if conflicted.is_empty() {
        Ok(Vec::new())
    } else {
        git::conflicts::list(&repo)
    }
}

/// Apply a single commit from another branch onto this one.
#[tauri::command]
pub fn cherry_pick(path: String, hash: String) -> AppResult<Vec<Conflict>> {
    let repo = repo(&path)?;
    let conflicted = git::commits::cherry_pick(&repo, &hash)?;

    if conflicted.is_empty() {
        Ok(Vec::new())
    } else {
        git::conflicts::list(&repo)
    }
}

/// Move the branch to another commit. Destructive when `mode` is "hard".
#[tauri::command]
pub fn reset_to(path: String, hash: String, mode: String) -> AppResult<()> {
    git::commits::reset(&repo(&path)?, &hash, &mode)
}

/// Guard-rail checks the UI runs before committing.
#[tauri::command]
pub fn commit_warnings(
    path: String,
    files: Vec<String>,
    check_large_files: Option<bool>,
    check_secrets: Option<bool>,
) -> AppResult<Vec<git::commits::CommitWarning>> {
    let repo = repo(&path)?;
    let mut warnings = Vec::new();

    if check_large_files.unwrap_or(true) {
        warnings.extend(git::commits::large_files(&repo, &files, 50 * 1024 * 1024));
    }

    if check_secrets.unwrap_or(true) {
        warnings.extend(git::commits::secret_scan(&repo, &files));
    }

    Ok(warnings)
}

/* ========================================================================== */
/* Branches                                                                    */
/* ========================================================================== */

#[tauri::command]
pub fn branches(path: String) -> AppResult<Vec<Branch>> {
    git::branches::list(&repo(&path)?)
}

#[tauri::command]
pub fn create_branch(path: String, name: String, from: String) -> AppResult<Branch> {
    git::branches::create(&repo(&path)?, &name, &from)
}

#[tauri::command]
pub fn switch_branch(path: String, name: String) -> AppResult<()> {
    git::branches::switch(&repo(&path)?, &name)
}

#[tauri::command]
pub fn rename_branch(path: String, from: String, to: String) -> AppResult<()> {
    git::branches::rename(&repo(&path)?, &from, &to)
}

/// Delete a branch. `force` is required to lose unmerged work, and the UI
/// counts that work first with [`unmerged_count`].
#[tauri::command]
pub fn delete_branch(path: String, name: String, force: Option<bool>) -> AppResult<()> {
    git::branches::delete(&repo(&path)?, &name, force.unwrap_or(false))
}

/// How many commits would be lost by deleting a branch.
#[tauri::command]
pub fn unmerged_count(path: String, name: String) -> AppResult<u32> {
    Ok(git::branches::unmerged_count(&repo(&path)?, &name))
}

#[tauri::command]
pub fn merge_branch(path: String, from: String) -> AppResult<Vec<Conflict>> {
    let repo = repo(&path)?;
    let conflicted = git::branches::merge(&repo, &from)?;

    if conflicted.is_empty() {
        Ok(Vec::new())
    } else {
        git::conflicts::list(&repo)
    }
}

#[tauri::command]
pub fn rebase_branch(path: String, onto: String) -> AppResult<Vec<Conflict>> {
    let repo = repo(&path)?;
    let conflicted = git::branches::rebase(&repo, &onto)?;

    if conflicted.is_empty() {
        Ok(Vec::new())
    } else {
        git::conflicts::list(&repo)
    }
}

/// Compare two branches or commits.
#[tauri::command]
pub fn compare_refs(path: String, base: String, head: String) -> AppResult<Comparison> {
    git::branches::compare(&repo(&path)?, &base, &head)
}

/* ========================================================================== */
/* History                                                                     */
/* ========================================================================== */

#[tauri::command]
pub fn history(path: String, branch: String, limit: Option<u32>) -> AppResult<Vec<Commit>> {
    git::history::history(&repo(&path)?, &branch, limit.unwrap_or(200))
}

/// Every commit that touched one file.
#[tauri::command]
pub fn file_history(path: String, file: String, limit: Option<u32>) -> AppResult<Vec<Commit>> {
    git::history::file_history(&repo(&path)?, &file, limit.unwrap_or(100))
}

/// Who last changed each line of a file.
#[tauri::command]
pub fn blame(path: String, file: String, rev: Option<String>) -> AppResult<Vec<BlameLine>> {
    git::history::blame(&repo(&path)?, &file, rev.as_deref())
}

/* ========================================================================== */
/* Remotes and sync                                                            */
/* ========================================================================== */

#[tauri::command]
pub fn remotes(path: String) -> AppResult<Vec<Remote>> {
    git::remote::list(&repo(&path)?)
}

#[tauri::command]
pub fn add_remote(path: String, name: String, url: String) -> AppResult<()> {
    git::remote::add(&repo(&path)?, &name, &url)
}

#[tauri::command]
pub fn set_remote_url(path: String, name: String, url: String) -> AppResult<()> {
    git::remote::set_url(&repo(&path)?, &name, &url)
}

#[tauri::command]
pub fn remove_remote(path: String, name: String) -> AppResult<()> {
    git::remote::remove(&repo(&path)?, &name)
}

#[tauri::command]
pub fn sync_state(path: String) -> AppResult<SyncState> {
    git::remote::sync_state(&repo(&path)?)
}

#[tauri::command]
pub fn fetch_remotes(path: String) -> AppResult<SyncState> {
    git::remote::fetch(&repo(&path)?)
}

#[tauri::command]
pub fn pull(path: String, strategy: Option<String>) -> AppResult<Vec<Conflict>> {
    let repo = repo(&path)?;
    let conflicted = git::remote::pull(&repo, strategy.as_deref().unwrap_or("merge"))?;

    if conflicted.is_empty() {
        Ok(Vec::new())
    } else {
        git::conflicts::list(&repo)
    }
}

#[tauri::command]
pub fn push_to_github(path: String, force: Option<bool>) -> AppResult<PushResult> {
    git::remote::push(&repo(&path)?, force.unwrap_or(false))
}

#[tauri::command]
pub fn push_tags(path: String) -> AppResult<()> {
    git::remote::push_tags(&repo(&path)?)
}

#[tauri::command]
pub fn sync_fork(path: String) -> AppResult<Vec<Conflict>> {
    let repo = repo(&path)?;
    let conflicted = git::remote::sync_fork(&repo)?;

    if conflicted.is_empty() {
        Ok(Vec::new())
    } else {
        git::conflicts::list(&repo)
    }
}

/* ========================================================================== */
/* Shelf                                                                       */
/* ========================================================================== */

#[tauri::command]
pub fn stashes(path: String) -> AppResult<Vec<Stash>> {
    git::stash::list(&repo(&path)?)
}

#[tauri::command]
pub fn stash_push(path: String, message: String) -> AppResult<Stash> {
    git::stash::push(&repo(&path)?, &message)
}

#[tauri::command]
pub fn stash_pop(path: String, id: String) -> AppResult<Vec<Conflict>> {
    let repo = repo(&path)?;
    let conflicted = git::stash::pop(&repo, &id)?;

    if conflicted.is_empty() {
        Ok(Vec::new())
    } else {
        git::conflicts::list(&repo)
    }
}

#[tauri::command]
pub fn stash_apply(path: String, id: String) -> AppResult<Vec<Conflict>> {
    let repo = repo(&path)?;
    let conflicted = git::stash::apply(&repo, &id)?;

    if conflicted.is_empty() {
        Ok(Vec::new())
    } else {
        git::conflicts::list(&repo)
    }
}

#[tauri::command]
pub fn stash_drop(path: String, id: String) -> AppResult<()> {
    git::stash::drop(&repo(&path)?, &id)
}

#[tauri::command]
pub fn stash_show(path: String, id: String) -> AppResult<String> {
    git::stash::show(&repo(&path)?, &id)
}

/* ========================================================================== */
/* Conflicts                                                                   */
/* ========================================================================== */

#[tauri::command]
pub fn conflicts(path: String) -> AppResult<Vec<Conflict>> {
    git::conflicts::list(&repo(&path)?)
}

/// Which operation, if any, the repository is in the middle of.
#[tauri::command]
pub fn repo_operation(path: String) -> AppResult<RepoOperation> {
    Ok(git::conflicts::operation(&repo(&path)?))
}

/// Resolve one file by keeping one side.
#[tauri::command]
pub fn resolve_conflict(path: String, file: String, keep: String) -> AppResult<()> {
    git::conflicts::resolve(&repo(&path)?, &file, &keep)
}

/// Read a conflicted file for manual editing.
#[tauri::command]
pub fn conflict_file_contents(path: String, file: String) -> AppResult<String> {
    git::conflicts::file_contents(&repo(&path)?, &file)
}

/// Save a manually resolved file and mark it done.
#[tauri::command]
pub fn resolve_conflict_manually(
    path: String,
    file: String,
    contents: String,
) -> AppResult<()> {
    git::conflicts::write_resolution(&repo(&path)?, &file, &contents)
}

/// Mark a file the user fixed in their own editor as resolved.
#[tauri::command]
pub fn mark_resolved(path: String, file: String) -> AppResult<()> {
    git::conflicts::mark_resolved(&repo(&path)?, &file)
}

/// Finish the merge, rebase, cherry-pick or revert that stopped.
#[tauri::command]
pub fn continue_operation(path: String) -> AppResult<()> {
    git::conflicts::cont(&repo(&path)?)
}

/// Abandon the operation in progress.
#[tauri::command]
pub fn abort_operation(path: String) -> AppResult<()> {
    git::conflicts::abort(&repo(&path)?)
}

/* ========================================================================== */
/* Tags                                                                        */
/* ========================================================================== */

#[tauri::command]
pub fn tags(path: String) -> AppResult<Vec<Tag>> {
    git::tags::list(&repo(&path)?)
}

#[tauri::command]
pub fn create_tag(
    path: String,
    name: String,
    message: String,
    target: Option<String>,
) -> AppResult<Tag> {
    git::tags::create(&repo(&path)?, &name, &message, target.as_deref())
}

#[tauri::command]
pub fn delete_tag(path: String, name: String) -> AppResult<()> {
    git::tags::delete(&repo(&path)?, &name)
}

/* ========================================================================== */
/* GitHub                                                                      */
/* ========================================================================== */

#[tauri::command]
pub fn pull_requests(path: String) -> AppResult<Vec<PullRequest>> {
    let repo = repo(&path)?;
    let me = github::auth::account().map(|a| a.login);
    github::pulls::list(&repo, me.as_deref())
}

#[tauri::command]
pub fn create_pull_request(
    path: String,
    head: String,
    base: String,
    title: String,
    body: String,
    draft: bool,
) -> AppResult<PullRequest> {
    github::pulls::create(&repo(&path)?, &head, &base, &title, &body, draft)
}

#[tauri::command]
pub fn merge_pull_request(
    path: String,
    number: u64,
    strategy: Option<String>,
) -> AppResult<()> {
    github::pulls::merge(
        &repo(&path)?,
        number,
        strategy.as_deref().unwrap_or("merge"),
    )
}

#[tauri::command]
pub fn close_pull_request(path: String, number: u64) -> AppResult<()> {
    github::pulls::close(&repo(&path)?, number)
}

#[tauri::command]
pub fn issues(path: String) -> AppResult<Vec<Issue>> {
    let repo = repo(&path)?;
    let me = github::auth::account().map(|a| a.login);
    github::issues::list(&repo, me.as_deref())
}

#[tauri::command]
pub fn create_issue(path: String, title: String, body: String) -> AppResult<Issue> {
    github::issues::create(&repo(&path)?, &title, &body)
}

#[tauri::command]
pub fn close_issue(path: String, number: u64) -> AppResult<()> {
    github::issues::close(&repo(&path)?, number)
}

#[tauri::command]
pub fn workflow_runs(path: String, limit: Option<u32>) -> AppResult<Vec<WorkflowRun>> {
    github::runs::list(&repo(&path)?, limit.unwrap_or(30))
}

#[tauri::command]
pub fn rerun_workflow(path: String, id: String) -> AppResult<()> {
    github::runs::rerun(&repo(&path)?, &id)
}

#[tauri::command]
pub fn releases(path: String, limit: Option<u32>) -> AppResult<Vec<Release>> {
    github::releases::list(&repo(&path)?, limit.unwrap_or(30))
}

#[tauri::command]
pub fn create_release(
    path: String,
    tag: String,
    title: String,
    notes: String,
    prerelease: Option<bool>,
    draft: Option<bool>,
) -> AppResult<Release> {
    github::releases::create(
        &repo(&path)?,
        &tag,
        &title,
        &notes,
        prerelease.unwrap_or(false),
        draft.unwrap_or(false),
    )
}

/// Repositories the signed-in user can clone.
#[tauri::command]
pub fn my_repos(limit: Option<u32>) -> AppResult<Vec<RemoteRepo>> {
    github::auth::my_repos(limit.unwrap_or(50))
}

/// Create an empty repository on GitHub.
#[tauri::command]
pub fn create_github_repo(
    name: String,
    description: String,
    private: bool,
) -> AppResult<RemoteRepo> {
    github::auth::create_repo(&name, &description, private)
}

/* ========================================================================== */
/* AI                                                                          */
/* ========================================================================== */

/// Whether AI features are available at all.
#[tauri::command]
pub fn ai_available() -> bool {
    crate::ai::available()
}

/// Suggest a commit message. Falls back to a local heuristic without a key.
#[tauri::command]
pub fn suggest_commit_message(
    path: String,
    files: Vec<String>,
    use_ai: Option<bool>,
) -> AppResult<CommitSuggestion> {
    let repo = repo(&path)?;
    let all = git::status::changed_files(&repo)?;

    let chosen: Vec<ChangedFile> = if files.is_empty() {
        all
    } else {
        all.into_iter().filter(|f| files.contains(&f.path)).collect()
    };

    // Only the diff of the chosen files is ever gathered, and `ai` trims it
    // further before anything leaves the machine.
    let diff = chosen
        .iter()
        .filter_map(|f| git::status::file_diff(&repo, &f.path).ok())
        .collect::<Vec<String>>()
        .join("\n");

    Ok(crate::ai::suggest_commit_message(
        &chosen,
        &diff,
        use_ai.unwrap_or(false),
    ))
}

/// A plain-English summary of the current changes.
#[tauri::command]
pub fn explain_changes(path: String, files: Vec<String>) -> AppResult<String> {
    let repo = repo(&path)?;
    let all = git::status::changed_files(&repo)?;

    let chosen: Vec<ChangedFile> = if files.is_empty() {
        all
    } else {
        all.into_iter().filter(|f| files.contains(&f.path)).collect()
    };

    let diff = chosen
        .iter()
        .filter_map(|f| git::status::file_diff(&repo, &f.path).ok())
        .collect::<Vec<String>>()
        .join("\n");

    crate::ai::summarise_changes(&chosen, &diff)
}

/// Explain a Git error in plain English.
#[tauri::command]
pub fn explain_error(message: String, detail: Option<String>) -> AppResult<String> {
    crate::ai::explain_error(&message, detail.as_deref())
}

/// Explain one merge conflict.
#[tauri::command]
pub fn explain_conflict(path: String, file: String) -> AppResult<String> {
    let repo = repo(&path)?;

    let conflict = git::conflicts::list(&repo)?
        .into_iter()
        .find(|c| c.path == file)
        .ok_or_else(|| AppError::invalid("That file is not waiting on a decision."))?;

    crate::ai::explain_conflict(&conflict.path, &conflict.mine, &conflict.theirs)
}

/* ========================================================================== */
/* Settings                                                                    */
/* ========================================================================== */

/// Every saved preference, for the frontend to hydrate from on launch.
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<std::collections::HashMap<String, String>> {
    state.store.all_settings()
}

/// Save one preference.
#[tauri::command]
pub fn set_setting(state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    if key.trim().is_empty() {
        return Err(AppError::invalid("A setting needs a name."));
    }
    state.store.set_setting(&key, &value)
}

/* ========================================================================== */
/* Misc                                                                        */
/* ========================================================================== */

/// Reveal the project folder in Explorer / Finder.
#[tauri::command]
pub fn open_folder(path: String) -> AppResult<()> {
    let repo = repo(&path)?;

    // Only ever a folder this app has already validated as a repository, and
    // the path is passed as an argument rather than through a shell.
    let program = if cfg!(windows) {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };

    std::process::Command::new(program)
        .arg(repo.as_os_str())
        .spawn()
        .map_err(|e| {
            AppError::new(ErrorKind::Unknown, "Could not open that folder.")
                .with_detail(e.to_string())
        })?;

    Ok(())
}
