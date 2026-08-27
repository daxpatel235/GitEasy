//! Branches: listing, creating, switching, renaming, deleting, merging,
//! rebasing and comparing.

use std::collections::BTreeMap;
use std::path::Path;

use super::{current_branch, has_commits, validate_branch_name, validate_revision};
use crate::error::{AppError, AppResult, ErrorKind};
use crate::exec::{git, git_raw};
use crate::models::{Branch, BranchCommit, Comparison};

use super::repo::default_branch;

/// Every branch, local and remote-only, with its ahead/behind counts.
///
/// One `for-each-ref` call does the whole job — asking Git per branch turns a
/// 40-branch repository into 120 processes, which is what makes other clients
/// feel slow on open.
pub fn list(repo: &Path) -> AppResult<Vec<Branch>> {
    if !has_commits(repo) {
        // A repository with no commits still has a branch — the unborn one
        // HEAD points at — and the connect dialog needs to offer it.
        let name = current_branch(repo)?;
        return Ok(vec![Branch {
            name,
            is_current: true,
            is_remote_only: false,
            upstream: None,
            ahead: 0,
            behind: 0,
            is_default: true,
            is_protected: false,
            last_commit: None,
        }]);
    }

    let current = current_branch(repo)?;
    let default = default_branch(repo);

    // %(refname:short) name, %(upstream:short), %(upstream:track), subject,
    // author, committer date — separated by the unit separator so any of them
    // can contain spaces.
    const FORMAT: &str = "%(refname:short)\u{1f}%(upstream:short)\u{1f}%(upstream:track,nobracket)\u{1f}%(contents:subject)\u{1f}%(authorname)\u{1f}%(committerdate:unix)";

    let local_out = git(
        repo,
        &["for-each-ref", "--format", FORMAT, "refs/heads"],
    )?;

    let mut branches: Vec<Branch> = Vec::new();
    let mut seen: BTreeMap<String, usize> = BTreeMap::new();

    for line in local_out.lines() {
        let fields = super::split_fields(line);
        if fields.is_empty() || fields[0].trim().is_empty() {
            continue;
        }

        let name = fields[0].trim().to_string();
        let upstream = fields
            .get(1)
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let (ahead, behind) = parse_track(fields.get(2).copied().unwrap_or(""));

        let last_commit = build_commit(
            fields.get(3).copied().unwrap_or(""),
            fields.get(4).copied().unwrap_or(""),
            fields.get(5).copied().unwrap_or(""),
        );

        seen.insert(name.clone(), branches.len());
        branches.push(Branch {
            is_current: name == current,
            is_default: name == default,
            is_protected: false,
            is_remote_only: false,
            name,
            upstream,
            ahead,
            behind,
            last_commit,
        });
    }

    // Remote branches with no local counterpart, so the UI can offer to check
    // one out — "on GitHub only" in the connect dialog.
    let remote_out = git(
        repo,
        &[
            "for-each-ref",
            "--format",
            "%(refname:short)\u{1f}\u{1f}\u{1f}%(contents:subject)\u{1f}%(authorname)\u{1f}%(committerdate:unix)",
            "refs/remotes",
        ],
    )
    .unwrap_or_default();

    for line in remote_out.lines() {
        let fields = super::split_fields(line);
        let Some(full) = fields.first().map(|s| s.trim()) else {
            continue;
        };

        // Skip `origin/HEAD`, which is a pointer rather than a branch.
        if full.is_empty() || full.ends_with("/HEAD") {
            continue;
        }

        // Strip the remote name: `origin/feature/x` -> `feature/x`.
        let Some((_remote, short)) = full.split_once('/') else {
            continue;
        };

        if short.is_empty() || seen.contains_key(short) {
            continue;
        }

        seen.insert(short.to_string(), branches.len());
        branches.push(Branch {
            name: short.to_string(),
            is_current: false,
            is_remote_only: true,
            upstream: Some(full.to_string()),
            ahead: 0,
            behind: 0,
            is_default: short == default,
            is_protected: false,
            last_commit: build_commit(
                fields.get(3).copied().unwrap_or(""),
                fields.get(4).copied().unwrap_or(""),
                fields.get(5).copied().unwrap_or(""),
            ),
        });
    }

    // The default branch is the one destructive actions are guarded on, so it
    // is marked protected even without GitHub's answer. `gh` refines this when
    // the user is signed in — see `github::branch_protection`.
    for branch in branches.iter_mut() {
        if branch.is_default {
            branch.is_protected = true;
        }
    }

    branches.sort_by(|a, b| {
        b.is_current
            .cmp(&a.is_current)
            .then(b.is_default.cmp(&a.is_default))
            .then_with(|| {
                let a_at = a.last_commit.as_ref().map(|c| c.at).unwrap_or(0);
                let b_at = b.last_commit.as_ref().map(|c| c.at).unwrap_or(0);
                b_at.cmp(&a_at)
            })
    });

    Ok(branches)
}

fn build_commit(subject: &str, author: &str, at: &str) -> Option<BranchCommit> {
    if subject.trim().is_empty() && author.trim().is_empty() {
        return None;
    }
    Some(BranchCommit {
        message: subject.trim().to_string(),
        author: author.trim().to_string(),
        at: super::seconds_to_millis(at),
    })
}

/// Parse `%(upstream:track,nobracket)`, e.g. "ahead 2, behind 6".
fn parse_track(track: &str) -> (u32, u32) {
    let mut ahead = 0;
    let mut behind = 0;

    for part in track.split(',') {
        let part = part.trim();
        if let Some(rest) = part.strip_prefix("ahead ") {
            ahead = rest.trim().parse().unwrap_or(0);
        } else if let Some(rest) = part.strip_prefix("behind ") {
            behind = rest.trim().parse().unwrap_or(0);
        }
    }

    (ahead, behind)
}

/// Create a branch and switch to it.
pub fn create(repo: &Path, name: &str, from: &str) -> AppResult<Branch> {
    let name = name.trim();
    validate_branch_name(repo, name)?;

    if exists(repo, name) {
        return Err(AppError::invalid(format!(
            "A branch called “{name}” already exists. Pick another name."
        )));
    }

    if !has_commits(repo) {
        // Before the first commit there is nothing to branch from, so this
        // renames the unborn branch instead — the result the user expects.
        git(repo, &["checkout", "-b", name])?;
        return find(repo, name);
    }

    let from = from.trim();
    let start = if from.is_empty() {
        current_branch(repo)?
    } else {
        validate_revision(repo, from)?;
        from.to_string()
    };

    git(repo, &["checkout", "-b", name, &start])?;
    find(repo, name)
}

/// Switch to an existing branch, checking out a remote one if needed.
pub fn switch(repo: &Path, name: &str) -> AppResult<()> {
    let name = name.trim();

    if name.is_empty() || name.starts_with('-') {
        return Err(AppError::invalid("That is not a valid branch name."));
    }

    if name == current_branch(repo)? {
        return Ok(());
    }

    // Local branch: a plain checkout.
    if exists(repo, name) {
        let out = git_raw(repo, &["checkout", name])?;
        if out.ok() {
            return Ok(());
        }
        return Err(switch_error(&out.stderr));
    }

    // Remote-only: create a local branch tracking it, which is what the
    // "On GitHub only" rows in the connect dialog offer.
    for remote in ["origin", "upstream"] {
        let remote_ref = format!("{remote}/{name}");
        if git(repo, &["rev-parse", "--verify", "--quiet", &remote_ref]).is_ok() {
            let out = git_raw(repo, &["checkout", "--track", &remote_ref])?;
            if out.ok() {
                return Ok(());
            }
            return Err(switch_error(&out.stderr));
        }
    }

    Err(AppError::invalid(format!(
        "There is no branch called “{name}”."
    )))
}

fn switch_error(stderr: &str) -> AppError {
    let lower = stderr.to_lowercase();

    if lower.contains("local changes") || lower.contains("would be overwritten") {
        AppError::new(
            ErrorKind::DirtyWorkingTree,
            "Your unsaved edits would be overwritten by switching. Commit them, or set them aside on the Shelf first.",
        )
        .with_detail(stderr)
    } else {
        AppError::new(ErrorKind::Rejected, "Could not switch branch.").with_detail(stderr)
    }
}

/// Rename a branch.
pub fn rename(repo: &Path, from: &str, to: &str) -> AppResult<()> {
    let from = from.trim();
    let to = to.trim();

    validate_branch_name(repo, to)?;

    if !exists(repo, from) {
        return Err(AppError::invalid(format!("There is no branch called “{from}”.")));
    }

    if exists(repo, to) {
        return Err(AppError::invalid(format!(
            "A branch called “{to}” already exists."
        )));
    }

    git(repo, &["branch", "--move", from, to])?;
    Ok(())
}

/// Delete a branch.
///
/// Refuses the branch you are on and the default branch, and will not throw
/// away unmerged work unless `force` is set — the UI counts that work first and
/// says so before offering the option.
pub fn delete(repo: &Path, name: &str, force: bool) -> AppResult<()> {
    let name = name.trim();

    if name.is_empty() || name.starts_with('-') {
        return Err(AppError::invalid("That is not a valid branch name."));
    }

    if name == current_branch(repo)? {
        return Err(AppError::invalid(
            "You are on that branch. Switch to another one first, then delete it.",
        ));
    }

    if name == default_branch(repo) {
        return Err(AppError::invalid(
            "That is the project's main branch. Deleting it would leave the project without a trunk.",
        ));
    }

    if !exists(repo, name) {
        return Err(AppError::invalid(format!("There is no branch called “{name}”.")));
    }

    let flag = if force { "-D" } else { "--delete" };
    let out = git_raw(repo, &["branch", flag, name])?;

    if !out.ok() {
        if out.stderr.to_lowercase().contains("not fully merged") {
            let count = unmerged_count(repo, name);
            return Err(AppError::new(
                ErrorKind::Rejected,
                format!(
                    "“{name}” has {count} commit{} that {} nowhere else. Deleting it would lose that work for good.",
                    if count == 1 { "" } else { "s" },
                    if count == 1 { "exists" } else { "exist" }
                ),
            )
            .with_detail(&out.stderr));
        }
        return Err(AppError::new(ErrorKind::Rejected, "Could not delete that branch.")
            .with_detail(&out.stderr));
    }

    Ok(())
}

/// How many commits on `name` are not on any other branch — the number the UI
/// shows before a guarded delete.
pub fn unmerged_count(repo: &Path, name: &str) -> u32 {
    let default = default_branch(repo);
    let range = format!("{default}..{name}");

    git(repo, &["rev-list", "--count", &range])
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0)
}

/// Merge `from` into the current branch.
///
/// Returns the conflicted paths rather than an error when Git stops on a
/// conflict, because that is a normal outcome the conflict resolver handles.
pub fn merge(repo: &Path, from: &str) -> AppResult<Vec<String>> {
    let from = from.trim();
    validate_revision(repo, from)?;

    if from == current_branch(repo)? {
        return Err(AppError::invalid("That is the branch you are already on."));
    }

    let out = git_raw(repo, &["merge", "--no-edit", from])?;

    if !out.ok() {
        let conflicted = super::conflicts::conflicted_paths(repo);
        if !conflicted.is_empty() {
            return Ok(conflicted);
        }

        let lower = out.stderr.to_lowercase();
        if lower.contains("local changes") || lower.contains("would be overwritten") {
            return Err(AppError::new(
                ErrorKind::DirtyWorkingTree,
                "Your unsaved edits would be overwritten by the merge. Commit them, or set them aside on the Shelf first.",
            )
            .with_detail(&out.stderr));
        }

        return Err(AppError::new(ErrorKind::Rejected, "Could not merge that branch.")
            .with_detail(&out.stderr));
    }

    Ok(Vec::new())
}

/// Replay the current branch's commits on top of `onto`.
pub fn rebase(repo: &Path, onto: &str) -> AppResult<Vec<String>> {
    let onto = onto.trim();
    validate_revision(repo, onto)?;

    let out = git_raw(repo, &["rebase", onto])?;

    if !out.ok() {
        let conflicted = super::conflicts::conflicted_paths(repo);
        if !conflicted.is_empty() {
            return Ok(conflicted);
        }
        return Err(AppError::new(ErrorKind::Rejected, "Could not rebase.").with_detail(&out.stderr));
    }

    Ok(Vec::new())
}

/// Compare two refs: how far apart they are, and what differs.
pub fn compare(repo: &Path, base: &str, head: &str) -> AppResult<Comparison> {
    validate_revision(repo, base)?;
    validate_revision(repo, head)?;

    let range = format!("{base}...{head}");

    // `--left-right --count` gives "behind<TAB>ahead" for a symmetric range.
    let counts = git(repo, &["rev-list", "--left-right", "--count", &range])?;
    let mut parts = counts.split_whitespace();
    let behind: u32 = parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    let ahead: u32 = parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);

    let commits = super::history::log_range(repo, &format!("{base}..{head}"), 200)?;
    let files = super::history::diff_files(repo, base, head)?;

    Ok(Comparison {
        base: base.to_string(),
        head: head.to_string(),
        ahead,
        behind,
        commits,
        files,
    })
}

/// Whether a local branch exists.
pub fn exists(repo: &Path, name: &str) -> bool {
    if name.trim().is_empty() {
        return false;
    }
    git(
        repo,
        &["show-ref", "--verify", "--quiet", &format!("refs/heads/{}", name.trim())],
    )
    .is_ok()
}

/// Read one branch back out of the list, for the create/return contract.
fn find(repo: &Path, name: &str) -> AppResult<Branch> {
    list(repo)?
        .into_iter()
        .find(|b| b.name == name)
        .ok_or_else(|| AppError::new(ErrorKind::Unknown, "The branch was created but could not be read back."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ahead_and_behind() {
        assert_eq!(parse_track("ahead 2, behind 6"), (2, 6));
    }

    #[test]
    fn parses_ahead_only() {
        assert_eq!(parse_track("ahead 3"), (3, 0));
    }

    #[test]
    fn parses_behind_only() {
        assert_eq!(parse_track("behind 5"), (0, 5));
    }

    #[test]
    fn parses_up_to_date() {
        assert_eq!(parse_track(""), (0, 0));
        assert_eq!(parse_track("="), (0, 0));
    }

    #[test]
    fn builds_no_commit_from_blank_fields() {
        assert!(build_commit("", "", "0").is_none());
    }
}
