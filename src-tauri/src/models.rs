//! The data the frontend receives.
//!
//! Every struct here mirrors an interface in `src/types/git.ts` or
//! `src/types/github.ts`, field for field. They serialise as camelCase so the
//! TypeScript side needs no mapping layer — what Rust sends is already the
//! shape React renders.

use serde::{Deserialize, Serialize};

/* -------------------------------------------------------------------------- */
/* Repository                                                                  */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub name: String,
    pub path: String,
    pub branch: String,
    pub github_url: Option<String>,
    pub upstream: Option<UpstreamRepo>,
    pub default_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpstreamRepo {
    /// `owner/name`, as GitHub writes it.
    pub slug: String,
    pub url: String,
    pub default_branch: String,
}

/* -------------------------------------------------------------------------- */
/* Changed files                                                               */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    /// modified | added | deleted | renamed | untracked | conflicted
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
    pub staged: bool,
    /// Raw unified diff. The frontend parses it into rows.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub diff: String,
    /// Where a renamed file came from, so the UI can say "A → B".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_path: Option<String>,
}

/// One hunk of a diff, for hunk-level staging.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    /// Index of this hunk within the file's diff, starting at 0.
    pub index: usize,
    /// The `@@ … @@` line.
    pub header: String,
    /// The hunk body, including its header — a valid patch fragment.
    pub patch: String,
    pub additions: u32,
    pub deletions: u32,
}

/* -------------------------------------------------------------------------- */
/* Commits                                                                     */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub body: String,
    pub author: String,
    pub author_email: String,
    /// Unix milliseconds.
    pub at: i64,
    pub additions: u32,
    pub deletions: u32,
    pub file_count: u32,
    pub tags: Vec<String>,
    /// Not yet pushed.
    pub is_local: bool,
    pub is_merge: bool,
    /// passing | failing | running | none
    pub checks: String,
    /// Parent hashes, for drawing the graph.
    #[serde(default)]
    pub parents: Vec<String>,
}

/// A commit made here that the remote has not seen yet.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSave {
    pub id: String,
    pub message: String,
    pub files: Vec<ChangedFile>,
    /// Unix milliseconds.
    pub saved_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub save: LocalSave,
    pub pending_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResult {
    pub message: String,
    pub file_count: usize,
    pub commit_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitSuggestion {
    pub message: String,
    pub explanation: String,
    /// Further messages for the same changes, best first, none repeating the
    /// one in `message`. "Suggest another" walks this list, which is what keeps
    /// the button from handing back the same sentence every time.
    #[serde(default)]
    pub alternatives: Vec<String>,
}

/// One line of blame.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    pub line_number: u32,
    pub content: String,
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    /// Unix milliseconds.
    pub at: i64,
    pub summary: String,
}

/* -------------------------------------------------------------------------- */
/* Branches                                                                    */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub is_current: bool,
    pub is_remote_only: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub is_default: bool,
    pub is_protected: bool,
    pub last_commit: Option<BranchCommit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchCommit {
    pub message: String,
    pub author: String,
    /// Unix milliseconds.
    pub at: i64,
}

/// The result of comparing two refs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comparison {
    pub base: String,
    pub head: String,
    /// Commits on `head` that `base` does not have.
    pub ahead: u32,
    /// Commits on `base` that `head` does not have.
    pub behind: u32,
    /// The commits `head` has and `base` does not.
    pub commits: Vec<Commit>,
    pub files: Vec<ChangedFile>,
}

/* -------------------------------------------------------------------------- */
/* Remotes and sync                                                            */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Remote {
    pub name: String,
    pub url: String,
    /// origin | upstream | other
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    pub ahead: u32,
    pub behind: u32,
    pub upstream_behind: u32,
    /// Unix milliseconds, or null if never checked.
    pub last_checked_at: Option<i64>,
    pub has_blocking_changes: bool,
}

/* -------------------------------------------------------------------------- */
/* Shelf (stash)                                                               */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stash {
    pub id: String,
    pub message: String,
    pub branch: String,
    /// Unix milliseconds.
    pub at: i64,
    pub file_count: u32,
}

/* -------------------------------------------------------------------------- */
/* Conflicts                                                                   */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    pub path: String,
    /// The version from the branch you are on.
    pub mine: Vec<String>,
    /// The version arriving from the other branch.
    pub theirs: Vec<String>,
    /// The common ancestor, when Git recorded one.
    #[serde(default)]
    pub base: Vec<String>,
    /// mine | theirs | null
    pub choice: Option<String>,
}

/// Which operation left the repository mid-flight.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoOperation {
    /// none | merge | rebase | cherry-pick | revert
    pub kind: String,
    pub conflicted_files: Vec<String>,
}

/* -------------------------------------------------------------------------- */
/* Tags                                                                        */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub name: String,
    pub commit_hash: String,
    /// Unix milliseconds.
    pub at: i64,
    pub message: String,
    pub is_published: bool,
}

/* -------------------------------------------------------------------------- */
/* Environment and identity                                                    */
/* -------------------------------------------------------------------------- */

/// What GitEasy found on this machine at startup.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub git_installed: bool,
    /// e.g. "2.55.0"
    pub git_version: Option<String>,
    pub gh_installed: bool,
    pub gh_version: Option<String>,
    /// The Git identity commits are attributed to.
    pub identity: GitIdentity,
    /// The signed-in GitHub account, if any.
    pub account: Option<GitHubAccount>,
    /// Set when the Git email does not match any email on the GitHub account.
    pub identity_warning: Option<String>,
}

/// `user.name` and `user.email`. Separate from the GitHub account on purpose:
/// one stamps commits, the other authorises network calls, and conflating them
/// is the source of most "why does GitHub not show my avatar" confusion.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentity {
    pub name: Option<String>,
    pub email: Option<String>,
    /// True when both are set.
    pub configured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubAccount {
    pub login: String,
    pub name: String,
    pub avatar_url: Option<String>,
}

/* -------------------------------------------------------------------------- */
/* GitHub                                                                      */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Label {
    pub name: String,
    /// Hex without the hash.
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    pub number: u64,
    pub title: String,
    pub author: String,
    /// open | draft | merged | closed
    pub state: String,
    pub head: String,
    pub base: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub comment_count: u32,
    /// approved | changes-requested | pending | none
    pub review: String,
    /// passing | failing | running | none
    pub checks: String,
    pub additions: u32,
    pub deletions: u32,
    pub changed_files: u32,
    pub labels: Vec<Label>,
    pub url: String,
    pub is_mine: bool,
    pub review_requested: bool,
    pub mergeable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub number: u64,
    pub title: String,
    pub author: String,
    /// open | closed
    pub state: String,
    pub created_at: i64,
    pub comment_count: u32,
    pub labels: Vec<Label>,
    pub url: String,
    pub assigned_to_me: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRun {
    pub id: String,
    pub name: String,
    /// queued | running | success | failure | cancelled
    pub status: String,
    pub branch: String,
    pub commit_message: String,
    pub short_hash: String,
    pub actor: String,
    pub started_at: i64,
    pub duration_ms: Option<i64>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub tag: String,
    pub name: String,
    pub published_at: i64,
    pub is_latest: bool,
    pub is_draft: bool,
    pub is_prerelease: bool,
    pub notes: String,
    pub url: String,
    pub download_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteRepo {
    pub slug: String,
    pub description: String,
    pub language: Option<String>,
    pub stars: u32,
    pub is_private: bool,
    pub is_fork: bool,
    pub updated_at: i64,
    pub url: String,
}

/* -------------------------------------------------------------------------- */
/* App data (SQLite)                                                           */
/* -------------------------------------------------------------------------- */

/// A repository GitEasy has opened before, for the recent-projects list.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentRepository {
    pub path: String,
    pub name: String,
    /// Unix milliseconds.
    pub last_opened_at: i64,
    /// False once the folder has been moved or deleted.
    pub exists: bool,
}
