//! The Shelf — Git's stash, under the name the UI uses for it.

use std::path::Path;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::exec::{git, git_raw};
use crate::models::Stash;

/// Everything currently set aside.
pub fn list(repo: &Path) -> AppResult<Vec<Stash>> {
    let out = git(
        repo,
        &["stash", "list", "--format=%gd\u{1f}%gs\u{1f}%ct"],
    )?;

    let mut stashes = Vec::new();

    for line in out.lines() {
        let fields = super::split_fields(line);
        if fields.len() < 3 {
            continue;
        }

        let id = fields[0].trim().to_string();
        let raw = fields[1].trim();

        // "On feature/x: message" or "WIP on feature/x: 8f2a1c9 subject"
        let (branch, message) = parse_subject(raw);

        stashes.push(Stash {
            file_count: file_count(repo, &id),
            id,
            message,
            branch,
            at: super::seconds_to_millis(fields[2]),
        });
    }

    Ok(stashes)
}

/// Pull the branch and the message out of a stash's subject line.
fn parse_subject(subject: &str) -> (String, String) {
    let body = subject
        .strip_prefix("WIP on ")
        .or_else(|| subject.strip_prefix("On "))
        .unwrap_or(subject);

    match body.split_once(": ") {
        Some((branch, rest)) => (branch.trim().to_string(), rest.trim().to_string()),
        None => (String::new(), body.trim().to_string()),
    }
}

/// How many files one stash holds.
fn file_count(repo: &Path, id: &str) -> u32 {
    git(repo, &["stash", "show", "--name-only", id])
        .map(|out| out.lines().filter(|l| !l.trim().is_empty()).count() as u32)
        .unwrap_or(0)
}

/// Set the current work aside.
pub fn push(repo: &Path, message: &str) -> AppResult<Stash> {
    let message = message.trim();

    // Untracked files are included, because "my project is clean now" is the
    // promise the UI makes — leaving new files behind would break it.
    let mut args: Vec<&str> = vec!["stash", "push", "--include-untracked"];

    if !message.is_empty() {
        args.push("--message");
        args.push(message);
    }

    let out = git_raw(repo, &args)?;

    if !out.ok() {
        return Err(AppError::new(
            ErrorKind::Rejected,
            "Could not set that work aside.",
        )
        .with_detail(&out.stderr));
    }

    if out.stdout.contains("No local changes") {
        return Err(AppError::invalid("There are no changes to set aside."));
    }

    list(repo)?
        .into_iter()
        .next()
        .ok_or_else(|| AppError::new(ErrorKind::Unknown, "The work was set aside but could not be read back."))
}

/// Put shelved work back into the project and take it off the shelf.
pub fn pop(repo: &Path, id: &str) -> AppResult<Vec<String>> {
    validate_id(id)?;

    let out = git_raw(repo, &["stash", "pop", id])?;

    if !out.ok() {
        let conflicted = super::conflicts::conflicted_paths(repo);
        if !conflicted.is_empty() {
            // The work is back but overlaps with current edits. The stash is
            // deliberately kept in that case — Git does the same — so nothing
            // is lost while the user decides.
            return Ok(conflicted);
        }

        if out.stderr.to_lowercase().contains("already exists") {
            return Err(AppError::new(
                ErrorKind::DirtyWorkingTree,
                "Some of those files have been edited since. Commit or discard those edits first, then put this back.",
            )
            .with_detail(&out.stderr));
        }

        return Err(AppError::new(ErrorKind::Rejected, "Could not put that work back.")
            .with_detail(&out.stderr));
    }

    Ok(Vec::new())
}

/// Copy shelved work back without removing it from the shelf.
pub fn apply(repo: &Path, id: &str) -> AppResult<Vec<String>> {
    validate_id(id)?;

    let out = git_raw(repo, &["stash", "apply", id])?;

    if !out.ok() {
        let conflicted = super::conflicts::conflicted_paths(repo);
        if !conflicted.is_empty() {
            return Ok(conflicted);
        }
        return Err(AppError::new(ErrorKind::Rejected, "Could not put that work back.")
            .with_detail(&out.stderr));
    }

    Ok(Vec::new())
}

/// Throw shelved work away for good.
pub fn drop(repo: &Path, id: &str) -> AppResult<()> {
    validate_id(id)?;
    git(repo, &["stash", "drop", id])?;
    Ok(())
}

/// The diff of one shelf entry, so the UI can show what is in it.
pub fn show(repo: &Path, id: &str) -> AppResult<String> {
    validate_id(id)?;
    git(repo, &["stash", "show", "--patch", id])
}

/// Stash ids are Git-generated (`stash@{0}`); anything else is refused rather
/// than passed to Git as a revision.
fn validate_id(id: &str) -> AppResult<()> {
    let id = id.trim();

    if id.is_empty() {
        return Err(AppError::invalid("No shelved work was chosen."));
    }

    let valid = id
        .strip_prefix("stash@{")
        .and_then(|rest| rest.strip_suffix('}'))
        .map(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or(false);

    if !valid {
        return Err(AppError::invalid("That is not something on the shelf."));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_wip_subject() {
        let (branch, message) = parse_subject("WIP on main: 8f2a1c9 add auth");
        assert_eq!(branch, "main");
        assert_eq!(message, "8f2a1c9 add auth");
    }

    #[test]
    fn parses_named_subject() {
        let (branch, message) = parse_subject("On feature/x: half-finished form");
        assert_eq!(branch, "feature/x");
        assert_eq!(message, "half-finished form");
    }

    #[test]
    fn accepts_real_stash_id() {
        assert!(validate_id("stash@{0}").is_ok());
        assert!(validate_id("stash@{12}").is_ok());
    }

    #[test]
    fn rejects_crafted_id() {
        assert!(validate_id("stash@{0}; rm -rf /").is_err());
        assert!(validate_id("--all").is_err());
        assert!(validate_id("HEAD").is_err());
    }
}
