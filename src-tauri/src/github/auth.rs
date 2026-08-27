//! GitHub authentication, delegated entirely to the GitHub CLI.
//!
//! GitEasy never handles a credential. `gh auth login --web` opens github.com
//! in the real browser, the user approves there, and `gh` stores the resulting
//! token in the OS keychain. Nothing in this file reads, prints or persists a
//! token — the app only ever asks `gh` who is signed in.
//!
//! This is also where the Git identity and the GitHub account are deliberately
//! kept apart. `user.email` decides whose name is on a commit; the GitHub
//! account decides what the network calls are allowed to do. They are commonly
//! confused, so [`identity_warning`] says so out loud when they disagree.

use std::path::Path;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::exec::{gh, gh_installed, gh_raw};
use crate::models::GitHubAccount;

/// Who is signed in, or `None`.
///
/// Never an error: "nobody is signed in" is a normal state the whole GitHub
/// half of the UI is built to handle.
pub fn account() -> Option<GitHubAccount> {
    if !gh_installed() {
        return None;
    }

    // `gh api user` is the authoritative answer, and it fails fast when there
    // is no token rather than printing a partial status.
    let raw = gh(
        None,
        &[
            "api",
            "user",
            "--jq",
            "{login: .login, name: .name, avatarUrl: .avatar_url}",
        ],
    )
    .ok()?;

    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;

    let login = super::text(&value, "login");
    if login.is_empty() {
        return None;
    }

    let name = super::text(&value, "name");
    let avatar = super::text(&value, "avatarUrl");

    Some(GitHubAccount {
        name: if name.is_empty() { login.clone() } else { name },
        login,
        avatar_url: (!avatar.is_empty()).then_some(avatar),
    })
}

/// Whether `gh` has a token at all, without a network round trip.
pub fn is_authenticated() -> bool {
    if !gh_installed() {
        return false;
    }

    gh_raw(None, &["auth", "status"])
        .map(|out| out.ok())
        .unwrap_or(false)
}

/// Start the official GitHub browser sign-in.
///
/// Blocks until `gh` finishes, which is what makes the frontend's "Connecting…"
/// state resolve into a real account. `--web` is what opens github.com in the
/// user's own browser; no password is ever typed into GitEasy.
pub fn sign_in() -> AppResult<GitHubAccount> {
    if !gh_installed() {
        return Err(AppError::new(
            ErrorKind::GitHubCliMissing,
            "GitEasy signs in to GitHub using the official GitHub CLI, which is not installed. Get it from cli.github.com, then try again.",
        ));
    }

    if let Some(existing) = account() {
        return Ok(existing);
    }

    // `--git-protocol https` so pushes reuse this token instead of needing an
    // SSH key; `setup-git` makes Git itself use `gh` as its credential helper,
    // which is what removes the password prompt on push.
    let out = gh_raw(
        None,
        &[
            "auth",
            "login",
            "--hostname",
            "github.com",
            "--git-protocol",
            "https",
            "--web",
            "--skip-ssh-key",
        ],
    )?;

    if !out.ok() {
        let lower = out.stderr.to_lowercase();

        if lower.contains("already logged in") {
            if let Some(existing) = account() {
                return Ok(existing);
            }
        }

        return Err(AppError::new(
            ErrorKind::NotAuthenticated,
            "GitHub did not confirm the sign-in. Try again — a browser window should open for you to approve it.",
        )
        .with_detail(&out.stderr));
    }

    // Let Git reuse the CLI's credentials so pushing never prompts.
    let _ = gh_raw(None, &["auth", "setup-git"]);

    account().ok_or_else(|| {
        AppError::new(
            ErrorKind::NotAuthenticated,
            "GitHub did not confirm the sign-in. Try again.",
        )
    })
}

/// Sign out, which asks `gh` to forget its token.
pub fn sign_out() -> AppResult<()> {
    if !gh_installed() {
        return Ok(());
    }

    let out = gh_raw(None, &["auth", "logout", "--hostname", "github.com"])?;

    // Already signed out is success, not failure.
    if !out.ok() && !out.stderr.to_lowercase().contains("not logged in") {
        return Err(
            AppError::new(ErrorKind::Unknown, "Could not sign out of GitHub.")
                .with_detail(&out.stderr),
        );
    }

    Ok(())
}

/// Warn when the Git identity and the GitHub account do not line up.
///
/// A commit is attributed by its email, so a mismatch is why work sometimes
/// shows up on GitHub as an unlinked grey avatar. Every email on the account is
/// checked, including the private `noreply` one, because using that is correct
/// and should not be warned about.
pub fn identity_warning(git_email: Option<&str>, account: Option<&GitHubAccount>) -> Option<String> {
    let account = account?;
    let email = git_email?.trim().to_lowercase();

    if email.is_empty() {
        return None;
    }

    // GitHub's own private-commit address always matches the account.
    if email.ends_with("@users.noreply.github.com") {
        return if email.contains(&account.login.to_lowercase()) {
            None
        } else {
            Some(format!(
                "Your commits are signed with {email}, which belongs to a different GitHub account than @{}. They will not show up as yours on GitHub.",
                account.login
            ))
        };
    }

    let emails = account_emails();

    // No answer from GitHub (offline, or the token lacks the scope) means no
    // warning — guessing would be worse than staying quiet.
    if emails.is_empty() {
        return None;
    }

    if emails.iter().any(|known| known.to_lowercase() == email) {
        return None;
    }

    Some(format!(
        "Your commits are signed with {email}, which is not on your GitHub account (@{}). Work you push will not be linked to your profile. You can change this in Settings.",
        account.login
    ))
}

/// Every email address registered on the signed-in account.
fn account_emails() -> Vec<String> {
    let Ok(raw) = gh(None, &["api", "user/emails", "--jq", ".[].email"]) else {
        return Vec::new();
    };

    raw.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect()
}

/// Repositories the signed-in user can clone.
pub fn my_repos(limit: u32) -> AppResult<Vec<crate::models::RemoteRepo>> {
    let limit = limit.to_string();

    let raw = gh(
        None,
        &[
            "repo",
            "list",
            "--limit",
            &limit,
            "--json",
            "nameWithOwner,description,primaryLanguage,stargazerCount,isPrivate,isFork,updatedAt,url",
        ],
    )?;

    let value = super::parse_json(&raw)?;
    let items = value.as_array().cloned().unwrap_or_default();

    Ok(items
        .iter()
        .map(|item| crate::models::RemoteRepo {
            slug: super::text(item, "nameWithOwner"),
            description: super::text(item, "description"),
            language: item
                .get("primaryLanguage")
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str())
                .map(str::to_string),
            stars: super::number(item, "stargazerCount") as u32,
            is_private: item.get("isPrivate").and_then(|v| v.as_bool()).unwrap_or(false),
            is_fork: item.get("isFork").and_then(|v| v.as_bool()).unwrap_or(false),
            updated_at: super::iso_to_millis(&super::text(item, "updatedAt")),
            url: super::text(item, "url"),
        })
        .collect())
}

/// Create an empty repository on GitHub under the signed-in account.
pub fn create_repo(
    name: &str,
    description: &str,
    private: bool,
) -> AppResult<crate::models::RemoteRepo> {
    let name = name.trim();

    if name.is_empty() {
        return Err(AppError::invalid("Give the project a name."));
    }

    if name.starts_with('-') || name.contains('/') || name.contains(char::is_whitespace) {
        return Err(AppError::invalid(
            "A project name cannot contain spaces or slashes.",
        ));
    }

    let mut args: Vec<&str> = vec!["repo", "create", name];
    args.push(if private { "--private" } else { "--public" });

    if !description.trim().is_empty() {
        args.push("--description");
        args.push(description.trim());
    }

    let out = gh_raw(None, &args)?;

    if !out.ok() {
        let lower = out.stderr.to_lowercase();
        if lower.contains("already exists") {
            return Err(AppError::invalid(format!(
                "You already have a project called “{name}” on GitHub."
            )));
        }
        return Err(
            AppError::new(ErrorKind::Rejected, "Could not create that project on GitHub.")
                .with_detail(&out.stderr),
        );
    }

    let login = account().map(|a| a.login).unwrap_or_default();
    let slug = format!("{login}/{name}");

    Ok(crate::models::RemoteRepo {
        url: format!("https://github.com/{slug}"),
        slug,
        description: description.trim().to_string(),
        language: None,
        stars: 0,
        is_private: private,
        is_fork: false,
        updated_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0),
    })
}

/// Connect a local repository to a GitHub one as `origin`, and push it.
pub fn connect_and_push(repo: &Path, slug: &str) -> AppResult<()> {
    let url = format!("https://github.com/{slug}.git");

    // Replace an existing origin rather than failing — the caller has just
    // created the remote repository this points at.
    if crate::git::remote::list(repo)?.iter().any(|r| r.name == "origin") {
        crate::git::remote::set_url(repo, "origin", &url)?;
    } else {
        crate::git::remote::add(repo, "origin", &url)?;
    }

    // Only push if there is something to push; a brand-new repository with no
    // README has no commits yet.
    if crate::git::has_commits(repo) {
        crate::git::remote::push(repo, false)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn account_named(login: &str) -> GitHubAccount {
        GitHubAccount {
            login: login.to_string(),
            name: login.to_string(),
            avatar_url: None,
        }
    }

    #[test]
    fn no_warning_without_account() {
        assert!(identity_warning(Some("a@b.com"), None).is_none());
    }

    #[test]
    fn no_warning_without_email() {
        let account = account_named("ada");
        assert!(identity_warning(None, Some(&account)).is_none());
    }

    #[test]
    fn matching_noreply_is_fine() {
        let account = account_named("ada");
        assert!(identity_warning(Some("1234+ada@users.noreply.github.com"), Some(&account)).is_none());
    }

    #[test]
    fn mismatched_noreply_warns() {
        let account = account_named("ada");
        let warning = identity_warning(Some("99+bob@users.noreply.github.com"), Some(&account));
        assert!(warning.is_some());
        assert!(warning.unwrap().contains("ada"));
    }
}
