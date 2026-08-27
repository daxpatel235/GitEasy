//! Everything that talks to a server: remotes, fetch, pull, push, and the
//! ahead/behind state the title bar, Overview and Sync all read.

use std::path::Path;

use super::{current_branch, has_commits};
use crate::error::{AppError, AppResult, ErrorKind};
use crate::exec::{git, git_raw};
use crate::models::{PushResult, Remote, SyncState};

use super::repo::parse_github_url;

/// Every configured remote, with `origin` and `upstream` given their roles.
pub fn list(repo: &Path) -> AppResult<Vec<Remote>> {
    let out = git(repo, &["remote", "--verbose"])?;

    let mut remotes: Vec<Remote> = Vec::new();

    for line in out.lines() {
        // "origin\thttps://github.com/o/r.git (fetch)"
        let mut parts = line.split_whitespace();
        let (Some(name), Some(url)) = (parts.next(), parts.next()) else {
            continue;
        };

        if remotes.iter().any(|r| r.name == name) {
            continue;
        }

        remotes.push(Remote {
            role: match name {
                "origin" => "origin",
                "upstream" => "upstream",
                _ => "other",
            }
            .to_string(),
            name: name.to_string(),
            url: url.to_string(),
        });
    }

    Ok(remotes)
}

/// Add a remote.
pub fn add(repo: &Path, name: &str, url: &str) -> AppResult<()> {
    let name = name.trim();
    let url = url.trim();

    validate_remote_name(name)?;
    validate_remote_url(url)?;

    if list(repo)?.iter().any(|r| r.name == name) {
        return Err(AppError::invalid(format!(
            "A remote called “{name}” already exists. Remove it first, or pick another name."
        )));
    }

    git(repo, &["remote", "add", "--", name, url])?;
    Ok(())
}

/// Point an existing remote at a different URL.
pub fn set_url(repo: &Path, name: &str, url: &str) -> AppResult<()> {
    let name = name.trim();
    let url = url.trim();

    validate_remote_name(name)?;
    validate_remote_url(url)?;

    if !list(repo)?.iter().any(|r| r.name == name) {
        return Err(AppError::invalid(format!("There is no remote called “{name}”.")));
    }

    git(repo, &["remote", "set-url", "--", name, url])?;
    Ok(())
}

/// Remove a remote.
pub fn remove(repo: &Path, name: &str) -> AppResult<()> {
    let name = name.trim();
    validate_remote_name(name)?;

    if !list(repo)?.iter().any(|r| r.name == name) {
        return Err(AppError::invalid(format!("There is no remote called “{name}”.")));
    }

    git(repo, &["remote", "remove", name])?;
    Ok(())
}

fn validate_remote_name(name: &str) -> AppResult<()> {
    if name.is_empty() {
        return Err(AppError::invalid("Give the remote a name, such as `upstream`."));
    }
    if name.starts_with('-') {
        return Err(AppError::invalid("A remote name cannot start with a dash."));
    }
    if name.contains(char::is_whitespace) || name.contains('/') {
        return Err(AppError::invalid(
            "A remote name cannot contain spaces or slashes — try `upstream`.",
        ));
    }
    Ok(())
}

fn validate_remote_url(url: &str) -> AppResult<()> {
    if url.is_empty() {
        return Err(AppError::invalid("Paste the address of the other copy."));
    }
    if url.starts_with('-') {
        return Err(AppError::invalid("That does not look like a valid address."));
    }

    let allowed = url.starts_with("https://")
        || url.starts_with("http://")
        || url.starts_with("git@")
        || url.starts_with("ssh://")
        || url.starts_with("git://");

    if !allowed {
        return Err(AppError::invalid(
            "That does not look like a project address. It should start with https:// or git@.",
        ));
    }

    Ok(())
}

/// Check every remote for new work without touching any local file.
pub fn fetch(repo: &Path) -> AppResult<SyncState> {
    if list(repo)?.is_empty() {
        // No remote is a normal state, not a failure — a local-only project
        // still gets a sync state, just an empty one.
        return sync_state(repo);
    }

    let out = git_raw(repo, &["fetch", "--all", "--prune", "--tags"])?;

    if !out.ok() {
        let lower = out.stderr.to_lowercase();
        let kind = if lower.contains("could not resolve host")
            || lower.contains("failed to connect")
            || lower.contains("network is unreachable")
            || lower.contains("timed out")
        {
            ErrorKind::Network
        } else if lower.contains("authentication") || lower.contains("terminal prompts disabled") {
            ErrorKind::NotAuthenticated
        } else {
            ErrorKind::Rejected
        };

        let message = match kind {
            ErrorKind::Network => "Could not reach GitHub. Everything on this computer still works.",
            ErrorKind::NotAuthenticated => {
                "GitHub would not accept the connection. Sign in from Settings, then try again."
            }
            _ => "Could not check GitHub for updates.",
        };

        return Err(AppError::new(kind, message).with_detail(&out.stderr));
    }

    sync_state(repo)
}

/// Ahead/behind against `origin`, plus how far behind the fork's upstream is.
pub fn sync_state(repo: &Path) -> AppResult<SyncState> {
    let has_blocking_changes = super::status::has_blocking_changes(repo);

    if !has_commits(repo) {
        return Ok(SyncState {
            ahead: 0,
            behind: 0,
            upstream_behind: 0,
            last_checked_at: last_fetch_at(repo),
            has_blocking_changes,
        });
    }

    let branch = current_branch(repo)?;

    // Prefer the branch's configured upstream; fall back to origin/<branch>.
    let tracking = git(
        repo,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    )
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .or_else(|| {
        let guess = format!("origin/{branch}");
        git(repo, &["rev-parse", "--verify", "--quiet", &guess])
            .ok()
            .map(|_| guess)
    });

    let (ahead, behind) = match tracking.as_deref() {
        Some(upstream) => count_ahead_behind(repo, upstream, "HEAD"),
        // Never pushed: every commit on the branch is ahead.
        None => (
            git(repo, &["rev-list", "--count", "HEAD"])
                .ok()
                .and_then(|s| s.trim().parse().ok())
                .unwrap_or(0),
            0,
        ),
    };

    Ok(SyncState {
        ahead,
        behind,
        upstream_behind: upstream_behind(repo, &branch),
        last_checked_at: last_fetch_at(repo),
        has_blocking_changes,
    })
}

/// `(ahead, behind)` of `head` relative to `base`.
fn count_ahead_behind(repo: &Path, base: &str, head: &str) -> (u32, u32) {
    let range = format!("{base}...{head}");

    let Ok(out) = git(repo, &["rev-list", "--left-right", "--count", &range]) else {
        return (0, 0);
    };

    let mut parts = out.split_whitespace();
    let behind = parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    let ahead = parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    (ahead, behind)
}

/// How many commits the original project has that this fork does not.
fn upstream_behind(repo: &Path, branch: &str) -> u32 {
    if git(repo, &["remote", "get-url", "upstream"]).is_err() {
        return 0;
    }

    // Compare against the upstream's own default branch where possible.
    let upstream_default = git(repo, &["symbolic-ref", "--short", "refs/remotes/upstream/HEAD"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("upstream/{branch}"));

    if git(repo, &["rev-parse", "--verify", "--quiet", &upstream_default]).is_err() {
        return 0;
    }

    let range = format!("HEAD..{upstream_default}");
    git(repo, &["rev-list", "--count", &range])
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0)
}

/// When the remote was last contacted, from FETCH_HEAD's timestamp.
fn last_fetch_at(repo: &Path) -> Option<i64> {
    let marker = repo.join(".git").join("FETCH_HEAD");
    let meta = std::fs::metadata(marker).ok()?;
    let modified = meta.modified().ok()?;
    let since = modified.duration_since(std::time::UNIX_EPOCH).ok()?;
    Some(since.as_millis() as i64)
}

/// Bring down and integrate the remote's work.
///
/// Returns the conflicted paths rather than an error when the merge stops —
/// that is the conflict resolver's cue, not a failure.
pub fn pull(repo: &Path, strategy: &str) -> AppResult<Vec<String>> {
    let flag = match strategy {
        "rebase" => "--rebase",
        "merge" | "" => "--no-rebase",
        _ => return Err(AppError::invalid("Choose either merge or rebase.")),
    };

    if list(repo)?.is_empty() {
        return Err(AppError::invalid(
            "This project is not connected to GitHub yet. Add a remote from Sync first.",
        ));
    }

    let out = git_raw(repo, &["pull", flag, "--no-edit"])?;

    if !out.ok() {
        let conflicted = super::conflicts::conflicted_paths(repo);
        if !conflicted.is_empty() {
            return Ok(conflicted);
        }

        let lower = out.stderr.to_lowercase();

        if lower.contains("no tracking information") || lower.contains("no such ref") {
            return Err(AppError::invalid(
                "This branch is not connected to one on GitHub yet. Push it first, and GitEasy will link the two.",
            ));
        }

        if lower.contains("local changes") || lower.contains("would be overwritten") {
            return Err(AppError::new(
                ErrorKind::DirtyWorkingTree,
                "Your unsaved edits would be overwritten. Commit them, or set them aside on the Shelf, then pull again.",
            )
            .with_detail(&out.stderr));
        }

        if lower.contains("could not resolve host") || lower.contains("failed to connect") {
            return Err(AppError::new(
                ErrorKind::Network,
                "Could not reach GitHub. Everything on this computer still works.",
            )
            .with_detail(&out.stderr));
        }

        return Err(AppError::new(ErrorKind::Rejected, "Could not pull from GitHub.")
            .with_detail(&out.stderr));
    }

    Ok(Vec::new())
}

/// Send local commits to the remote.
///
/// `force` is `--force-with-lease`, never a bare `--force`: if somebody else
/// pushed in the meantime, the push is refused rather than overwriting work
/// that was never on this machine.
pub fn push(repo: &Path, force: bool) -> AppResult<PushResult> {
    if !has_commits(repo) {
        return Err(AppError::invalid(
            "There are no commits yet. Commit something first, then push.",
        ));
    }

    if git(repo, &["remote", "get-url", "origin"]).is_err() {
        return Err(AppError::invalid(
            "This project is not connected to GitHub yet. Add a remote from Sync first.",
        ));
    }

    let branch = current_branch(repo)?;
    let pending = super::commits::pending_commits(repo)?;

    let file_count: usize = pending.iter().map(|s| s.files.len()).sum();
    let message = pending
        .last()
        .map(|s| s.message.clone())
        .unwrap_or_default();

    let mut args: Vec<&str> = vec!["push", "--set-upstream", "origin"];
    if force {
        args.push("--force-with-lease");
    }
    args.push(&branch);

    let out = git_raw(repo, &args)?;

    if !out.ok() {
        let lower = out.stderr.to_lowercase();

        if lower.contains("non-fast-forward") || lower.contains("fetch first") || lower.contains("rejected") {
            return Err(AppError::new(
                ErrorKind::Rejected,
                "GitHub has commits this branch does not. Pull first to bring them in, then push again.",
            )
            .with_detail(&out.stderr));
        }

        if lower.contains("stale info") {
            return Err(AppError::new(
                ErrorKind::Rejected,
                "Somebody else pushed while you were working. Pull to see their work before overwriting anything.",
            )
            .with_detail(&out.stderr));
        }

        if lower.contains("protected branch") || lower.contains("pre-receive hook declined") {
            return Err(AppError::new(
                ErrorKind::Rejected,
                format!("GitHub protects {branch}, so changes have to arrive through a pull request."),
            )
            .with_detail(&out.stderr));
        }

        if lower.contains("could not resolve host") || lower.contains("failed to connect") {
            return Err(AppError::new(
                ErrorKind::Network,
                "Could not reach GitHub. Your commits are safe on this computer — try again when you are online.",
            )
            .with_detail(&out.stderr));
        }

        if lower.contains("authentication")
            || lower.contains("could not read username")
            || lower.contains("terminal prompts disabled")
            || lower.contains("permission denied")
        {
            return Err(AppError::new(
                ErrorKind::NotAuthenticated,
                "GitHub would not accept the push. Sign in from Settings, then try again.",
            )
            .with_detail(&out.stderr));
        }

        return Err(AppError::new(ErrorKind::Rejected, "Could not push to GitHub.")
            .with_detail(&out.stderr));
    }

    let commit_url = git(repo, &["remote", "get-url", "origin"])
        .ok()
        .as_deref()
        .and_then(parse_github_url)
        .map(|base| format!("{base}/commits/{branch}"));

    Ok(PushResult {
        message,
        file_count,
        commit_url,
    })
}

/// Push tags, so a tag created locally becomes a release on GitHub.
pub fn push_tags(repo: &Path) -> AppResult<()> {
    if git(repo, &["remote", "get-url", "origin"]).is_err() {
        return Err(AppError::invalid(
            "This project is not connected to GitHub yet.",
        ));
    }

    git(repo, &["push", "origin", "--tags"])?;
    Ok(())
}

/// Merge the original project's latest work into this fork.
pub fn sync_fork(repo: &Path) -> AppResult<Vec<String>> {
    if git(repo, &["remote", "get-url", "upstream"]).is_err() {
        return Err(AppError::invalid(
            "This project has no `upstream` remote, so there is no original project to pull from. Add one from Sync.",
        ));
    }

    let fetched = git_raw(repo, &["fetch", "upstream", "--prune"])?;
    if !fetched.ok() {
        return Err(AppError::new(
            ErrorKind::Network,
            "Could not reach the original project on GitHub.",
        )
        .with_detail(&fetched.stderr));
    }

    let branch = current_branch(repo)?;

    // Merge the matching branch on the upstream, falling back to its default.
    let candidate = format!("upstream/{branch}");
    let target = if git(repo, &["rev-parse", "--verify", "--quiet", &candidate]).is_ok() {
        candidate
    } else {
        let default = git(repo, &["symbolic-ref", "--short", "refs/remotes/upstream/HEAD"])
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "upstream/main".to_string());

        if git(repo, &["rev-parse", "--verify", "--quiet", &default]).is_err() {
            return Err(AppError::invalid(
                "Could not work out which branch of the original project to pull from.",
            ));
        }
        default
    };

    let out = git_raw(repo, &["merge", "--no-edit", &target])?;

    if !out.ok() {
        let conflicted = super::conflicts::conflicted_paths(repo);
        if !conflicted.is_empty() {
            return Ok(conflicted);
        }

        if out.stderr.to_lowercase().contains("local changes") {
            return Err(AppError::new(
                ErrorKind::DirtyWorkingTree,
                "Your unsaved edits would be overwritten. Commit them, or set them aside on the Shelf first.",
            )
            .with_detail(&out.stderr));
        }

        return Err(AppError::new(
            ErrorKind::Rejected,
            "Could not merge the original project's work.",
        )
        .with_detail(&out.stderr));
    }

    Ok(Vec::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_remote_name_with_slash() {
        assert!(validate_remote_name("origin/main").is_err());
    }

    #[test]
    fn rejects_remote_name_starting_with_dash() {
        assert!(validate_remote_name("--upload-pack=evil").is_err());
    }

    #[test]
    fn accepts_ordinary_remote_name() {
        assert!(validate_remote_name("upstream").is_ok());
    }

    #[test]
    fn rejects_non_url() {
        assert!(validate_remote_url("../../etc/passwd").is_err());
    }

    #[test]
    fn accepts_https_and_ssh_urls() {
        assert!(validate_remote_url("https://github.com/o/r.git").is_ok());
        assert!(validate_remote_url("git@github.com:o/r.git").is_ok());
    }
}
