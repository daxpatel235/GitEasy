//! Issues, through `gh issue`.

use std::path::Path;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::exec::{gh, gh_raw};
use crate::models::Issue;

const FIELDS: &str = "number,title,author,state,createdAt,comments,labels,url,assignees";

/// Every issue on this repository, open and closed.
pub fn list(repo: &Path, me: Option<&str>) -> AppResult<Vec<Issue>> {
    let raw = gh(
        Some(repo),
        &["issue", "list", "--state", "all", "--limit", "50", "--json", FIELDS],
    )?;

    let value = super::parse_json(&raw)?;
    let items = value.as_array().cloned().unwrap_or_default();

    Ok(items.iter().map(|item| build(item, me)).collect())
}

fn build(item: &serde_json::Value, me: Option<&str>) -> Issue {
    let assigned_to_me = me
        .map(|login| {
            item.get("assignees")
                .and_then(|v| v.as_array())
                .map(|list| {
                    list.iter().any(|a| {
                        a.get("login")
                            .and_then(|v| v.as_str())
                            .map(|l| l.eq_ignore_ascii_case(login))
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(false)
        })
        .unwrap_or(false);

    Issue {
        number: super::number(item, "number"),
        title: super::text(item, "title"),
        author: super::login(item, "author"),
        state: if super::text(item, "state").eq_ignore_ascii_case("CLOSED") {
            "closed".into()
        } else {
            "open".into()
        },
        created_at: super::iso_to_millis(&super::text(item, "createdAt")),
        comment_count: item
            .get("comments")
            .and_then(|v| v.as_array())
            .map(|a| a.len() as u32)
            .unwrap_or(0),
        labels: super::labels(item),
        url: super::text(item, "url"),
        assigned_to_me,
    }
}

/// Open a new issue.
pub fn create(repo: &Path, title: &str, body: &str) -> AppResult<Issue> {
    let title = title.trim();

    if title.is_empty() {
        return Err(AppError::invalid("Give the issue a title."));
    }

    // `--body` is always passed so `gh` never opens an editor.
    let out = gh_raw(
        Some(repo),
        &["issue", "create", "--title", title, "--body", body],
    )?;

    if !out.ok() {
        let lower = out.stderr.to_lowercase();

        if lower.contains("issues are disabled") || lower.contains("not have issues") {
            return Err(AppError::invalid(
                "Issues are turned off for this project on GitHub.",
            ));
        }

        return Err(
            AppError::new(ErrorKind::Rejected, "Could not create that issue.")
                .with_detail(&out.stderr),
        );
    }

    let url = out.stdout.trim().lines().last().unwrap_or_default().trim();
    let number = url.rsplit('/').next().and_then(|n| n.parse::<u64>().ok());

    if let Some(number) = number {
        let number_arg = number.to_string();
        if let Ok(raw) = gh(Some(repo), &["issue", "view", &number_arg, "--json", FIELDS]) {
            if let Ok(value) = super::parse_json(&raw) {
                let me = super::auth::account().map(|a| a.login);
                return Ok(build(&value, me.as_deref()));
            }
        }
    }

    Err(AppError::new(
        ErrorKind::Unknown,
        "The issue was created, but GitEasy could not read it back. Refresh to see it.",
    ))
}

/// Close an issue.
pub fn close(repo: &Path, number: u64) -> AppResult<()> {
    let number_arg = number.to_string();
    gh(Some(repo), &["issue", "close", &number_arg])?;
    Ok(())
}

/// Reopen a closed issue.
pub fn reopen(repo: &Path, number: u64) -> AppResult<()> {
    let number_arg = number.to_string();
    gh(Some(repo), &["issue", "reopen", &number_arg])?;
    Ok(())
}
