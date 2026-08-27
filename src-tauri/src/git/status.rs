//! Working-tree status, diffs, staging and discarding.
//!
//! The Changes screen reads everything here. Status comes from
//! `status --porcelain=v2`, which reports the staged and unstaged halves of a
//! file separately — the distinction the per-file tick boxes are built on.

use std::collections::HashMap;
use std::path::Path;

use super::has_commits;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::exec::{git, git_raw};
use crate::models::{ChangedFile, DiffHunk};

/// The empty-tree hash, used to diff the very first commit (which has no
/// parent) as though it were added to nothing.
pub const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/// Everything that differs from the last commit, staged or not.
///
/// Porcelain v2 gives two status letters per file: the first is what is staged,
/// the second what is not. A file can be both — edited, staged, then edited
/// again — so `staged` here means "has something staged", which is exactly what
/// determines whether the UI's tick box starts ticked.
pub fn changed_files(repo: &Path) -> AppResult<Vec<ChangedFile>> {
    let out = git(
        repo,
        &[
            "status",
            "--porcelain=v2",
            "--untracked-files=all",
            "--renames",
            "-z",
        ],
    )?;

    let mut files = Vec::new();

    // Both of these are one Git process each, hoisted out of the loop below —
    // asking per file is what made a large repository crawl.
    let has_head = has_commits(repo);
    let counts = all_counts(repo, has_head);

    // -z makes every record NUL-terminated, so paths with spaces, quotes or
    // newlines survive intact. Renames put the old path in its own record.
    let mut records = out.split('\0').peekable();

    while let Some(record) = records.next() {
        if record.is_empty() {
            continue;
        }

        let mut parts = record.split(' ');
        let kind = parts.next().unwrap_or("");

        match kind {
            // Ordinary change: 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
            "1" => {
                let xy = parts.next().unwrap_or("");
                let path = record.splitn(9, ' ').nth(8).unwrap_or("").to_string();
                if path.is_empty() {
                    continue;
                }
                let (status, staged) = classify(xy);
                let (additions, deletions) = counts.get(&path).copied().unwrap_or((0, 0));

                files.push(ChangedFile {
                    path,
                    status,
                    additions,
                    deletions,
                    staged,
                    diff: String::new(),
                    original_path: None,
                });
            }

            // Rename/copy: 2 <XY> … <path>\0<origPath>
            "2" => {
                let xy = parts.next().unwrap_or("");
                let path = record.splitn(10, ' ').nth(9).unwrap_or("").to_string();
                let original = records.next().unwrap_or("").to_string();
                if path.is_empty() {
                    continue;
                }
                let (status, staged) = classify(xy);
                let (additions, deletions) = counts.get(&path).copied().unwrap_or((0, 0));

                files.push(ChangedFile {
                    path,
                    status: if status == "modified" { "renamed".into() } else { status },
                    additions,
                    deletions,
                    staged,
                    diff: String::new(),
                    original_path: if original.is_empty() { None } else { Some(original) },
                });
            }

            // Unmerged (conflicted): u <XY> …
            "u" => {
                let path = record.splitn(11, ' ').nth(10).unwrap_or("").to_string();
                if path.is_empty() {
                    continue;
                }
                files.push(ChangedFile {
                    path,
                    status: "conflicted".into(),
                    additions: 0,
                    deletions: 0,
                    // A conflicted file is never "ready to commit".
                    staged: false,
                    diff: String::new(),
                    original_path: None,
                });
            }

            // Untracked: ? <path>
            "?" => {
                let path = record[2..].to_string();
                if path.is_empty() {
                    continue;
                }
                let additions = count_lines(repo, &path);
                files.push(ChangedFile {
                    path,
                    status: "untracked".into(),
                    additions,
                    deletions: 0,
                    staged: false,
                    diff: String::new(),
                    original_path: None,
                });
            }

            // Ignored ("!") and anything else is not shown.
            _ => {}
        }
    }

    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

/// Map porcelain-v2's two status letters onto the UI's vocabulary.
fn classify(xy: &str) -> (String, bool) {
    let mut chars = xy.chars();
    let index = chars.next().unwrap_or('.');
    let worktree = chars.next().unwrap_or('.');

    // Something is staged when the index column is not "unchanged".
    let staged = index != '.' && index != '?';

    // The staged letter wins when there is one, because that is the change the
    // next commit would record.
    let letter = if staged { index } else { worktree };

    let status = match letter {
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "added",
        'U' => "conflicted",
        _ => "modified",
    };

    (status.to_string(), staged)
}

/// Line counts for every changed file, from one `git diff --numstat` call.
///
/// This used to run per file, which meant one or two Git processes for each row
/// in the Changes list — a few hundred spawns on a large repository, every time
/// the watcher fired. Git reports the whole tree in a single invocation, so the
/// cost is now one process regardless of how many files changed.
fn all_counts(repo: &Path, has_head: bool) -> HashMap<String, (u32, u32)> {
    let mut counts: HashMap<String, (u32, u32)> = HashMap::new();

    // `-z` keeps paths intact when they contain spaces or non-ASCII bytes.
    let unstaged = if has_head {
        git(repo, &["diff", "--numstat", "-z", "HEAD"])
    } else {
        git(repo, &["diff", "--numstat", "-z", "--cached"])
    };

    if let Ok(out) = unstaged {
        merge_numstat(&out, &mut counts);
    }

    // Anything staged but not visible against HEAD (a brand-new repository, or
    // a file staged then reverted in the work tree) still needs a number.
    if let Ok(out) = git(repo, &["diff", "--numstat", "-z", "--cached"]) {
        for (path, value) in parse_numstat(&out) {
            counts.entry(path).or_insert(value);
        }
    }

    counts
}

fn merge_numstat(out: &str, into: &mut HashMap<String, (u32, u32)>) {
    for (path, value) in parse_numstat(out) {
        into.insert(path, value);
    }
}

/// Parse `--numstat -z` output into `(path, (added, deleted))` pairs.
///
/// With `-z` each record is `added\tdeleted\tpath\0`, except renames, which
/// emit the two paths as their own NUL-terminated fields after the counts.
fn parse_numstat(out: &str) -> Vec<(String, (u32, u32))> {
    let mut results = Vec::new();
    let mut fields = out.split('\0');

    while let Some(record) = fields.next() {
        if record.trim().is_empty() {
            continue;
        }

        let mut parts = record.split('\t');
        let Some(added) = parts.next() else { continue };
        let Some(deleted) = parts.next() else { continue };

        // Binary files report "-"; they get no count rather than a wrong one.
        let value = (
            added.trim().parse().unwrap_or(0),
            deleted.trim().parse().unwrap_or(0),
        );

        match parts.next() {
            // Ordinary change: the path is in the same record.
            Some(path) if !path.is_empty() => {
                results.push((path.to_string(), value));
            }
            // Rename: the old and new paths follow as separate fields.
            _ => {
                let _old = fields.next();
                if let Some(new) = fields.next() {
                    if !new.is_empty() {
                        results.push((new.to_string(), value));
                    }
                }
            }
        }
    }

    results
}

/// Largest untracked file worth counting lines in.
///
/// Reading a multi-hundred-megabyte file to show "12,000 added" in a list row
/// costs far more than the number is worth, and a dropped video or database
/// dump would otherwise stall the whole refresh.
const MAX_COUNT_BYTES: u64 = 2 * 1024 * 1024;

/// Line count of an untracked file, so new files do not all report "0 added".
fn count_lines(repo: &Path, file: &str) -> u32 {
    let full = repo.join(file);

    // Check the size before reading, so a huge file is skipped rather than
    // loaded into memory just to be discarded.
    match std::fs::metadata(&full) {
        Ok(meta) if meta.len() > MAX_COUNT_BYTES => return 0,
        Ok(_) => {}
        Err(_) => return 0,
    }

    let Ok(data) = std::fs::read(&full) else {
        return 0;
    };

    // Binary files get no count rather than a meaningless one.
    if data.contains(&0) {
        return 0;
    }

    data.iter().filter(|b| **b == b'\n').count() as u32
        + u32::from(!data.is_empty() && !data.ends_with(b"\n"))
}

/// The unified diff for one file, as raw patch text.
///
/// Falls back through the three places a change can live — the index, the work
/// tree, and "not tracked at all" — so every row in the Changes list can show
/// something.
pub fn file_diff(repo: &Path, file: &str) -> AppResult<String> {
    if file.trim().is_empty() {
        return Err(AppError::invalid("No file was given."));
    }

    // Tracked and committed: everything since HEAD, staged or not.
    if has_commits(repo) {
        if let Ok(diff) = git(repo, &["diff", "HEAD", "--", file]) {
            if !diff.trim().is_empty() {
                return Ok(diff);
            }
        }
    }

    // Staged in a repository with no commits yet.
    if let Ok(diff) = git(repo, &["diff", "--cached", "--", file]) {
        if !diff.trim().is_empty() {
            return Ok(diff);
        }
    }

    // Untracked: the whole file becomes additions, so its size is the patch's
    // size. A dropped-in archive, dataset or media file would otherwise be read
    // in full and shipped to the webview to render as unreadable lines.
    match std::fs::metadata(repo.join(file)) {
        Ok(meta) if meta.len() > MAX_DIFF_BYTES => return Ok(String::new()),
        Ok(_) => {}
        // Gone between the status call and now — a normal race, not an error.
        Err(_) => return Ok(String::new()),
    }

    // `--no-index` exits 1 when the files differ, which is the normal case
    // here, so the raw form is used rather than treating that as failure.
    let out = git_raw(
        repo,
        &["diff", "--no-index", "--", null_device(), file],
    )?;

    if !out.stdout.trim().is_empty() {
        return Ok(out.stdout);
    }

    Ok(String::new())
}

/// The largest patch worth sending to the UI, in bytes.
///
/// Past this the row shows its line counts without the diff. Roughly a thousand
/// lines — beyond that it is a generated file, and rendering it costs more than
/// anyone gains from seeing it.
pub const MAX_DIFF_BYTES: u64 = 80 * 1024;

/// The platform's empty file, for diffing something new against nothing.
fn null_device() -> &'static str {
    if cfg!(windows) {
        "NUL"
    } else {
        "/dev/null"
    }
}

/// Diffs for a named set of files, from one Git call.
///
/// Two rules hold here, and they pull against each other.
///
/// One process, not one per file: asking Git separately for each row meant
/// hundreds of spawns on a large change.
///
/// But only the files asked for, and only as much of each as anyone will read.
/// `git diff HEAD` with no path limit generates the entire patch for the whole
/// tree — on a big change that is tens of megabytes built in Git, copied into
/// this process, then copied again into the webview, all to render a few rows
/// nobody scrolled to. The paths are passed explicitly, so Git never looks at a
/// file the caller did not name.
///
/// Untracked files have no diff against HEAD and are not included; callers fill
/// those in themselves.
pub fn diffs_for(repo: &Path, files: &[String]) -> HashMap<String, String> {
    let mut diffs = HashMap::new();

    if files.is_empty() {
        return diffs;
    }

    // `--unified=3` is the default, stated so a user's diff.context config
    // cannot silently inflate every patch the UI has to carry.
    let mut args: Vec<&str> = if has_commits(repo) {
        vec!["diff", "--unified=3", "HEAD", "--"]
    } else {
        vec!["diff", "--unified=3", "--cached", "--"]
    };
    args.extend(files.iter().map(String::as_str));

    let Ok(text) = git(repo, &args) else {
        return diffs;
    };

    split_patches(&text, &mut diffs);
    diffs
}

/// Split a multi-file unified diff into one patch per path.
pub fn split_patches(text: &str, into: &mut HashMap<String, String>) {
    let mut path: Option<String> = None;
    let mut buffer = String::new();

    for line in text.lines() {
        if line.starts_with("diff --git ") {
            if let Some(previous) = path.take() {
                into.insert(previous, std::mem::take(&mut buffer));
            }
            path = parse_diff_header(line);
            buffer.clear();
        }

        if path.is_some() {
            buffer.push_str(line);
            buffer.push('\n');
        }
    }

    if let Some(last) = path {
        into.insert(last, buffer);
    }
}

/// Pull the new-side path out of `diff --git a/x b/x`.
///
/// The b-side is used because it is the file as it stands now, which is what a
/// rename should be keyed on.
fn parse_diff_header(line: &str) -> Option<String> {
    let rest = line.strip_prefix("diff --git ")?;

    // Paths containing spaces make this ambiguous; the ` b/` separator is the
    // reliable split point because Git always emits both prefixes.
    let marker = rest.rfind(" b/")?;
    let b_side = &rest[marker + 3..];

    (!b_side.is_empty()).then(|| b_side.trim().to_string())
}

/// Split a file's diff into hunks, for hunk-level staging.
pub fn file_hunks(repo: &Path, file: &str, staged: bool) -> AppResult<Vec<DiffHunk>> {
    let patch = if staged {
        git(repo, &["diff", "--cached", "--unified=3", "--", file])?
    } else {
        git(repo, &["diff", "--unified=3", "--", file])?
    };

    Ok(split_hunks(&patch))
}

/// Break unified-diff text into its `@@` hunks, keeping each one applyable.
pub fn split_hunks(patch: &str) -> Vec<DiffHunk> {
    let mut hunks = Vec::new();
    let mut current: Option<(String, Vec<String>)> = None;

    for line in patch.lines() {
        if line.starts_with("@@") {
            if let Some((header, body)) = current.take() {
                hunks.push(build_hunk(hunks.len(), header, body));
            }
            current = Some((line.to_string(), vec![line.to_string()]));
        } else if let Some((_, body)) = current.as_mut() {
            body.push(line.to_string());
        }
    }

    if let Some((header, body)) = current.take() {
        hunks.push(build_hunk(hunks.len(), header, body));
    }

    hunks
}

fn build_hunk(index: usize, header: String, body: Vec<String>) -> DiffHunk {
    let additions = body
        .iter()
        .filter(|l| l.starts_with('+') && !l.starts_with("+++"))
        .count() as u32;
    let deletions = body
        .iter()
        .filter(|l| l.starts_with('-') && !l.starts_with("---"))
        .count() as u32;

    DiffHunk {
        index,
        header,
        patch: body.join("\n"),
        additions,
        deletions,
    }
}

/// The `diff --git` header lines for a file, needed to make a single hunk into
/// a patch `git apply` will accept.
fn patch_header(repo: &Path, file: &str, staged: bool) -> AppResult<String> {
    let full = if staged {
        git(repo, &["diff", "--cached", "--unified=3", "--", file])?
    } else {
        git(repo, &["diff", "--unified=3", "--", file])?
    };

    let header: Vec<&str> = full.lines().take_while(|l| !l.starts_with("@@")).collect();

    if header.is_empty() {
        return Err(AppError::invalid(
            "That change is no longer there — the file has moved on since it was read.",
        ));
    }

    Ok(header.join("\n"))
}

/// Stage whole files. An empty list stages everything.
pub fn stage(repo: &Path, files: &[String]) -> AppResult<()> {
    if files.is_empty() {
        git(repo, &["add", "--all"])?;
        return Ok(())
    }

    // `--` separates paths from options, so a file called `-f` is a file.
    let mut args: Vec<&str> = vec!["add", "--"];
    args.extend(files.iter().map(String::as_str));
    git(repo, &args)?;
    Ok(())
}

/// Unstage whole files, leaving the edits in place on disk.
pub fn unstage(repo: &Path, files: &[String]) -> AppResult<()> {
    if !has_commits(repo) {
        // Before the first commit there is nothing to reset to, so the index
        // entry is removed directly.
        let mut args: Vec<&str> = vec!["rm", "--cached", "-r", "--"];
        if files.is_empty() {
            args.push(".");
        } else {
            args.extend(files.iter().map(String::as_str));
        }
        git(repo, &args)?;
        return Ok(());
    }

    let mut args: Vec<&str> = vec!["restore", "--staged", "--"];
    if files.is_empty() {
        args.push(".");
    } else {
        args.extend(files.iter().map(String::as_str));
    }

    // `restore` needs Git 2.23+; `reset` is the fallback for older installs.
    if git(repo, &args).is_err() {
        let mut legacy: Vec<&str> = vec!["reset", "HEAD", "--"];
        if files.is_empty() {
            legacy.push(".");
        } else {
            legacy.extend(files.iter().map(String::as_str));
        }
        git(repo, &legacy)?;
    }

    Ok(())
}

/// Stage a single hunk by feeding just that hunk to `git apply --cached`.
pub fn stage_hunk(repo: &Path, file: &str, hunk_index: usize) -> AppResult<()> {
    let hunks = file_hunks(repo, file, false)?;
    let hunk = hunks
        .get(hunk_index)
        .ok_or_else(|| AppError::invalid("That part of the file has already changed. Refresh and try again."))?;

    let header = patch_header(repo, file, false)?;
    let patch = format!("{header}\n{}\n", hunk.patch);

    apply_patch(repo, &patch, &["--cached"])
}

/// Unstage a single hunk by applying it in reverse to the index.
pub fn unstage_hunk(repo: &Path, file: &str, hunk_index: usize) -> AppResult<()> {
    let hunks = file_hunks(repo, file, true)?;
    let hunk = hunks
        .get(hunk_index)
        .ok_or_else(|| AppError::invalid("That part of the file has already changed. Refresh and try again."))?;

    let header = patch_header(repo, file, true)?;
    let patch = format!("{header}\n{}\n", hunk.patch);

    apply_patch(repo, &patch, &["--cached", "--reverse"])
}

/// Write a patch to a temporary file and hand it to `git apply`.
///
/// A temp file rather than stdin because `exec` deliberately gives every
/// process a null stdin — nothing GitEasy runs is ever allowed to block waiting
/// for input.
fn apply_patch(repo: &Path, patch: &str, extra: &[&str]) -> AppResult<()> {
    let temp = std::env::temp_dir().join(format!(
        "giteasy-patch-{}-{}.diff",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));

    std::fs::write(&temp, patch)
        .map_err(|e| AppError::new(ErrorKind::Unknown, "Could not prepare that change.").with_detail(e.to_string()))?;

    let path = temp.to_string_lossy().to_string();
    let mut args: Vec<&str> = vec!["apply", "--unidiff-zero", "--whitespace=nowarn"];
    args.extend_from_slice(extra);
    args.push("--");
    args.push(&path);

    let result = git(repo, &args);
    let _ = std::fs::remove_file(&temp);

    result.map(|_| ()).map_err(|e| {
        AppError::new(
            ErrorKind::Rejected,
            "That part could not be applied on its own — the file has changed since it was read. Refresh and try again.",
        )
        .with_detail(e.message)
    })
}

/// Permanently drop uncommitted changes to one file.
///
/// Destructive and unrecoverable, which is why it is one file at a time and
/// the UI confirms first. An untracked file is deleted; a tracked one is
/// restored from HEAD.
pub fn discard_file(repo: &Path, file: &str) -> AppResult<()> {
    if file.trim().is_empty() {
        return Err(AppError::invalid("No file was given."));
    }

    // Is Git tracking it at all?
    let tracked = git(repo, &["ls-files", "--error-unmatch", "--", file]).is_ok();

    if !tracked {
        let full = repo.join(file);
        if full.is_file() {
            std::fs::remove_file(&full)
                .map_err(|e| AppError::invalid(format!("Could not delete that file ({e})")))?;
        } else if full.is_dir() {
            std::fs::remove_dir_all(&full)
                .map_err(|e| AppError::invalid(format!("Could not delete that folder ({e})")))?;
        }
        return Ok(());
    }

    // Throw away both the staged and the working-tree version.
    if has_commits(repo) {
        if git(repo, &["restore", "--staged", "--worktree", "--", file]).is_err() {
            git(repo, &["checkout", "HEAD", "--", file])?;
        }
    } else {
        git(repo, &["rm", "--cached", "--force", "--", file])?;
        let full = repo.join(file);
        if full.is_file() {
            let _ = std::fs::remove_file(full);
        }
    }

    Ok(())
}

/// Whether the working tree has changes that would block a merge or rebase.
pub fn has_blocking_changes(repo: &Path) -> bool {
    // Untracked files do not block a merge; tracked modifications do.
    git(repo, &["diff", "--quiet", "--ignore-submodules", "HEAD"]).is_err()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_staged_addition() {
        let (status, staged) = classify("A.");
        assert_eq!(status, "added");
        assert!(staged);
    }

    #[test]
    fn classifies_unstaged_modification() {
        let (status, staged) = classify(".M");
        assert_eq!(status, "modified");
        assert!(!staged);
    }

    #[test]
    fn classifies_deletion() {
        let (status, _) = classify(".D");
        assert_eq!(status, "deleted");
    }

    #[test]
    fn parses_batched_numstat() {
        let out = "12\t4\tsrc/a.js\0007\t0\tsrc/b.js\0";
        let parsed = parse_numstat(out);
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0], ("src/a.js".to_string(), (12, 4)));
        assert_eq!(parsed[1], ("src/b.js".to_string(), (7, 0)));
    }

    #[test]
    fn binary_numstat_reads_zero() {
        let parsed = parse_numstat("-\t-\timage.png\0");
        assert_eq!(parsed[0].1, (0, 0));
    }

    #[test]
    fn numstat_keeps_the_new_path_of_a_rename() {
        // A rename emits empty path field, then old and new as separate fields.
        let out = "3\t1\t\0old/name.js\0new/name.js\0";
        let parsed = parse_numstat(out);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].0, "new/name.js");
    }

    #[test]
    fn splits_a_multi_file_patch() {
        let text = concat!(
            "diff --git a/one.js b/one.js\n",
            "@@ -1 +1 @@\n",
            "-a\n+b\n",
            "diff --git a/two.js b/two.js\n",
            "@@ -1 +1 @@\n",
            "-c\n+d\n"
        );
        let mut map = HashMap::new();
        split_patches(text, &mut map);

        assert_eq!(map.len(), 2);
        assert!(map["one.js"].contains("+b"));
        assert!(map["two.js"].contains("+d"));
        // Each patch keeps only its own file's lines.
        assert!(!map["one.js"].contains("+d"));
    }

    #[test]
    fn reads_path_from_diff_header() {
        assert_eq!(
            parse_diff_header("diff --git a/src/app.ts b/src/app.ts"),
            Some("src/app.ts".to_string())
        );
    }

    #[test]
    fn splits_two_hunks() {
        let patch = "@@ -1,3 +1,4 @@\n a\n+b\n c\n@@ -10,2 +11,3 @@\n d\n+e\n";
        let hunks = split_hunks(patch);
        assert_eq!(hunks.len(), 2);
        assert_eq!(hunks[0].additions, 1);
        assert_eq!(hunks[1].index, 1);
        assert!(hunks[1].patch.starts_with("@@ -10,2 +11,3 @@"));
    }

    #[test]
    fn no_hunks_in_empty_patch() {
        assert!(split_hunks("").is_empty());
    }
}
