//! Opening, creating, cloning and describing a repository.

use std::path::Path;

use super::{current_branch, has_commits, repo_path, toplevel};
use crate::error::{AppError, AppResult, ErrorKind};
use crate::exec::{git, git_raw};
use crate::models::{Repository, UpstreamRepo};

/// Convert a remote URL into a browsable GitHub address.
///
/// Handles the three forms Git hands out — SSH, HTTPS and `ssh://` — and
/// deliberately returns `None` for anything not on github.com, because the
/// whole GitHub half of the app keys off this being present.
pub fn parse_github_url(remote: &str) -> Option<String> {
    let remote = remote.trim().trim_end_matches('/');
    let remote = remote.strip_suffix(".git").unwrap_or(remote);

    if let Some(rest) = remote.strip_prefix("git@github.com:") {
        return Some(format!("https://github.com/{rest}"));
    }

    // Credentials sit between the scheme and the host, so they have to come out
    // before the host can be matched at all. A URL pasted from a password
    // manager, or one Git rewrote with a helper, arrives in this shape — and
    // failing to parse it would leave the app thinking the project has no
    // GitHub remote.
    for scheme in ["https://", "http://", "ssh://"] {
        let Some(after_scheme) = remote.strip_prefix(scheme) else {
            continue;
        };

        // The authority ends at the first slash; any `@` inside it is userinfo.
        let (authority, path) = match after_scheme.find('/') {
            Some(i) => (&after_scheme[..i], &after_scheme[i + 1..]),
            None => (after_scheme, ""),
        };

        let host = authority.rsplit('@').next().unwrap_or(authority);

        if host.eq_ignore_ascii_case("github.com") && !path.is_empty() {
            return Some(format!("https://github.com/{path}"));
        }
    }

    None
}

/// `owner/name` from a GitHub URL.
pub fn slug_from_url(url: &str) -> Option<String> {
    let rest = url.trim_end_matches('/').strip_prefix("https://github.com/")?;
    let mut parts = rest.split('/');
    let owner = parts.next()?;
    let name = parts.next()?;
    if owner.is_empty() || name.is_empty() {
        return None;
    }
    Some(format!("{owner}/{name}"))
}

/// The branch this project treats as its trunk.
///
/// Asks the remote first (`origin/HEAD`), because that is the branch GitHub
/// itself calls default. Falls back to whichever of the usual names exists,
/// then to the current branch — a local-only project has no other answer.
pub fn default_branch(repo: &Path) -> String {
    if let Ok(head) = git(repo, &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]) {
        if let Some(name) = head.trim().strip_prefix("origin/") {
            if !name.is_empty() {
                return name.to_string();
            }
        }
    }

    for candidate in ["main", "master", "trunk", "develop"] {
        if git(
            repo,
            &["rev-parse", "--verify", "--quiet", &format!("refs/heads/{candidate}")],
        )
        .is_ok()
        {
            return candidate.to_string();
        }
    }

    current_branch(repo).unwrap_or_else(|_| "main".to_string())
}

/// Read the `upstream` remote as the project this one was forked from.
fn upstream_repo(repo: &Path) -> Option<UpstreamRepo> {
    let url = git(repo, &["remote", "get-url", "upstream"]).ok()?;
    let github_url = parse_github_url(&url)?;
    let slug = slug_from_url(&github_url)?;

    // The upstream's own default branch, as recorded by the last fetch.
    let default_branch = git(repo, &["symbolic-ref", "--short", "refs/remotes/upstream/HEAD"])
        .ok()
        .and_then(|head| head.trim().strip_prefix("upstream/").map(str::to_string))
        .unwrap_or_else(|| "main".to_string());

    Some(UpstreamRepo {
        slug,
        url: github_url,
        default_branch,
    })
}

/// Describe an already-validated repository.
pub fn describe(repo: &Path) -> AppResult<Repository> {
    let root = toplevel(repo).unwrap_or_else(|_| repo.to_path_buf());

    let branch = current_branch(&root)?;
    let github_url = git(&root, &["remote", "get-url", "origin"])
        .ok()
        .as_deref()
        .and_then(parse_github_url);

    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "repository".to_string());

    Ok(Repository {
        name,
        path: root.to_string_lossy().to_string(),
        branch,
        github_url,
        upstream: upstream_repo(&root),
        default_branch: default_branch(&root),
    })
}

/// Read the repository at `path`, or explain why it cannot be used.
pub fn open(path: &str) -> AppResult<Repository> {
    let repo = repo_path(path)?;
    describe(&repo)
}

/// Whether a folder is (inside) a Git repository — used to detect projects
/// without the noise of a failed open.
pub fn detect(path: &str) -> bool {
    repo_path(path).is_ok()
}

/// Turn `path` into a new Git repository, or read it if it already is one.
///
/// A README is the only file GitEasy writes on the user's behalf, and only when
/// asked: a repository with zero commits has nothing for the rest of the app to
/// show, so this gives a brand-new project something to look at immediately.
pub fn init(path: &str, name: &str, with_readme: bool) -> AppResult<Repository> {
    let folder = Path::new(path);

    if !folder.exists() {
        std::fs::create_dir_all(folder)
            .map_err(|e| AppError::invalid(format!("Could not create that folder ({e})")))?;
    }

    if !folder.is_dir() {
        return Err(AppError::invalid("That path is a file, not a folder."));
    }

    let already = folder.join(".git").exists();

    if !already {
        // `-b main` avoids the "hint: using master" warning and matches what
        // GitHub creates, but it needs Git 2.28+; fall back for older ones.
        if git(folder, &["init", "-b", "main"]).is_err() {
            git(folder, &["init"])?;
            git(folder, &["checkout", "-b", "main"]).ok();
        }
    }

    if with_readme {
        let readme = folder.join("README.md");
        if !readme.exists() {
            let title = if name.trim().is_empty() {
                folder
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Project".to_string())
            } else {
                name.trim().to_string()
            };

            std::fs::write(&readme, format!("# {title}\n"))
                .map_err(|e| AppError::invalid(format!("Could not write README.md ({e})")))?;

            git(folder, &["add", "--", "README.md"])?;
            // Only commit if an identity exists — committing without one fails
            // with a wall of Git advice, and the UI has a setup screen for it.
            if super::commits::identity_configured(folder) {
                git(folder, &["commit", "--message", "Add README"])?;
            }
        }
    }

    let repo = repo_path(&folder.to_string_lossy())?;
    describe(&repo)
}

/// Clone `url` into `destination`, returning the new repository.
///
/// The folder Git creates is named after the repository, so the path the user
/// picked is the *parent*. That matches the dialog's wording ("Where should the
/// project go?") and means cloning twice does not silently merge two projects.
pub fn clone(url: &str, destination: &str) -> AppResult<Repository> {
    let url = url.trim();

    if url.is_empty() {
        return Err(AppError::invalid("Paste the address of the project first."));
    }

    // Only accept the transports Git can actually use for GitHub, and reject
    // anything that could be read as a flag or a local file path trick.
    let allowed = url.starts_with("https://")
        || url.starts_with("http://")
        || url.starts_with("git@")
        || url.starts_with("ssh://")
        || url.starts_with("git://");

    if !allowed || url.starts_with('-') {
        return Err(AppError::invalid(
            "That does not look like a project address. It should start with https:// or git@.",
        ));
    }

    let parent = Path::new(destination);
    if !parent.is_dir() {
        return Err(AppError::invalid("Pick a folder to put the project in."));
    }

    let folder_name = clone_folder_name(url);
    let target = parent.join(&folder_name);

    if target.exists() {
        return Err(AppError::invalid(format!(
            "A folder called “{folder_name}” is already there. Rename it, or pick another location."
        )));
    }

    // `--` stops any later argument being read as an option.
    let out = git_raw(
        parent,
        &["clone", "--progress", "--", url, &folder_name],
    )?;

    if !out.ok() {
        let lower = out.stderr.to_lowercase();
        let kind = if lower.contains("could not resolve host") || lower.contains("failed to connect")
        {
            ErrorKind::Network
        } else if lower.contains("authentication")
            || lower.contains("terminal prompts disabled")
            || lower.contains("permission denied")
        {
            ErrorKind::NotAuthenticated
        } else {
            ErrorKind::Rejected
        };

        let message = match kind {
            ErrorKind::Network => {
                "Could not reach that address. Check your internet connection and the link."
            }
            ErrorKind::NotAuthenticated => {
                "That project is private, or needs a sign-in. Sign in to GitHub from Settings, then try again."
            }
            _ => "Could not download that project. Check the address and try again.",
        };

        return Err(AppError::new(kind, message).with_detail(&out.stderr));
    }

    let repo = repo_path(&target.to_string_lossy())?;
    describe(&repo)
}

/// The folder name `git clone` would choose for a URL.
fn clone_folder_name(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    let trimmed = trimmed.strip_suffix(".git").unwrap_or(trimmed);

    let last = trimmed
        .rsplit(|c| c == '/' || c == ':')
        .find(|part| !part.is_empty())
        .unwrap_or("project");

    // Never let a URL choose a path — only the final segment is kept, and
    // anything path-shaped in it is dropped.
    last.replace(['\\', '/', ':'], "").trim().to_string()
}

/// True when the repository has no commits yet, which several screens treat as
/// a first-run state rather than an empty list.
pub fn is_empty(repo: &Path) -> bool {
    !has_commits(repo)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ssh_remote() {
        assert_eq!(
            parse_github_url("git@github.com:owner/repo.git"),
            Some("https://github.com/owner/repo".into())
        );
    }

    #[test]
    fn parses_https_remote() {
        assert_eq!(
            parse_github_url("https://github.com/owner/repo.git"),
            Some("https://github.com/owner/repo".into())
        );
    }

    #[test]
    fn parses_ssh_protocol_remote() {
        assert_eq!(
            parse_github_url("ssh://git@github.com/owner/repo.git"),
            Some("https://github.com/owner/repo".into())
        );
    }

    #[test]
    fn strips_credentials_from_https_remote() {
        assert_eq!(
            parse_github_url("https://user:token@github.com/owner/repo.git"),
            Some("https://github.com/owner/repo".into())
        );
    }

    #[test]
    fn ignores_non_github_remote() {
        assert_eq!(parse_github_url("git@gitlab.com:owner/repo.git"), None);
    }

    #[test]
    fn extracts_slug() {
        assert_eq!(
            slug_from_url("https://github.com/owner/repo"),
            Some("owner/repo".into())
        );
    }

    #[test]
    fn clone_folder_from_https() {
        assert_eq!(clone_folder_name("https://github.com/owner/repo.git"), "repo");
    }

    #[test]
    fn clone_folder_from_ssh() {
        assert_eq!(clone_folder_name("git@github.com:owner/repo.git"), "repo");
    }

    #[test]
    fn clone_folder_never_contains_separators() {
        let name = clone_folder_name("https://example.com/a/b/../../etc/passwd");
        assert!(!name.contains('/'));
        assert!(!name.contains('\\'));
    }
}
