//! One error type for every command the frontend can call.
//!
//! The frontend renders `message` directly, so each one is written for a person
//! who has not learned Git — no command names, no exit codes, no stderr dumps
//! unless they carry real information. `kind` lets the UI branch (offer a retry,
//! open the sign-in flow) without matching on prose.

use serde::Serialize;

/// What went wrong, in the coarse categories the UI actually reacts to.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    /// The folder is not a repository, or the path does not exist.
    NotARepository,
    /// Git itself is missing from the machine.
    GitMissing,
    /// The GitHub CLI is missing.
    GitHubCliMissing,
    /// Nobody is signed in to GitHub.
    NotAuthenticated,
    /// The network is unreachable, or the remote refused the connection.
    Network,
    /// The operation stopped on conflicts the user has to resolve.
    Conflict,
    /// The working tree has changes that block the operation.
    DirtyWorkingTree,
    /// The user asked for something Git refused — bad branch name, etc.
    Rejected,
    /// A precondition the UI should have enforced, e.g. an empty message.
    InvalidInput,
    /// Anything else.
    Unknown,
}

/// An error the frontend can both display and branch on.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub kind: ErrorKind,
    /// Plain-English, safe to show verbatim.
    pub message: String,
    /// The underlying Git/gh output, for the "what actually happened" line.
    /// Never contains credentials — see `redact`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl AppError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        let detail = redact(&detail.into());
        if !detail.is_empty() {
            self.detail = Some(detail);
        }
        self
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::InvalidInput, message)
    }

    pub fn not_a_repository() -> Self {
        Self::new(
            ErrorKind::NotARepository,
            "That folder is not a Git project. Pick the top folder of your project — the one containing the .git folder.",
        )
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

pub type AppResult<T> = Result<T, AppError>;

/// Strip anything credential-shaped out of text before it is stored, logged or
/// sent to the frontend.
///
/// Git and `gh` both echo remote URLs on failure, and a URL that carries a
/// token (`https://x-access-token:ghp_…@github.com/…`) would otherwise travel
/// straight into a toast. Tokens are also matched on their own, because
/// `gh` prints them bare in some error paths.
pub fn redact(text: &str) -> String {
    let mut out = String::with_capacity(text.len());

    for line in text.lines() {
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(&redact_line(line));
    }

    out.trim().to_string()
}

fn redact_line(line: &str) -> String {
    let mut result = String::with_capacity(line.len());
    let mut rest = line;

    // Userinfo in a URL: scheme://<anything>@host -> scheme://***@host
    while let Some(scheme_at) = find_scheme(rest) {
        let (before, from_scheme) = rest.split_at(scheme_at);
        result.push_str(before);

        let after_scheme = match from_scheme.find("//") {
            Some(i) => i + 2,
            None => {
                result.push_str(from_scheme);
                return redact_tokens(&result);
            }
        };

        let (scheme_part, remainder) = from_scheme.split_at(after_scheme);
        result.push_str(scheme_part);

        // The authority ends at the first '/', '?' or whitespace.
        let authority_end = remainder
            .find(|c: char| c == '/' || c == '?' || c.is_whitespace())
            .unwrap_or(remainder.len());
        let (authority, tail) = remainder.split_at(authority_end);

        match authority.rfind('@') {
            Some(at) => {
                result.push_str("***");
                result.push_str(&authority[at..]);
            }
            None => result.push_str(authority),
        }

        rest = tail;
    }

    result.push_str(rest);
    redact_tokens(&result)
}

/// Find the byte index of the next `xxx://` scheme marker.
fn find_scheme(text: &str) -> Option<usize> {
    let marker = text.find("://")?;
    // Walk back over the scheme characters to the start of the scheme.
    let start = text[..marker]
        .rfind(|c: char| !c.is_ascii_alphanumeric() && c != '+' && c != '-' && c != '.')
        .map(|i| i + 1)
        .unwrap_or(0);
    Some(start)
}

/// Replace bare tokens that look like GitHub credentials.
fn redact_tokens(text: &str) -> String {
    const PREFIXES: [&str; 6] = ["ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_"];

    let mut result = String::with_capacity(text.len());

    for (i, word) in text.split_inclusive(char::is_whitespace).enumerate() {
        let _ = i;
        let trimmed = word.trim_end();
        let trailing = &word[trimmed.len()..];

        if PREFIXES.iter().any(|p| trimmed.starts_with(p)) {
            result.push_str("***");
            result.push_str(trailing);
        } else {
            result.push_str(word);
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_token_in_remote_url() {
        let input = "fatal: could not read https://x-access-token:ghp_abcdef1234@github.com/o/r.git";
        let out = redact(input);
        assert!(!out.contains("ghp_abcdef1234"));
        assert!(out.contains("***@github.com/o/r.git"));
    }

    #[test]
    fn redacts_bare_token() {
        let out = redact("token ghp_averysecretvalue rejected");
        assert_eq!(out, "token *** rejected");
    }

    #[test]
    fn redacts_pat_prefix() {
        let out = redact("using github_pat_11ABC_secret here");
        assert!(!out.contains("secret"));
    }

    #[test]
    fn leaves_ordinary_text_alone() {
        let input = "error: pathspec 'nope' did not match any file(s) known to git";
        assert_eq!(redact(input), input);
    }

    #[test]
    fn leaves_plain_url_alone() {
        let input = "remote: https://github.com/owner/repo.git";
        assert_eq!(redact(input), input);
    }

    #[test]
    fn detail_is_redacted_when_attached() {
        let err = AppError::new(ErrorKind::Network, "Could not reach GitHub.")
            .with_detail("https://user:ghp_secret@github.com/o/r");
        let detail = err.detail.unwrap();
        assert!(!detail.contains("ghp_secret"));
    }
}
