//! Git operations, grouped by the screen they serve.
//!
//! Everything here runs the real `git` binary through `exec`, which is the only
//! place a process is started. No module below builds a command string; they
//! build argument vectors, so a branch name containing a space or a semicolon
//! is just an odd branch name rather than an injection.

pub mod branches;
pub mod commits;
pub mod conflicts;
pub mod history;
pub mod remote;
pub mod repo;
pub mod stash;
pub mod status;
pub mod tags;

use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::exec::git;

/// Resolve a frontend-supplied path into a directory we are willing to run Git
/// in.
///
/// The frontend only ever sends paths that came from `open_repository`, but
/// this is the boundary between "a string from the webview" and "a working
/// directory for a subprocess", so it is checked rather than trusted: the path
/// has to exist, be a directory, and be inside a Git work tree.
pub fn repo_path(path: &str) -> AppResult<PathBuf> {
    let candidate = Path::new(path);

    if path.trim().is_empty() {
        return Err(AppError::invalid("No project folder was given."));
    }

    if !candidate.exists() {
        return Err(AppError::new(
            ErrorKind::NotARepository,
            "That folder no longer exists. It may have been moved or deleted.",
        ));
    }

    if !candidate.is_dir() {
        return Err(AppError::not_a_repository());
    }

    // `rev-parse --is-inside-work-tree` is the authoritative answer, and it
    // also rejects a bare repository, which nothing in this app can display.
    match git(candidate, &["rev-parse", "--is-inside-work-tree"]) {
        Ok(answer) if answer.trim() == "true" => {}
        _ => return Err(AppError::not_a_repository()),
    }

    Ok(candidate.to_path_buf())
}

/// The repository root for a path anywhere inside it.
pub fn toplevel(repo: &Path) -> AppResult<PathBuf> {
    let out = git(repo, &["rev-parse", "--show-toplevel"])?;
    Ok(PathBuf::from(out.trim()))
}

/// Whether the repository has at least one commit.
///
/// A great deal of Git fails in confusing ways before the first commit, so the
/// commands that care check this rather than surfacing "unknown revision".
pub fn has_commits(repo: &Path) -> bool {
    git(repo, &["rev-parse", "--verify", "HEAD"]).is_ok()
}

/// The branch currently checked out, even with zero commits.
pub fn current_branch(repo: &Path) -> AppResult<String> {
    // `symbolic-ref` works on an unborn branch, where `rev-parse` does not.
    if let Ok(name) = git(repo, &["symbolic-ref", "--short", "HEAD"]) {
        if !name.trim().is_empty() {
            return Ok(name.trim().to_string());
        }
    }

    // Detached HEAD: report the short hash, which is what Git itself shows.
    let head = git(repo, &["rev-parse", "--short", "HEAD"])?;
    Ok(format!("({})", head.trim()))
}

/// Split a `%x1f`-separated log line into its fields.
pub fn split_fields(line: &str) -> Vec<&str> {
    line.split('\u{1f}').collect()
}

/// Parse a Unix-seconds string into milliseconds.
pub fn seconds_to_millis(value: &str) -> i64 {
    value.trim().parse::<i64>().unwrap_or(0) * 1000
}

/// Reject a ref name Git itself would reject, before running anything.
///
/// `check-ref-format` is Git's own validator, so this stays correct as Git's
/// rules change. It also stops a name that begins with `-` from being read as
/// a flag by a later command.
pub fn validate_branch_name(repo: &Path, name: &str) -> AppResult<()> {
    let trimmed = name.trim();

    if trimmed.is_empty() {
        return Err(AppError::invalid("Give the branch a name."));
    }

    if trimmed.starts_with('-') {
        return Err(AppError::invalid(
            "A branch name cannot start with a dash.",
        ));
    }

    let full = format!("refs/heads/{trimmed}");
    if git(repo, &["check-ref-format", &full]).is_err() {
        return Err(AppError::invalid(format!(
            "“{trimmed}” is not a valid branch name. Branch names cannot contain spaces, `~`, `^`, `:` or `\\`."
        )));
    }

    Ok(())
}

/// Reject anything that is not a ref this repository knows, so a caller-
/// supplied revision can never be a flag or a stray path.
pub fn validate_revision(repo: &Path, rev: &str) -> AppResult<()> {
    let trimmed = rev.trim();

    if trimmed.is_empty() {
        return Err(AppError::invalid("No commit or branch was given."));
    }

    if trimmed.starts_with('-') {
        return Err(AppError::invalid("That is not a valid commit or branch."));
    }

    if git(repo, &["rev-parse", "--verify", "--quiet", &format!("{trimmed}^{{commit}}")]).is_err() {
        return Err(AppError::invalid(format!(
            "“{trimmed}” is not a branch or commit in this project."
        )));
    }

    Ok(())
}
