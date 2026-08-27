//! Safe process execution.
//!
//! This is the only module in GitEasy that starts a process, and it can start
//! exactly two: `git` and `gh`. There is no command string anywhere — callers
//! pass an argument vector, which goes to the OS as a vector, so nothing the
//! user types can become a second command. No shell is ever involved, which
//! means no quoting rules to get wrong and no `&&`, `;`, backtick or `$()`
//! injection surface.
//!
//! The frontend cannot reach this module. It calls named Tauri commands that
//! build their own argument lists from typed parameters; there is deliberately
//! no "run this git command" command to expose.

use std::path::Path;
use std::process::{Command, Stdio};

use crate::error::{redact, AppError, AppResult, ErrorKind};

/// Windows: keep `git.exe` from flashing a console window on every call.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// What a finished process produced.
#[derive(Debug, Clone)]
pub struct Output {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

impl Output {
    pub fn ok(&self) -> bool {
        self.code == 0
    }
}

/// Build a `Command` with the environment GitEasy always wants.
fn base(program: &str, cwd: Option<&Path>) -> Command {
    let mut command = Command::new(program);

    if let Some(dir) = cwd {
        command.current_dir(dir);
    }

    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Never let Git block on an interactive prompt. Without this a repository
    // needing credentials hangs the app forever with no window to type into;
    // with it, Git fails fast and we can tell the user to sign in.
    command.env("GIT_TERMINAL_PROMPT", "0");
    command.env("GIT_OPTIONAL_LOCKS", "0");
    // Deterministic, parseable output regardless of the user's config.
    command.env("LC_ALL", "C");
    command.env("GIT_PAGER", "cat");
    command.env("PAGER", "cat");
    // An editor would block forever; commits always pass -m or -F.
    command.env("GIT_EDITOR", "true");
    // Only ask for credentials through helpers that cannot prompt.
    command.env("GCM_INTERACTIVE", "never");

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
}

/// Run `git` inside `repo` and return its output, whatever the exit status.
///
/// Callers that treat a non-zero exit as failure should use [`git`] instead;
/// this one is for the many places where "did not match any file" is a normal
/// answer rather than an error.
pub fn git_raw(repo: &Path, args: &[&str]) -> AppResult<Output> {
    run("git", Some(repo), args, ErrorKind::GitMissing)
}

/// Run `git` inside `repo`, returning trimmed stdout, or an error if it failed.
pub fn git(repo: &Path, args: &[&str]) -> AppResult<String> {
    let out = git_raw(repo, args)?;

    if !out.ok() {
        return Err(classify_git(&out.stderr, args));
    }

    Ok(out.stdout.trim_end().to_string())
}

/// Run `git` with no repository — for `--version` and `config --global`.
pub fn git_global(args: &[&str]) -> AppResult<String> {
    let out = run("git", None, args, ErrorKind::GitMissing)?;

    if !out.ok() {
        return Err(classify_git(&out.stderr, args));
    }

    Ok(out.stdout.trim_end().to_string())
}

/// Run `gh`, the GitHub CLI. `repo` sets the working directory so `gh` can
/// infer which repository is meant from the folder it runs in.
pub fn gh_raw(repo: Option<&Path>, args: &[&str]) -> AppResult<Output> {
    run("gh", repo, args, ErrorKind::GitHubCliMissing)
}

/// Run `gh` and return stdout, or a classified error.
pub fn gh(repo: Option<&Path>, args: &[&str]) -> AppResult<String> {
    let out = gh_raw(repo, args)?;

    if !out.ok() {
        return Err(classify_gh(&out.stderr));
    }

    Ok(out.stdout.trim_end().to_string())
}

/// Spawn `program`, wait for it, and decode its output.
fn run(
    program: &str,
    cwd: Option<&Path>,
    args: &[&str],
    missing: ErrorKind,
) -> AppResult<Output> {
    let output = base(program, cwd).args(args).output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            match missing {
                ErrorKind::GitHubCliMissing => AppError::new(
                    ErrorKind::GitHubCliMissing,
                    "The GitHub CLI is not installed. GitEasy uses it to talk to GitHub — install it from cli.github.com, then try again.",
                ),
                _ => AppError::new(
                    ErrorKind::GitMissing,
                    "Git is not installed on this computer. GitEasy runs the real Git underneath — install it from git-scm.com, then try again.",
                ),
            }
        } else {
            AppError::new(ErrorKind::Unknown, format!("Could not start {program}."))
                .with_detail(e.to_string())
        }
    })?;

    Ok(Output {
        // Git output is usually UTF-8; a file name in another encoding should
        // not take the whole call down, so this is lossy on purpose.
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        code: output.status.code().unwrap_or(-1),
    })
}

/// Turn Git's stderr into something a beginner can act on.
fn classify_git(stderr: &str, args: &[&str]) -> AppError {
    let text = stderr.trim();
    let lower = text.to_lowercase();

    let kind = if lower.contains("could not resolve host")
        || lower.contains("failed to connect")
        || lower.contains("network is unreachable")
        || lower.contains("connection timed out")
        || lower.contains("operation timed out")
    {
        ErrorKind::Network
    } else if lower.contains("authentication failed")
        || lower.contains("could not read username")
        || lower.contains("permission denied (publickey)")
        || lower.contains("terminal prompts disabled")
    {
        ErrorKind::NotAuthenticated
    } else if lower.contains("conflict") {
        ErrorKind::Conflict
    } else if lower.contains("local changes")
        || lower.contains("would be overwritten")
        || lower.contains("unstaged changes")
        || lower.contains("please commit your changes or stash them")
    {
        ErrorKind::DirtyWorkingTree
    } else if lower.contains("not a git repository") {
        ErrorKind::NotARepository
    } else {
        ErrorKind::Rejected
    };

    let message = match kind {
        ErrorKind::Network => {
            "Could not reach GitHub. Check your internet connection — everything on this computer still works.".to_string()
        }
        ErrorKind::NotAuthenticated => {
            "GitHub would not accept the connection. Sign in from Settings, then try again.".to_string()
        }
        ErrorKind::DirtyWorkingTree => {
            "You have edits that would be overwritten. Commit them, or set them aside on the Shelf, then try again.".to_string()
        }
        ErrorKind::NotARepository => {
            return AppError::not_a_repository().with_detail(text);
        }
        ErrorKind::Conflict => {
            "Git stopped because two versions of the same lines disagree.".to_string()
        }
        _ => friendly_fallback(args, text),
    };

    AppError::new(kind, message).with_detail(text)
}

/// A readable sentence for the operation that failed, with Git's own words
/// kept as the detail rather than shown as the headline.
fn friendly_fallback(args: &[&str], stderr: &str) -> String {
    let action = args.first().copied().unwrap_or("run that");

    let described = match action {
        "push" => "Could not push to GitHub.",
        "pull" => "Could not pull from GitHub.",
        "fetch" => "Could not check GitHub for updates.",
        "commit" => "Could not commit.",
        "merge" => "Could not merge.",
        "rebase" => "Could not rebase.",
        "checkout" | "switch" => "Could not switch branch.",
        "branch" => "Could not change that branch.",
        "clone" => "Could not download that project.",
        "stash" => "Could not move that work to the Shelf.",
        "revert" => "Could not undo that commit.",
        "cherry-pick" => "Could not apply that commit.",
        "tag" => "Could not create that tag.",
        "reset" => "Could not reset.",
        _ => "Git could not finish that.",
    };

    // A single short line from Git is usually the most useful thing we can
    // say; anything longer stays in `detail`.
    let first = redact(stderr)
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or_default()
        .trim()
        .to_string();

    if first.is_empty() || first.len() > 160 {
        described.to_string()
    } else {
        format!("{described} {first}")
    }
}

/// Turn `gh` stderr into a classified error.
fn classify_gh(stderr: &str) -> AppError {
    let text = stderr.trim();
    let lower = text.to_lowercase();

    if lower.contains("not logged") || lower.contains("authentication required") || lower.contains("gh auth login") {
        return AppError::new(
            ErrorKind::NotAuthenticated,
            "You are not signed in to GitHub. Sign in from Settings to see pull requests, issues and checks.",
        )
        .with_detail(text);
    }

    if lower.contains("could not resolve")
        || lower.contains("dial tcp")
        || lower.contains("timeout")
        || lower.contains("no such host")
    {
        return AppError::new(
            ErrorKind::Network,
            "Could not reach GitHub. Check your internet connection — everything on this computer still works.",
        )
        .with_detail(text);
    }

    let first = redact(text)
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("GitHub refused that request.")
        .trim()
        .to_string();

    AppError::new(ErrorKind::Unknown, first).with_detail(text)
}

/// Whether `git` runs at all on this machine.
pub fn git_installed() -> bool {
    run("git", None, &["--version"], ErrorKind::GitMissing)
        .map(|o| o.ok())
        .unwrap_or(false)
}

/// Whether `gh` runs at all on this machine.
pub fn gh_installed() -> bool {
    run("gh", None, &["--version"], ErrorKind::GitHubCliMissing)
        .map(|o| o.ok())
        .unwrap_or(false)
}
