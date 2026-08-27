//! Optional AI: commit messages, change summaries, error and conflict
//! explanations.
//!
//! Three rules shape this module.
//!
//! 1. **Optional.** Every entry point falls back to a local heuristic. With no
//!    key configured the app is fully usable and never touches the network.
//! 2. **Minimal.** What leaves the machine is the smallest thing that can
//!    answer the question — file names and a trimmed diff, never the whole
//!    repository, never history, never remote URLs.
//! 3. **Explicit.** Nothing here runs unless the caller asked for it, and the
//!    key comes from the environment rather than being stored by GitEasy.

use serde::Serialize;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::models::{ChangedFile, CommitSuggestion};

/// How much diff text is ever sent, in bytes.
const MAX_DIFF_BYTES: usize = 6_000;

/// Whether an AI key is available, so the UI can show or hide the feature.
pub fn available() -> bool {
    api_key().is_some()
}

/// The key, read from the environment at call time.
///
/// Deliberately not stored by GitEasy: no key in the database, no key in a
/// config file this app writes.
fn api_key() -> Option<String> {
    std::env::var("ANTHROPIC_API_KEY")
        .ok()
        .map(|k| k.trim().to_string())
        .filter(|k| !k.is_empty())
}

/* -------------------------------------------------------------------------- */
/* Commit messages                                                             */
/* -------------------------------------------------------------------------- */

/// Suggest a commit message for a set of changes.
///
/// Uses the model when a key is present and `use_ai` is set; otherwise returns
/// the local heuristic, which is what keeps the app working offline and free.
pub fn suggest_commit_message(
    files: &[ChangedFile],
    diff: &str,
    use_ai: bool,
) -> CommitSuggestion {
    if files.is_empty() {
        return CommitSuggestion {
            message: String::new(),
            explanation: String::new(),
        };
    }

    if use_ai && available() {
        if let Ok(suggestion) = remote_commit_message(files, diff) {
            return suggestion;
        }
        // A failed call is not an error the user needs to see — the local
        // suggestion is a perfectly good answer.
    }

    local_commit_message(files)
}

/// A deterministic, offline commit message built from the changes themselves.
pub fn local_commit_message(files: &[ChangedFile]) -> CommitSuggestion {
    if files.is_empty() {
        return CommitSuggestion {
            message: String::new(),
            explanation: String::new(),
        };
    }

    let added = files.iter().filter(|f| f.status == "added" || f.status == "untracked").count();
    let deleted = files.iter().filter(|f| f.status == "deleted").count();
    let modified = files.len() - added - deleted;

    // Name the change after the files it touches, most-changed first.
    let mut sorted: Vec<&ChangedFile> = files.iter().collect();
    sorted.sort_by_key(|f| std::cmp::Reverse(f.additions + f.deletions));

    let subjects: Vec<String> = sorted
        .iter()
        .take(2)
        .map(|f| {
            let name = f.path.rsplit('/').next().unwrap_or(&f.path);
            name.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(name).to_string()
        })
        .collect();

    let kind = if added == files.len() {
        "feat"
    } else if deleted > 0 && added == 0 && modified == 0 {
        "chore"
    } else if files.iter().any(|f| f.path.contains("test")) {
        "test"
    } else if files.iter().all(|f| {
        f.path.ends_with(".md") || f.path.ends_with(".txt")
    }) {
        "docs"
    } else if deleted > 0 {
        "refactor"
    } else {
        "feat"
    };

    let subject = if subjects.is_empty() {
        "project files".to_string()
    } else {
        subjects.join(" and ")
    };

    let explanation = match (added, modified, deleted) {
        (a, 0, 0) if a > 0 => format!(
            "{a} new {} added.",
            if a == 1 { "file was" } else { "files were" }
        ),
        (0, m, 0) if m > 0 => format!(
            "{m} {} changed.",
            if m == 1 { "file was" } else { "files were" }
        ),
        (a, m, d) => {
            let mut parts = Vec::new();
            if a > 0 {
                parts.push(format!("{a} added"));
            }
            if m > 0 {
                parts.push(format!("{m} changed"));
            }
            if d > 0 {
                parts.push(format!("{d} deleted"));
            }
            format!("{}.", parts.join(", "))
        }
    };

    CommitSuggestion {
        message: format!("{kind}: update {subject}"),
        explanation,
    }
}

/// Ask the model for a commit message.
fn remote_commit_message(files: &[ChangedFile], diff: &str) -> AppResult<CommitSuggestion> {
    let names: Vec<&str> = files.iter().map(|f| f.path.as_str()).take(20).collect();

    let prompt = format!(
        "Write a git commit message for these changes.\n\n\
         Files: {}\n\n\
         Diff (may be truncated):\n{}\n\n\
         Reply with exactly two lines:\n\
         Line 1: a conventional-commit subject (type: summary), at most 72 characters.\n\
         Line 2: one plain-English sentence a beginner would understand, describing what changed.",
        names.join(", "),
        trim_diff(diff)
    );

    let reply = ask(&prompt, 300)?;
    let mut lines = reply.lines().filter(|l| !l.trim().is_empty());

    let message = lines.next().unwrap_or_default().trim().to_string();
    let explanation = lines.next().unwrap_or_default().trim().to_string();

    if message.is_empty() {
        return Err(AppError::new(ErrorKind::Unknown, "No suggestion came back."));
    }

    Ok(CommitSuggestion {
        message,
        explanation,
    })
}

/* -------------------------------------------------------------------------- */
/* Explanations                                                                */
/* -------------------------------------------------------------------------- */

/// A plain-English summary of what a set of changes does.
pub fn summarise_changes(files: &[ChangedFile], diff: &str) -> AppResult<String> {
    require_key()?;

    let names: Vec<&str> = files.iter().map(|f| f.path.as_str()).take(20).collect();

    let prompt = format!(
        "Summarise these code changes in two or three sentences, for someone who is learning to program. \
         Say what changed and why it might have been done. Do not mention git commands.\n\n\
         Files: {}\n\nDiff (may be truncated):\n{}",
        names.join(", "),
        trim_diff(diff)
    );

    ask(&prompt, 400)
}

/// Explain a Git error in plain English.
///
/// Only the error text is sent — no paths, no repository name, no remote URL.
pub fn explain_error(message: &str, detail: Option<&str>) -> AppResult<String> {
    require_key()?;

    // The detail has already been redacted by `AppError`, but this is the last
    // point before something leaves the machine, so it is redacted again.
    let detail = detail.map(crate::error::redact).unwrap_or_default();

    let prompt = format!(
        "A Git client showed this error to someone who is new to Git:\n\n\
         {}\n{}\n\n\
         In three sentences or fewer, explain what it means and what to do next. \
         Plain English, no jargon, no command line unless it is unavoidable.",
        crate::error::redact(message),
        detail
    );

    ask(&prompt, 350)
}

/// Explain one merge conflict: what each side did, and how to choose.
pub fn explain_conflict(path: &str, mine: &[String], theirs: &[String]) -> AppResult<String> {
    require_key()?;

    // Only the conflicting lines travel — not the file, not the project.
    let prompt = format!(
        "Two people changed the same lines of `{}` and Git cannot merge them automatically.\n\n\
         Version A (mine):\n{}\n\n\
         Version B (theirs):\n{}\n\n\
         In three sentences or fewer, explain what each version does differently and what to consider \
         when choosing. Plain English, for someone new to Git. Do not tell them to run any command.",
        file_name(path),
        clip(&mine.join("\n"), 1_500),
        clip(&theirs.join("\n"), 1_500)
    );

    ask(&prompt, 350)
}

fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn require_key() -> AppResult<()> {
    if available() {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorKind::InvalidInput,
            "AI explanations are switched off. They need an API key, and GitEasy works completely without them.",
        ))
    }
}

/// Keep a diff under the size limit, cutting at a line boundary.
fn trim_diff(diff: &str) -> String {
    clip(diff, MAX_DIFF_BYTES)
}

fn clip(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_string();
    }

    let mut end = limit;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }

    let cut = text[..end].rfind('\n').unwrap_or(end);
    format!("{}\n… (truncated)", &text[..cut])
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

#[derive(Serialize)]
struct Message<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct Request<'a> {
    model: &'a str,
    max_tokens: u32,
    messages: Vec<Message<'a>>,
}

/// Send one prompt and return the reply text.
fn ask(prompt: &str, max_tokens: u32) -> AppResult<String> {
    let key = api_key().ok_or_else(|| {
        AppError::new(ErrorKind::InvalidInput, "No API key is configured.")
    })?;

    let body = Request {
        model: "claude-sonnet-5",
        max_tokens,
        messages: vec![Message {
            role: "user",
            content: prompt,
        }],
    };

    let payload = serde_json::to_string(&body)
        .map_err(|e| AppError::new(ErrorKind::Unknown, "Could not prepare the request.").with_detail(e.to_string()))?;

    let response = ureq::post("https://api.anthropic.com/v1/messages")
        .set("x-api-key", &key)
        .set("anthropic-version", "2023-06-01")
        .set("content-type", "application/json")
        .timeout(std::time::Duration::from_secs(30))
        .send_string(&payload);

    let text = match response {
        Ok(response) => response
            .into_string()
            .map_err(|e| AppError::new(ErrorKind::Network, "The reply could not be read.").with_detail(e.to_string()))?,
        Err(ureq::Error::Status(status, response)) => {
            let detail = response.into_string().unwrap_or_default();

            let message = match status {
                401 | 403 => "The AI key was refused. Check it, or switch the feature off.",
                429 => "The AI service is rate-limiting requests. Try again shortly.",
                500..=599 => "The AI service is having trouble. Try again shortly.",
                _ => "The AI service refused that request.",
            };

            // Never surface the raw body — it can echo the key back.
            return Err(AppError::new(ErrorKind::Network, message)
                .with_detail(crate::error::redact(&detail).chars().take(200).collect::<String>()));
        }
        Err(e) => {
            return Err(AppError::new(
                ErrorKind::Network,
                "Could not reach the AI service. Everything else in GitEasy still works.",
            )
            .with_detail(e.to_string()))
        }
    };

    parse_reply(&text)
}

/// Pull the text out of the Messages API response.
fn parse_reply(body: &str) -> AppResult<String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|e| AppError::new(ErrorKind::Unknown, "The reply could not be read.").with_detail(e.to_string()))?;

    let text = value
        .get("content")
        .and_then(|c| c.as_array())
        .map(|blocks| {
            blocks
                .iter()
                .filter_map(|block| block.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<&str>>()
                .join("\n")
        })
        .unwrap_or_default();

    if text.trim().is_empty() {
        return Err(AppError::new(ErrorKind::Unknown, "The AI service sent an empty reply."));
    }

    Ok(text.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str, status: &str, additions: u32) -> ChangedFile {
        ChangedFile {
            path: path.into(),
            status: status.into(),
            additions,
            deletions: 0,
            staged: true,
            diff: String::new(),
            original_path: None,
        }
    }

    #[test]
    fn empty_changes_give_empty_suggestion() {
        let suggestion = local_commit_message(&[]);
        assert!(suggestion.message.is_empty());
    }

    #[test]
    fn all_new_files_are_a_feature() {
        let files = vec![file("src/auth.js", "added", 30)];
        let suggestion = local_commit_message(&files);
        assert!(suggestion.message.starts_with("feat:"));
        assert!(suggestion.message.contains("auth"));
    }

    #[test]
    fn markdown_only_changes_are_docs() {
        let files = vec![file("README.md", "modified", 3)];
        let suggestion = local_commit_message(&files);
        assert!(suggestion.message.starts_with("docs:"));
    }

    #[test]
    fn names_the_biggest_change_first() {
        let files = vec![file("small.js", "modified", 1), file("big.js", "modified", 90)];
        let suggestion = local_commit_message(&files);
        assert!(suggestion.message.contains("big"));
    }

    #[test]
    fn clip_cuts_on_a_line_boundary() {
        let text = "one\ntwo\nthree\nfour";
        let clipped = clip(text, 9);
        assert!(clipped.contains("truncated"));
        assert!(!clipped.contains("four"));
    }

    #[test]
    fn clip_leaves_short_text_alone() {
        assert_eq!(clip("short", 100), "short");
    }

    #[test]
    fn parses_a_messages_reply() {
        let body = r#"{"content":[{"type":"text","text":"feat: add auth\nSign-in was added."}]}"#;
        let reply = parse_reply(body).unwrap();
        assert!(reply.starts_with("feat: add auth"));
    }

    #[test]
    fn empty_reply_is_an_error() {
        assert!(parse_reply(r#"{"content":[]}"#).is_err());
    }
}
