//! Committing, amending, reverting and resetting — plus the Git identity that
//! every commit is stamped with.

use std::path::Path;

use super::{has_commits, validate_revision};
use crate::error::{AppError, AppResult, ErrorKind};
use crate::exec::{git, git_global, git_raw};
use crate::models::{ChangedFile, GitIdentity, LocalSave, SaveResult};

use super::status::{self, EMPTY_TREE};

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/// Read `user.name` and `user.email`, repository first then global.
///
/// This is kept strictly apart from the GitHub account: this is what gets
/// stamped into commits, and it is what makes a commit show up as "yours" on
/// GitHub. Being signed in to `gh` does not set it, which is exactly the
/// confusion the app's setup screen exists to clear up.
pub fn identity(repo: Option<&Path>) -> GitIdentity {
    let read = |key: &str| -> Option<String> {
        let value = match repo {
            Some(dir) => git(dir, &["config", "--get", key]).ok(),
            None => git_global(&["config", "--global", "--get", key]).ok(),
        }?;
        let trimmed = value.trim().to_string();
        (!trimmed.is_empty()).then_some(trimmed)
    };

    let name = read("user.name");
    let email = read("user.email");

    GitIdentity {
        configured: name.is_some() && email.is_some(),
        name,
        email,
    }
}

/// Whether commits can be made at all in this repository.
pub fn identity_configured(repo: &Path) -> bool {
    identity(Some(repo)).configured
}

/// Write the Git identity.
///
/// Never called silently — only the frontend's Name/Email setup reaches this,
/// and it always shows the user what will be written. `--global` is the default
/// because a per-repository identity surprises people later.
pub fn set_identity(repo: Option<&Path>, name: &str, email: &str, global: bool) -> AppResult<GitIdentity> {
    let name = name.trim();
    let email = email.trim();

    if name.is_empty() {
        return Err(AppError::invalid("Enter the name you want on your commits."));
    }
    if email.is_empty() || !email.contains('@') || email.starts_with('-') {
        return Err(AppError::invalid("Enter a valid email address."));
    }

    if global || repo.is_none() {
        git_global(&["config", "--global", "user.name", name])?;
        git_global(&["config", "--global", "user.email", email])?;
    } else if let Some(dir) = repo {
        git(dir, &["config", "user.name", name])?;
        git(dir, &["config", "user.email", email])?;
    }

    Ok(identity(repo))
}

/* -------------------------------------------------------------------------- */
/* Committing                                                                  */
/* -------------------------------------------------------------------------- */

/// Commit the given files. An empty list commits whatever is already staged.
///
/// The staging is made to match the tick boxes exactly: everything is unstaged
/// first, then only the named files are staged. Without that, a file the user
/// unticked but which was already staged from an earlier session would ride
/// along into the commit.
pub fn commit(repo: &Path, files: &[String], message: &str) -> AppResult<SaveResult> {
    let message = message.trim();

    if message.is_empty() {
        return Err(AppError::invalid("Add a message describing what you changed."));
    }

    if !identity_configured(repo) {
        return Err(AppError::new(
            ErrorKind::InvalidInput,
            "Git needs a name and email to stamp on your commits. Add them in Settings, then commit again.",
        ));
    }

    if !files.is_empty() {
        status::unstage(repo, &[])?;
        status::stage(repo, files)?;
    }

    // Nothing staged means nothing to record.
    let staged_empty = if has_commits(repo) {
        git(repo, &["diff", "--cached", "--quiet"]).is_ok()
    } else {
        git(repo, &["diff", "--cached", "--quiet", EMPTY_TREE]).is_ok()
    };

    if staged_empty {
        return Err(AppError::invalid(
            "None of the files are ticked, so there is nothing to commit.",
        ));
    }

    // `--message` is passed as its own argument, so a message containing
    // newlines, quotes or anything else is data, never syntax.
    git(repo, &["commit", "--message", message])?;

    build_result(repo, message)
}

/// Replace the most recent commit instead of adding another one.
pub fn amend(repo: &Path, message: &str, files: &[String]) -> AppResult<SaveResult> {
    if !has_commits(repo) {
        return Err(AppError::invalid(
            "There is no commit to change yet — make the first one instead.",
        ));
    }

    if !identity_configured(repo) {
        return Err(AppError::new(
            ErrorKind::InvalidInput,
            "Git needs a name and email to stamp on your commits. Add them in Settings, then try again.",
        ));
    }

    let message = message.trim();
    if message.is_empty() {
        return Err(AppError::invalid("The commit still needs a message."));
    }

    // Amending something already pushed rewrites public history. The UI warns;
    // the backend refuses to do it silently by reporting it as a rejection the
    // caller has to acknowledge with `force` on the subsequent push.
    if !files.is_empty() {
        status::stage(repo, files)?;
    }

    git(repo, &["commit", "--amend", "--message", message])?;
    build_result(repo, message)
}

/// Whether the last commit has already been pushed, so the UI can warn before
/// amending it.
pub fn head_is_pushed(repo: &Path) -> bool {
    let Ok(head) = git(repo, &["rev-parse", "HEAD"]) else {
        return false;
    };

    // Any remote branch containing HEAD means it is public.
    git(repo, &["branch", "--remotes", "--contains", head.trim()])
        .map(|out| !out.trim().is_empty())
        .unwrap_or(false)
}

/// Assemble the SaveResult the frontend expects after a commit.
fn build_result(repo: &Path, message: &str) -> AppResult<SaveResult> {
    let pending = pending_commits(repo)?;
    let count = pending.len();

    let save = pending.into_iter().last().unwrap_or_else(|| LocalSave {
        id: git(repo, &["rev-parse", "HEAD"]).unwrap_or_default(),
        message: message.to_string(),
        files: Vec::new(),
        saved_at: now_millis(),
    });

    Ok(SaveResult {
        save,
        pending_count: count,
    })
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Commits made here that the remote does not have yet, oldest first.
pub fn pending_commits(repo: &Path) -> AppResult<Vec<LocalSave>> {
    if !has_commits(repo) {
        return Ok(Vec::new());
    }

    let branch = super::current_branch(repo)?;

    // With an upstream, "pending" is everything it does not have. Without one,
    // nothing has ever been pushed, so every commit counts.
    let upstream = git(repo, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let range = match upstream {
        Some(up) => format!("{up}..HEAD"),
        None => {
            // Fall back to origin/<branch> if it exists but is not tracked.
            let guess = format!("origin/{branch}");
            if git(repo, &["rev-parse", "--verify", "--quiet", &guess]).is_ok() {
                format!("{guess}..HEAD")
            } else {
                "HEAD".to_string()
            }
        }
    };

    // Bounded: a branch that has never been pushed can have thousands of
    // commits, and the push dialog only ever shows a list of them.
    let log = git(
        repo,
        &[
            "log",
            "--reverse",
            "--max-count=100",
            "--format=%H%x1f%s%x1f%ct",
            &range,
        ],
    )?;

    let mut saves = Vec::new();

    for line in log.lines() {
        let fields = super::split_fields(line);
        if fields.len() < 3 {
            continue;
        }

        // The push dialog lists file names and counts, not patches, so the
        // diffs are left out — fetching them here meant a Git call per file of
        // every unpushed commit.
        saves.push(LocalSave {
            id: fields[0].to_string(),
            message: fields[1].to_string(),
            files: commit_files_unchecked(repo, fields[0], false).unwrap_or_default(),
            saved_at: super::seconds_to_millis(fields[2]),
        });
    }

    Ok(saves)
}

/// Files touched by one commit, with their diffs attached.
pub fn commit_files(repo: &Path, hash: &str) -> AppResult<Vec<ChangedFile>> {
    validate_revision(repo, hash)?;
    commit_files_unchecked(repo, hash, true)
}

/// The body of [`commit_files`], without re-validating the revision.
///
/// `pending_commits` already has hashes straight from `git log`, so making it
/// re-verify each one costs a process per commit for no benefit.
///
/// `with_diffs` controls whether the patch text is fetched at all. Listing
/// commits only needs the file names and counts, and skipping the patches turns
/// a per-file Git call into nothing.
fn commit_files_unchecked(
    repo: &Path,
    hash: &str,
    with_diffs: bool,
) -> AppResult<Vec<ChangedFile>> {
    // A root commit has no parent to diff against, so it is compared with the
    // empty tree — otherwise the very first commit would show no files at all.
    let is_root = git(repo, &["rev-parse", "--verify", "--quiet", &format!("{hash}^")]).is_err();
    let base = if is_root { EMPTY_TREE.to_string() } else { format!("{hash}^") };

    // `--raw` adds the change letter, so the status no longer has to be
    // inferred from the patch text — which is what forced a diff per file.
    let out = git(
        repo,
        &[
            "diff",
            "--numstat",
            "--raw",
            "--find-renames",
            "-z",
            &base,
            hash,
        ],
    )?;

    let mut files = parse_raw_numstat(&out);

    if with_diffs && !files.is_empty() {
        // Named paths only, and only the first page of them: a merge or a
        // dependency bump can touch thousands of files, and generating every
        // patch to show the first screenful is the expensive mistake.
        const EAGER_ROWS: usize = 40;
        let max_diff = super::status::MAX_DIFF_BYTES as usize;

        let wanted: Vec<&str> = files
            .iter()
            .take(EAGER_ROWS)
            .map(|f| f.path.as_str())
            .collect();

        let mut args: Vec<&str> = vec!["diff", "--unified=3", &base, hash, "--"];
        args.extend(&wanted);

        let patches = git(repo, &args)
            .map(|text| {
                let mut map = std::collections::HashMap::new();
                super::status::split_patches(&text, &mut map);
                map
            })
            .unwrap_or_default();

        for file in files.iter_mut().take(EAGER_ROWS) {
            if let Some(patch) = patches.get(&file.path) {
                if patch.len() <= max_diff {
                    file.diff = patch.clone();
                }
            }
        }
    }

    Ok(files)
}

/// Parse the combined `--numstat --raw -z` output into changed files.
///
/// Git emits the raw records first (each `:<mode> <mode> <sha> <sha> <status>\0<path>\0`)
/// and then the numstat block, so the two are matched up by path.
fn parse_raw_numstat(out: &str) -> Vec<ChangedFile> {
    let mut statuses: std::collections::HashMap<String, char> = std::collections::HashMap::new();
    let mut files = Vec::new();
    let mut fields = out.split('\0').peekable();

    while let Some(field) = fields.next() {
        if field.is_empty() {
            continue;
        }

        // Raw record: begins with a colon.
        if let Some(rest) = field.strip_prefix(':') {
            let letter = rest
                .split_whitespace()
                .last()
                .and_then(|s| s.chars().next())
                .unwrap_or('M');

            // A rename record carries the old path then the new one.
            let first = fields.next().unwrap_or_default().to_string();
            let path = if letter == 'R' || letter == 'C' {
                fields.next().unwrap_or_default().to_string()
            } else {
                first
            };

            if !path.is_empty() {
                statuses.insert(path, letter);
            }
            continue;
        }

        // Numstat record: added \t deleted \t path
        let mut parts = field.split('\t');
        let (Some(added), Some(deleted)) = (parts.next(), parts.next()) else {
            continue;
        };

        let additions: u32 = added.trim().parse().unwrap_or(0);
        let deletions: u32 = deleted.trim().parse().unwrap_or(0);

        let path = match parts.next() {
            Some(p) if !p.is_empty() => p.to_string(),
            // Renames put the paths in the following fields.
            _ => {
                let _old = fields.next();
                fields.next().unwrap_or_default().to_string()
            }
        };

        if path.is_empty() {
            continue;
        }

        let status = match statuses.get(&path).copied().unwrap_or('M') {
            'A' => "added",
            'D' => "deleted",
            'R' => "renamed",
            'C' => "added",
            _ => "modified",
        };

        files.push(ChangedFile {
            path,
            status: status.into(),
            additions,
            deletions,
            staged: true,
            diff: String::new(),
            original_path: None,
        });
    }

    files
}

/* -------------------------------------------------------------------------- */
/* Undoing                                                                     */
/* -------------------------------------------------------------------------- */

/// Undo a commit by adding one that reverses it. Safe after pushing.
pub fn revert(repo: &Path, hash: &str) -> AppResult<Vec<String>> {
    validate_revision(repo, hash)?;

    // `--no-commit` leaves the reversal in the working tree, which is what the
    // UI promises ("waiting in Changes for you to commit").
    let out = git_raw(repo, &["revert", "--no-commit", "--", hash])
        .or_else(|_| git_raw(repo, &["revert", "--no-commit", hash]))?;

    if !out.ok() {
        let conflicted = super::conflicts::conflicted_paths(repo);
        if !conflicted.is_empty() {
            return Ok(conflicted);
        }
        return Err(AppError::new(
            ErrorKind::Rejected,
            "Could not undo that commit — the files it touched have changed too much since.",
        )
        .with_detail(&out.stderr));
    }

    Ok(Vec::new())
}

/// Apply a single commit from another branch onto this one.
pub fn cherry_pick(repo: &Path, hash: &str) -> AppResult<Vec<String>> {
    validate_revision(repo, hash)?;

    let out = git_raw(repo, &["cherry-pick", hash])?;

    if !out.ok() {
        let conflicted = super::conflicts::conflicted_paths(repo);
        if !conflicted.is_empty() {
            return Ok(conflicted);
        }
        return Err(AppError::new(ErrorKind::Rejected, "Could not apply that commit.")
            .with_detail(&out.stderr));
    }

    Ok(Vec::new())
}

/// Move the branch to another commit.
///
/// `hard` throws away every uncommitted change, so it is spelled out as its own
/// parameter and the UI confirms it separately. Nothing here happens silently.
pub fn reset(repo: &Path, hash: &str, mode: &str) -> AppResult<()> {
    validate_revision(repo, hash)?;

    let flag = match mode {
        "soft" => "--soft",
        "mixed" => "--mixed",
        "hard" => "--hard",
        _ => {
            return Err(AppError::invalid(
                "Choose how much to undo: the commit only, the commit and staging, or everything.",
            ))
        }
    };

    git(repo, &["reset", flag, hash])?;
    Ok(())
}

/* -------------------------------------------------------------------------- */
/* Guard rails                                                                 */
/* -------------------------------------------------------------------------- */

/// A warning the UI shows before a commit, from the behaviour toggles.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitWarning {
    /// largeFile | secret | mainBranch
    pub kind: String,
    pub path: Option<String>,
    pub message: String,
}

/// Files over 50 MB, which bloat a repository's history permanently.
pub fn large_files(repo: &Path, files: &[String], limit_bytes: u64) -> Vec<CommitWarning> {
    let mut warnings = Vec::new();

    for file in files {
        let full = repo.join(file);
        if let Ok(meta) = std::fs::metadata(&full) {
            if meta.is_file() && meta.len() > limit_bytes {
                let mb = meta.len() / (1024 * 1024);
                warnings.push(CommitWarning {
                    kind: "largeFile".into(),
                    path: Some(file.clone()),
                    message: format!(
                        "{file} is {mb} MB. Large files stay in this project's history forever, and GitHub refuses anything over 100 MB."
                    ),
                });
            }
        }
    }

    warnings
}

/// Scan staged content for things that look like credentials.
///
/// Deliberately shallow and local: it reads the added lines of the diff and
/// matches a few well-known token shapes. Nothing is sent anywhere, and a hit
/// is a warning the user can override — never a silent refusal.
pub fn secret_scan(repo: &Path, files: &[String]) -> Vec<CommitWarning> {
    const MARKERS: [(&str, &str); 8] = [
        ("ghp_", "a GitHub personal access token"),
        ("github_pat_", "a GitHub personal access token"),
        ("AKIA", "an AWS access key"),
        ("sk_live_", "a live Stripe secret key"),
        ("-----BEGIN RSA PRIVATE KEY", "a private key"),
        ("-----BEGIN OPENSSH PRIVATE KEY", "a private key"),
        ("-----BEGIN PRIVATE KEY", "a private key"),
        ("xoxb-", "a Slack bot token"),
    ];

    let mut warnings = Vec::new();

    for file in files {
        let Ok(diff) = status::file_diff(repo, file) else {
            continue;
        };

        for line in diff.lines() {
            if !line.starts_with('+') || line.starts_with("+++") {
                continue;
            }

            for (marker, description) in MARKERS {
                if line.contains(marker) {
                    warnings.push(CommitWarning {
                        kind: "secret".into(),
                        path: Some(file.clone()),
                        message: format!(
                            "{file} looks like it contains {description}. Secrets stay in a project's history forever, even if you delete the file later."
                        ),
                    });
                    break;
                }
            }
        }
    }

    // One warning per file is enough to make the point.
    warnings.dedup_by(|a, b| a.path == b.path);
    warnings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn large_file_warning_has_path() {
        let warnings = large_files(Path::new("."), &[], 50);
        assert!(warnings.is_empty());
    }

    #[test]
    fn warning_serialises_camel_case() {
        let warning = CommitWarning {
            kind: "largeFile".into(),
            path: Some("a.bin".into()),
            message: "big".into(),
        };
        let json = serde_json::to_string(&warning).unwrap();
        assert!(json.contains("\"kind\""));
        assert!(json.contains("\"path\""));
    }
}
