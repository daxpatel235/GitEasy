//! Conflicts: finding them, showing both sides, resolving them, and finishing
//! or abandoning the operation that caused them.
//!
//! The three versions come from Git's index stages, not from parsing `<<<<<<<`
//! markers out of the file: stage 1 is the common ancestor, stage 2 is ours,
//! stage 3 is theirs. Reading the index means the sides are correct even when
//! the file has no markers in it at all (a delete/modify conflict, say).

use std::path::Path;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::exec::{git, git_raw};
use crate::models::{Conflict, RepoOperation};

/// Paths Git currently reports as unmerged.
pub fn conflicted_paths(repo: &Path) -> Vec<String> {
    let Ok(out) = git(repo, &["diff", "--name-only", "--diff-filter=U"]) else {
        return Vec::new();
    };

    out.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect()
}

/// Every conflicted file, with all three versions.
pub fn list(repo: &Path) -> AppResult<Vec<Conflict>> {
    let paths = conflicted_paths(repo);
    let mut conflicts = Vec::with_capacity(paths.len());

    for path in paths {
        conflicts.push(Conflict {
            mine: stage_lines(repo, &path, 2),
            theirs: stage_lines(repo, &path, 3),
            base: stage_lines(repo, &path, 1),
            path,
            choice: None,
        });
    }

    Ok(conflicts)
}

/// Read one index stage of a conflicted file as lines.
///
/// An empty result is meaningful: a file added on only one side has no stage 1,
/// and one deleted on a side has no stage for it either. The UI renders that as
/// an empty column, which is the truth.
fn stage_lines(repo: &Path, path: &str, stage: u8) -> Vec<String> {
    let spec = format!(":{stage}:{path}");

    let Ok(out) = git(repo, &["show", &spec]) else {
        return Vec::new();
    };

    if out.is_empty() {
        return Vec::new();
    }

    out.lines().map(str::to_string).collect()
}

/// Resolve one file by keeping one side wholesale.
///
/// "Manual resolution" needs nothing here — the user edits the file in their
/// editor and the conflict disappears from the list once the markers are gone
/// and the file is staged, which [`mark_resolved`] does.
pub fn resolve(repo: &Path, path: &str, keep: &str) -> AppResult<()> {
    if path.trim().is_empty() {
        return Err(AppError::invalid("No file was given."));
    }

    if !conflicted_paths(repo).iter().any(|p| p == path) {
        return Err(AppError::invalid(
            "That file is no longer waiting on a decision.",
        ));
    }

    let stage = match keep {
        "mine" | "ours" => "--ours",
        "theirs" => "--theirs",
        _ => {
            return Err(AppError::invalid(
                "Choose which version to keep — yours or theirs.",
            ))
        }
    };

    // `checkout --ours/--theirs` writes the chosen side into the working tree.
    // A file deleted on the chosen side has no content to check out, so the
    // fallback removes it, which is the correct resolution of a delete/modify.
    if git(repo, &["checkout", stage, "--", path]).is_err() {
        git(repo, &["rm", "--force", "--", path])?;
        return Ok(());
    }

    git(repo, &["add", "--", path])?;
    Ok(())
}

/// Mark a file the user edited by hand as resolved.
pub fn mark_resolved(repo: &Path, path: &str) -> AppResult<()> {
    if path.trim().is_empty() {
        return Err(AppError::invalid("No file was given."));
    }

    // Refuse while the file still has markers in it — staging that would commit
    // `<<<<<<<` into the project, which is the mistake this app exists to stop.
    let full = repo.join(path);
    if let Ok(text) = std::fs::read_to_string(&full) {
        if text.lines().any(|l| l.starts_with("<<<<<<< ") || l.starts_with(">>>>>>> ")) {
            return Err(AppError::invalid(
                "That file still has conflict markers in it. Remove the <<<<<<< and >>>>>>> lines, keeping the version you want, then mark it resolved.",
            ));
        }
    }

    git(repo, &["add", "--", path])?;
    Ok(())
}

/// The file's raw contents, for a manual-resolution editor.
pub fn file_contents(repo: &Path, path: &str) -> AppResult<String> {
    let full = repo.join(path);
    std::fs::read_to_string(&full)
        .map_err(|e| AppError::invalid(format!("Could not read that file ({e})")))
}

/// Write a manually resolved file back and stage it.
pub fn write_resolution(repo: &Path, path: &str, contents: &str) -> AppResult<()> {
    if path.trim().is_empty() {
        return Err(AppError::invalid("No file was given."));
    }

    // Keep the write inside the repository, so a crafted path cannot reach the
    // rest of the disk.
    let full = repo.join(path);
    let canonical_repo = repo.canonicalize().unwrap_or_else(|_| repo.to_path_buf());

    if let Some(parent) = full.parent() {
        let canonical_parent = parent.canonicalize().unwrap_or_else(|_| parent.to_path_buf());
        if !canonical_parent.starts_with(&canonical_repo) {
            return Err(AppError::invalid("That file is outside the project."));
        }
    }

    std::fs::write(&full, contents)
        .map_err(|e| AppError::invalid(format!("Could not save that file ({e})")))?;

    mark_resolved(repo, path)
}

/// Which operation, if any, the repository is in the middle of.
pub fn operation(repo: &Path) -> RepoOperation {
    let git_dir = repo.join(".git");

    let kind = if git_dir.join("MERGE_HEAD").exists() {
        "merge"
    } else if git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists() {
        "rebase"
    } else if git_dir.join("CHERRY_PICK_HEAD").exists() {
        "cherry-pick"
    } else if git_dir.join("REVERT_HEAD").exists() {
        "revert"
    } else {
        "none"
    };

    RepoOperation {
        kind: kind.to_string(),
        conflicted_files: conflicted_paths(repo),
    }
}

/// Finish the operation that stopped on conflicts.
pub fn cont(repo: &Path) -> AppResult<()> {
    let remaining = conflicted_paths(repo);
    if !remaining.is_empty() {
        return Err(AppError::new(
            ErrorKind::Conflict,
            format!(
                "{} file{} still waiting on a decision.",
                remaining.len(),
                if remaining.len() == 1 { " is" } else { "s are" }
            ),
        ));
    }

    let op = operation(repo);

    let out = match op.kind.as_str() {
        "rebase" => git_raw(repo, &["rebase", "--continue"])?,
        "cherry-pick" => git_raw(repo, &["cherry-pick", "--continue", "--no-edit"])?,
        "revert" => git_raw(repo, &["revert", "--continue", "--no-edit"])?,
        "merge" => {
            // A merge finishes with a commit; --no-edit keeps Git's own message.
            git_raw(repo, &["commit", "--no-edit"])?
        }
        _ => {
            return Err(AppError::invalid(
                "There is nothing in progress to finish.",
            ))
        }
    };

    if !out.ok() {
        // "nothing to commit" after a resolution that cancelled out is a
        // success as far as the user is concerned.
        if out.stderr.to_lowercase().contains("nothing to commit")
            || out.stdout.to_lowercase().contains("nothing to commit")
        {
            return Ok(());
        }

        return Err(AppError::new(
            ErrorKind::Rejected,
            "Could not finish — something is still unresolved.",
        )
        .with_detail(&out.stderr));
    }

    Ok(())
}

/// Abandon the operation and put the branch back as it was.
///
/// Destructive in the sense that the in-progress merge is thrown away, so the
/// UI always confirms first; nothing committed is ever lost by it.
pub fn abort(repo: &Path) -> AppResult<()> {
    let op = operation(repo);

    let out = match op.kind.as_str() {
        "merge" => git_raw(repo, &["merge", "--abort"])?,
        "rebase" => git_raw(repo, &["rebase", "--abort"])?,
        "cherry-pick" => git_raw(repo, &["cherry-pick", "--abort"])?,
        "revert" => git_raw(repo, &["revert", "--abort"])?,
        _ => {
            return Err(AppError::invalid(
                "There is nothing in progress to stop.",
            ))
        }
    };

    if !out.ok() {
        return Err(AppError::new(ErrorKind::Rejected, "Could not stop that operation.")
            .with_detail(&out.stderr));
    }

    Ok(())
}
