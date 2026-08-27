//! History: the commit log, graph data, file history, blame and comparisons.

use std::collections::HashMap;
use std::path::Path;

use super::{has_commits, validate_revision};
use crate::error::{AppError, AppResult};
use crate::exec::git;
use crate::models::{BlameLine, ChangedFile, Commit};

use super::status::EMPTY_TREE;

/// Every field the Commit model needs, in one log line.
const FORMAT: &str = "%H\u{1f}%h\u{1f}%s\u{1f}%b\u{1f}%an\u{1f}%ae\u{1f}%ct\u{1f}%P\u{1f}%D";

/// Commit history for a branch, newest first.
pub fn history(repo: &Path, branch: &str, limit: u32) -> AppResult<Vec<Commit>> {
    if !has_commits(repo) {
        return Ok(Vec::new());
    }

    let branch = branch.trim();
    let target = if branch.is_empty() {
        "HEAD".to_string()
    } else {
        validate_revision(repo, branch)?;
        branch.to_string()
    };

    let commits = log_range(repo, &target, limit)?;
    Ok(mark_local(repo, commits))
}

/// Run `git log` over a range and parse it into commits.
///
/// `%b` (the body) can contain newlines, so records are separated by a NUL and
/// fields by the unit separator — no line-based parsing survives real commit
/// messages otherwise.
pub fn log_range(repo: &Path, range: &str, limit: u32) -> AppResult<Vec<Commit>> {
    if !has_commits(repo) {
        return Ok(Vec::new());
    }

    let limit_arg = format!("--max-count={limit}");
    let format_arg = format!("--format={FORMAT}%x00");

    let out = git(repo, &["log", &limit_arg, &format_arg, range])?;

    let mut commits = Vec::new();

    for record in out.split('\0') {
        let record = record.trim_start_matches('\n');
        if record.trim().is_empty() {
            continue;
        }

        let fields = super::split_fields(record);
        if fields.len() < 7 {
            continue;
        }

        let hash = fields[0].trim().to_string();
        let parents: Vec<String> = fields
            .get(7)
            .map(|p| p.split_whitespace().map(str::to_string).collect())
            .unwrap_or_default();

        let tags = parse_tags(fields.get(8).copied().unwrap_or(""));

        commits.push(Commit {
            short_hash: fields[1].trim().to_string(),
            message: fields[2].to_string(),
            body: fields[3].trim().to_string(),
            author: fields[4].to_string(),
            author_email: fields[5].to_string(),
            at: super::seconds_to_millis(fields[6]),
            additions: 0,
            deletions: 0,
            file_count: 0,
            tags,
            is_local: false,
            is_merge: parents.len() > 1,
            checks: "none".into(),
            parents,
            hash,
        });
    }

    attach_stats(repo, &mut commits);
    Ok(commits)
}

/// Pull tag names out of `%D` ("HEAD -> main, tag: v1.0, origin/main").
fn parse_tags(decoration: &str) -> Vec<String> {
    decoration
        .split(',')
        .filter_map(|part| {
            let part = part.trim();
            part.strip_prefix("tag: ").map(|t| t.trim().to_string())
        })
        .collect()
}

/// Attach line counts to a batch of commits with one `git log --numstat` call.
///
/// Asking per commit is what makes History slow in other clients; one call for
/// the whole page keeps opening the screen to a single process.
fn attach_stats(repo: &Path, commits: &mut [Commit]) {
    if commits.is_empty() {
        return;
    }

    // Walk the same range the commits came from rather than naming each hash:
    // a page of 200 commits would otherwise mean a 200-argument command line,
    // which Windows refuses outright past ~32k characters.
    //
    // `--max-count` bounds it to what was actually asked for, and the newest
    // commit is the starting point because the log is already newest-first.
    let Some(newest) = commits.first().map(|c| c.hash.clone()) else {
        return;
    };
    let limit = format!("--max-count={}", commits.len());

    let Ok(out) = git(
        repo,
        &["log", "--numstat", "--format=%x01%H", &limit, &newest],
    ) else {
        return;
    };

    let mut stats: HashMap<String, (u32, u32, u32)> = HashMap::new();
    let mut current: Option<String> = None;

    for line in out.lines() {
        if let Some(hash) = line.strip_prefix('\u{1}') {
            current = Some(hash.trim().to_string());
            continue;
        }

        if line.trim().is_empty() {
            continue;
        }

        let Some(hash) = current.as_ref() else { continue };

        let mut parts = line.split('\t');
        let (Some(added), Some(deleted)) = (parts.next(), parts.next()) else {
            continue;
        };

        let entry = stats.entry(hash.clone()).or_insert((0, 0, 0));
        entry.0 += added.trim().parse::<u32>().unwrap_or(0);
        entry.1 += deleted.trim().parse::<u32>().unwrap_or(0);
        entry.2 += 1;
    }

    for commit in commits.iter_mut() {
        if let Some((additions, deletions, files)) = stats.get(&commit.hash) {
            commit.additions = *additions;
            commit.deletions = *deletions;
            commit.file_count = *files;
        }
    }
}

/// Mark the commits the remote does not have yet.
fn mark_local(repo: &Path, mut commits: Vec<Commit>) -> Vec<Commit> {
    // One call listing every commit reachable from any remote branch is far
    // cheaper than asking per commit.
    let Ok(out) = git(
        repo,
        &["rev-list", "--max-count=1000", "--remotes"],
    ) else {
        return commits;
    };

    let remote: std::collections::HashSet<&str> = out.lines().map(str::trim).collect();

    if remote.is_empty() {
        // Nothing has ever been pushed — every commit is still local.
        for commit in commits.iter_mut() {
            commit.is_local = true;
        }
        return commits;
    }

    for commit in commits.iter_mut() {
        commit.is_local = !remote.contains(commit.hash.as_str());
    }

    commits
}

/// Every commit that touched one file, newest first.
pub fn file_history(repo: &Path, file: &str, limit: u32) -> AppResult<Vec<Commit>> {
    if file.trim().is_empty() {
        return Err(AppError::invalid("No file was given."));
    }

    if !has_commits(repo) {
        return Ok(Vec::new());
    }

    let limit_arg = format!("--max-count={limit}");
    let format_arg = format!("--format={FORMAT}%x00");

    // `--follow` keeps the history across renames, which is what people expect
    // when a file has been moved.
    let out = git(
        repo,
        &["log", &limit_arg, &format_arg, "--follow", "--", file],
    )?;

    let mut commits = Vec::new();

    for record in out.split('\0') {
        let record = record.trim_start_matches('\n');
        if record.trim().is_empty() {
            continue;
        }

        let fields = super::split_fields(record);
        if fields.len() < 7 {
            continue;
        }

        let parents: Vec<String> = fields
            .get(7)
            .map(|p| p.split_whitespace().map(str::to_string).collect())
            .unwrap_or_default();

        commits.push(Commit {
            hash: fields[0].trim().to_string(),
            short_hash: fields[1].trim().to_string(),
            message: fields[2].to_string(),
            body: fields[3].trim().to_string(),
            author: fields[4].to_string(),
            author_email: fields[5].to_string(),
            at: super::seconds_to_millis(fields[6]),
            additions: 0,
            deletions: 0,
            file_count: 1,
            tags: parse_tags(fields.get(8).copied().unwrap_or("")),
            is_local: false,
            is_merge: parents.len() > 1,
            checks: "none".into(),
            parents,
        });
    }

    Ok(mark_local(repo, commits))
}

/// Who last changed each line of a file.
pub fn blame(repo: &Path, file: &str, rev: Option<&str>) -> AppResult<Vec<BlameLine>> {
    if file.trim().is_empty() {
        return Err(AppError::invalid("No file was given."));
    }

    if !has_commits(repo) {
        return Ok(Vec::new());
    }

    let mut args: Vec<&str> = vec!["blame", "--line-porcelain"];

    let revision;
    if let Some(rev) = rev.filter(|r| !r.trim().is_empty()) {
        validate_revision(repo, rev)?;
        revision = rev.to_string();
        args.push(&revision);
    }

    args.push("--");
    args.push(file);

    let out = git(repo, &args)?;
    Ok(parse_blame(&out))
}

/// Parse `git blame --line-porcelain` into one row per line.
fn parse_blame(text: &str) -> Vec<BlameLine> {
    let mut lines = Vec::new();

    let mut hash = String::new();
    let mut author = String::new();
    let mut summary = String::new();
    let mut at: i64 = 0;
    let mut line_number: u32 = 0;

    for raw in text.lines() {
        if let Some(rest) = raw.strip_prefix('\t') {
            lines.push(BlameLine {
                line_number,
                content: rest.to_string(),
                short_hash: hash.chars().take(7).collect(),
                hash: hash.clone(),
                author: author.clone(),
                at,
                summary: summary.clone(),
            });
            continue;
        }

        if let Some(rest) = raw.strip_prefix("author ") {
            author = rest.trim().to_string();
        } else if let Some(rest) = raw.strip_prefix("author-time ") {
            at = super::seconds_to_millis(rest);
        } else if let Some(rest) = raw.strip_prefix("summary ") {
            summary = rest.trim().to_string();
        } else if raw.len() >= 40 && raw.as_bytes()[0].is_ascii_hexdigit() {
            // Header line: <hash> <orig-line> <final-line> [group-size]
            let mut parts = raw.split_whitespace();
            if let Some(candidate) = parts.next() {
                if candidate.len() == 40 && candidate.chars().all(|c| c.is_ascii_hexdigit()) {
                    hash = candidate.to_string();
                    // The third field is the line number in the final file.
                    line_number = parts
                        .nth(1)
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(line_number + 1);
                }
            }
        }
    }

    lines
}

/// The files that differ between two refs, with diffs attached.
pub fn diff_files(repo: &Path, base: &str, head: &str) -> AppResult<Vec<ChangedFile>> {
    let out = git(
        repo,
        &["diff", "--numstat", "--find-renames", base, head],
    )?;

    let mut files = Vec::new();

    for line in out.lines() {
        let mut parts = line.split('\t');
        let (Some(added), Some(deleted), Some(path)) = (parts.next(), parts.next(), parts.next())
        else {
            continue;
        };

        let path = path.trim().to_string();
        if path.is_empty() {
            continue;
        }

        let diff = git(repo, &["diff", base, head, "--", &path]).unwrap_or_default();

        let status = if diff.contains("new file mode") {
            "added"
        } else if diff.contains("deleted file mode") {
            "deleted"
        } else if diff.contains("rename from") {
            "renamed"
        } else {
            "modified"
        };

        files.push(ChangedFile {
            path,
            status: status.into(),
            additions: added.trim().parse().unwrap_or(0),
            deletions: deleted.trim().parse().unwrap_or(0),
            staged: false,
            diff,
            original_path: None,
        });
    }

    Ok(files)
}

/// Full detail for one commit, for the commit-detail screen.
pub fn commit_detail(repo: &Path, hash: &str) -> AppResult<Commit> {
    validate_revision(repo, hash)?;

    let format_arg = format!("--format={FORMAT}");
    let out = git(repo, &["show", "--no-patch", &format_arg, hash])?;

    let fields = super::split_fields(out.trim());
    if fields.len() < 7 {
        return Err(AppError::invalid("That commit could not be read."));
    }

    let parents: Vec<String> = fields
        .get(7)
        .map(|p| p.split_whitespace().map(str::to_string).collect())
        .unwrap_or_default();

    let is_root = parents.is_empty();
    let base = if is_root {
        EMPTY_TREE.to_string()
    } else {
        format!("{hash}^")
    };

    let stats = git(repo, &["diff", "--numstat", &base, hash]).unwrap_or_default();
    let (mut additions, mut deletions, mut file_count) = (0u32, 0u32, 0u32);

    for line in stats.lines() {
        let mut parts = line.split('\t');
        if let (Some(a), Some(d)) = (parts.next(), parts.next()) {
            additions += a.trim().parse::<u32>().unwrap_or(0);
            deletions += d.trim().parse::<u32>().unwrap_or(0);
            file_count += 1;
        }
    }

    let mut commit = Commit {
        hash: fields[0].trim().to_string(),
        short_hash: fields[1].trim().to_string(),
        message: fields[2].to_string(),
        body: fields[3].trim().to_string(),
        author: fields[4].to_string(),
        author_email: fields[5].to_string(),
        at: super::seconds_to_millis(fields[6]),
        additions,
        deletions,
        file_count,
        tags: parse_tags(fields.get(8).copied().unwrap_or("")),
        is_local: false,
        is_merge: parents.len() > 1,
        checks: "none".into(),
        parents,
    };

    if let Some(marked) = mark_local(repo, vec![commit.clone()]).into_iter().next() {
        commit = marked;
    }

    Ok(commit)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_tags_from_decoration() {
        let tags = parse_tags("HEAD -> main, tag: v1.0.0, tag: latest, origin/main");
        assert_eq!(tags, vec!["v1.0.0", "latest"]);
    }

    #[test]
    fn no_tags_when_none_present() {
        assert!(parse_tags("HEAD -> main, origin/main").is_empty());
    }

    #[test]
    fn parses_blame_line() {
        let text = concat!(
            "1234567890abcdef1234567890abcdef12345678 1 1 1\n",
            "author Ada\n",
            "author-time 1700000000\n",
            "summary first commit\n",
            "\tlet x = 1;\n"
        );
        let lines = parse_blame(text);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].author, "Ada");
        assert_eq!(lines[0].content, "let x = 1;");
        assert_eq!(lines[0].short_hash, "1234567");
        assert_eq!(lines[0].at, 1_700_000_000_000);
    }
}
