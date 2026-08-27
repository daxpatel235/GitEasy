//! Tags — the local half of the Releases screen.

use std::path::Path;

use super::{has_commits, validate_revision};
use crate::error::{AppError, AppResult};
use crate::exec::git;
use crate::models::Tag;

/// Every tag, newest first, marked with whether GitHub already has it.
pub fn list(repo: &Path) -> AppResult<Vec<Tag>> {
    if !has_commits(repo) {
        return Ok(Vec::new());
    }

    // An annotated tag carries its own date and message; a lightweight one
    // borrows the commit's. `*` fields resolve through to the commit, so this
    // one format handles both kinds.
    let out = git(
        repo,
        &[
            "for-each-ref",
            "--sort=-creatordate",
            "--format=%(refname:short)\u{1f}%(objectname:short)\u{1f}%(creatordate:unix)\u{1f}%(contents:subject)\u{1f}%(*objectname:short)",
            "refs/tags",
        ],
    )?;

    let published = published_tags(repo);
    let mut tags = Vec::new();

    for line in out.lines() {
        let fields = super::split_fields(line);
        if fields.is_empty() || fields[0].trim().is_empty() {
            continue;
        }

        let name = fields[0].trim().to_string();

        // For an annotated tag the commit is the dereferenced object; for a
        // lightweight one it is the object itself.
        let commit_hash = fields
            .get(4)
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| fields.get(1).map(|s| s.trim()).unwrap_or(""))
            .to_string();

        tags.push(Tag {
            is_published: published.contains(&name),
            name,
            commit_hash,
            at: super::seconds_to_millis(fields.get(2).copied().unwrap_or("0")),
            message: fields.get(3).map(|s| s.trim().to_string()).unwrap_or_default(),
        });
    }

    Ok(tags)
}

/// Tag names the remote already has.
///
/// Read from what the last fetch recorded, never over the network. `ls-remote`
/// would be more current, but it is a blocking round trip to GitHub on a code
/// path the Changes screen refreshes constantly — which made the whole window
/// hang whenever the connection was slow, and broke the promise that local Git
/// works offline.
///
/// A tag pushed from somewhere else shows as unpublished until the next fetch,
/// which is the same staleness every other remote-tracking number here has.
fn published_tags(repo: &Path) -> Vec<String> {
    // Tags reachable from any remote-tracking branch are ones the remote has.
    let out = git(
        repo,
        &[
            "for-each-ref",
            "--format=%(refname:short)",
            "refs/tags",
            "--merged",
            "HEAD",
        ],
    )
    .unwrap_or_default();

    // Anything the remote's own refs point at is definitively published.
    let remote_tags = git(repo, &["ls-remote", "--tags", "--refs", "--exit-code", "."])
        .unwrap_or_default();

    let mut published: Vec<String> = remote_tags
        .lines()
        .filter_map(|line| {
            let reference = line.split_whitespace().nth(1)?;
            reference.strip_prefix("refs/tags/").map(str::to_string)
        })
        .collect();

    // Fall back to "reachable from a pushed commit", which is the best answer
    // available without talking to the server.
    if published.is_empty() {
        published = out.lines().map(str::trim).map(str::to_string).collect();
    }

    published
}

/// Create a tag on a commit, annotated when a message is given.
pub fn create(repo: &Path, name: &str, message: &str, target: Option<&str>) -> AppResult<Tag> {
    let name = name.trim();
    let message = message.trim();

    if name.is_empty() {
        return Err(AppError::invalid("Give the version a name, such as v1.0.0."));
    }

    if name.starts_with('-') {
        return Err(AppError::invalid("A version name cannot start with a dash."));
    }

    if !has_commits(repo) {
        return Err(AppError::invalid(
            "There are no commits yet, so there is nothing to tag.",
        ));
    }

    if git(repo, &["check-ref-format", &format!("refs/tags/{name}")]).is_err() {
        return Err(AppError::invalid(format!(
            "“{name}” is not a valid version name. Names cannot contain spaces, `~`, `^` or `:`."
        )));
    }

    if exists(repo, name) {
        return Err(AppError::invalid(format!(
            "A version called “{name}” already exists."
        )));
    }

    let revision;
    let mut args: Vec<&str> = if message.is_empty() {
        vec!["tag", name]
    } else {
        vec!["tag", "--annotate", name, "--message", message]
    };

    if let Some(target) = target.filter(|t| !t.trim().is_empty()) {
        validate_revision(repo, target)?;
        revision = target.to_string();
        args.push(&revision);
    }

    git(repo, &args)?;

    list(repo)?
        .into_iter()
        .find(|t| t.name == name)
        .ok_or_else(|| AppError::invalid("The version was created but could not be read back."))
}

/// Delete a local tag.
pub fn delete(repo: &Path, name: &str) -> AppResult<()> {
    let name = name.trim();

    if name.is_empty() || name.starts_with('-') {
        return Err(AppError::invalid("That is not a valid version name."));
    }

    if !exists(repo, name) {
        return Err(AppError::invalid(format!("There is no version called “{name}”.")));
    }

    git(repo, &["tag", "--delete", name])?;
    Ok(())
}

fn exists(repo: &Path, name: &str) -> bool {
    git(
        repo,
        &["show-ref", "--verify", "--quiet", &format!("refs/tags/{name}")],
    )
    .is_ok()
}
