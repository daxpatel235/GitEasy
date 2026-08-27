//! Pull requests, through `gh pr`.

use std::path::Path;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::exec::{gh, gh_raw};
use crate::models::PullRequest;

const FIELDS: &str = "number,title,author,state,isDraft,headRefName,baseRefName,createdAt,updatedAt,comments,reviewDecision,statusCheckRollup,additions,deletions,changedFiles,labels,url,mergeable";

/// Every pull request on this repository, open and closed.
pub fn list(repo: &Path, me: Option<&str>) -> AppResult<Vec<PullRequest>> {
    let raw = gh(
        Some(repo),
        &["pr", "list", "--state", "all", "--limit", "50", "--json", FIELDS],
    )?;

    let value = super::parse_json(&raw)?;
    let items = value.as_array().cloned().unwrap_or_default();

    // Which PRs the signed-in user has been asked to review needs its own
    // query — the list JSON does not carry it.
    let requested = review_requested_numbers(repo);

    Ok(items
        .iter()
        .map(|item| build(item, me, &requested))
        .collect())
}

/// The numbers of PRs awaiting the signed-in user's review.
fn review_requested_numbers(repo: &Path) -> Vec<u64> {
    let Ok(raw) = gh(
        Some(repo),
        &[
            "pr",
            "list",
            "--search",
            "review-requested:@me",
            "--state",
            "open",
            "--limit",
            "50",
            "--json",
            "number",
        ],
    ) else {
        return Vec::new();
    };

    let Ok(value) = super::parse_json(&raw) else {
        return Vec::new();
    };

    value
        .as_array()
        .map(|items| items.iter().map(|i| super::number(i, "number")).collect())
        .unwrap_or_default()
}

fn build(item: &serde_json::Value, me: Option<&str>, requested: &[u64]) -> PullRequest {
    let number = super::number(item, "number");
    let author = super::login(item, "author");

    let raw_state = super::text(item, "state").to_uppercase();
    let is_draft = item.get("isDraft").and_then(|v| v.as_bool()).unwrap_or(false);

    // GitHub reports OPEN/CLOSED/MERGED plus a separate draft flag; the UI
    // treats draft as its own state.
    let state = match raw_state.as_str() {
        "MERGED" => "merged",
        "CLOSED" => "closed",
        _ if is_draft => "draft",
        _ => "open",
    };

    let review = match super::text(item, "reviewDecision").to_uppercase().as_str() {
        "APPROVED" => "approved",
        "CHANGES_REQUESTED" => "changes-requested",
        "REVIEW_REQUIRED" => "pending",
        "" => "none",
        _ => "pending",
    };

    PullRequest {
        number,
        title: super::text(item, "title"),
        is_mine: me.map(|m| m.eq_ignore_ascii_case(&author)).unwrap_or(false),
        author,
        state: state.to_string(),
        head: super::text(item, "headRefName"),
        base: super::text(item, "baseRefName"),
        created_at: super::iso_to_millis(&super::text(item, "createdAt")),
        updated_at: super::iso_to_millis(&super::text(item, "updatedAt")),
        comment_count: item
            .get("comments")
            .and_then(|v| v.as_array())
            .map(|a| a.len() as u32)
            .unwrap_or(0),
        review: review.to_string(),
        checks: rollup_state(item),
        additions: super::number(item, "additions") as u32,
        deletions: super::number(item, "deletions") as u32,
        changed_files: super::number(item, "changedFiles") as u32,
        labels: super::labels(item),
        url: super::text(item, "url"),
        review_requested: requested.contains(&number),
        mergeable: super::text(item, "mergeable").eq_ignore_ascii_case("MERGEABLE"),
    }
}

/// Collapse the per-check rollup into the UI's single state.
pub fn rollup_state(item: &serde_json::Value) -> String {
    let Some(checks) = item.get("statusCheckRollup").and_then(|v| v.as_array()) else {
        return "none".to_string();
    };

    if checks.is_empty() {
        return "none".to_string();
    }

    let mut running = false;
    let mut failing = false;

    for check in checks {
        // Actions use `status`/`conclusion`; older statuses use `state`.
        let status = super::text(check, "status").to_uppercase();
        let conclusion = super::text(check, "conclusion").to_uppercase();
        let state = super::text(check, "state").to_uppercase();

        if status == "IN_PROGRESS" || status == "QUEUED" || status == "PENDING" || state == "PENDING"
        {
            running = true;
        }

        if conclusion == "FAILURE"
            || conclusion == "TIMED_OUT"
            || conclusion == "CANCELLED"
            || state == "FAILURE"
            || state == "ERROR"
        {
            failing = true;
        }
    }

    if failing {
        "failing".to_string()
    } else if running {
        "running".to_string()
    } else {
        "passing".to_string()
    }
}

/// Open a pull request.
pub fn create(
    repo: &Path,
    head: &str,
    base: &str,
    title: &str,
    body: &str,
    draft: bool,
) -> AppResult<PullRequest> {
    let title = title.trim();
    let head = head.trim();
    let base = base.trim();

    if title.is_empty() {
        return Err(AppError::invalid("Give the pull request a title."));
    }
    if head.is_empty() || base.is_empty() {
        return Err(AppError::invalid(
            "A pull request needs a branch to merge from and one to merge into.",
        ));
    }
    if head == base {
        return Err(AppError::invalid(
            "A branch cannot be merged into itself. Pick a different target.",
        ));
    }

    let mut args: Vec<&str> = vec![
        "pr", "create", "--head", head, "--base", base, "--title", title,
    ];

    // `--body` must always be passed; without it `gh` opens an editor.
    args.push("--body");
    args.push(body);

    if draft {
        args.push("--draft");
    }

    let out = gh_raw(Some(repo), &args)?;

    if !out.ok() {
        let lower = out.stderr.to_lowercase();

        if lower.contains("no commits between") {
            return Err(AppError::invalid(format!(
                "{head} has nothing that {base} does not already have, so there is nothing to review."
            )));
        }

        if lower.contains("already exists") {
            return Err(AppError::invalid(
                "A pull request for that branch is already open.",
            ));
        }

        if lower.contains("must first push") || lower.contains("head sha") {
            return Err(AppError::invalid(
                "That branch is not on GitHub yet. Push it first, then open the pull request.",
            ));
        }

        return Err(
            AppError::new(ErrorKind::Rejected, "Could not open that pull request.")
                .with_detail(&out.stderr),
        );
    }

    // `gh` prints the new PR's URL; read the number back off it.
    let url = out.stdout.trim().lines().last().unwrap_or_default().trim();
    let number = url.rsplit('/').next().and_then(|n| n.parse::<u64>().ok());

    if let Some(number) = number {
        if let Ok(pr) = get(repo, number) {
            return Ok(pr);
        }
    }

    Err(AppError::new(
        ErrorKind::Unknown,
        "The pull request was opened, but GitEasy could not read it back. Refresh to see it.",
    ))
}

/// One pull request by number.
pub fn get(repo: &Path, number: u64) -> AppResult<PullRequest> {
    let number_arg = number.to_string();

    let raw = gh(
        Some(repo),
        &["pr", "view", &number_arg, "--json", FIELDS],
    )?;

    let value = super::parse_json(&raw)?;
    let me = super::auth::account().map(|a| a.login);

    Ok(build(&value, me.as_deref(), &[]))
}

/// Merge a pull request.
pub fn merge(repo: &Path, number: u64, strategy: &str) -> AppResult<()> {
    let number_arg = number.to_string();

    let flag = match strategy {
        "squash" => "--squash",
        "rebase" => "--rebase",
        "merge" | "" => "--merge",
        _ => return Err(AppError::invalid("Choose how to merge: merge, squash or rebase.")),
    };

    let out = gh_raw(Some(repo), &["pr", "merge", &number_arg, flag])?;

    if !out.ok() {
        let lower = out.stderr.to_lowercase();

        if lower.contains("not mergeable") || lower.contains("conflict") {
            return Err(AppError::new(
                ErrorKind::Conflict,
                "GitHub cannot merge this yet — it conflicts with the target branch. Pull the target branch into it first.",
            )
            .with_detail(&out.stderr));
        }

        if lower.contains("required status") || lower.contains("checks") {
            return Err(AppError::new(
                ErrorKind::Rejected,
                "GitHub is still waiting on required checks for this pull request.",
            )
            .with_detail(&out.stderr));
        }

        if lower.contains("review") {
            return Err(AppError::new(
                ErrorKind::Rejected,
                "This pull request still needs an approving review before it can be merged.",
            )
            .with_detail(&out.stderr));
        }

        return Err(
            AppError::new(ErrorKind::Rejected, "Could not merge that pull request.")
                .with_detail(&out.stderr),
        );
    }

    Ok(())
}

/// Close a pull request without merging it.
pub fn close(repo: &Path, number: u64) -> AppResult<()> {
    let number_arg = number.to_string();
    gh(Some(repo), &["pr", "close", &number_arg])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn json(text: &str) -> serde_json::Value {
        serde_json::from_str(text).unwrap()
    }

    #[test]
    fn no_checks_is_none() {
        assert_eq!(rollup_state(&json(r#"{"statusCheckRollup":[]}"#)), "none");
        assert_eq!(rollup_state(&json(r#"{}"#)), "none");
    }

    #[test]
    fn any_failure_is_failing() {
        let value = json(r#"{"statusCheckRollup":[{"conclusion":"SUCCESS"},{"conclusion":"FAILURE"}]}"#);
        assert_eq!(rollup_state(&value), "failing");
    }

    #[test]
    fn in_progress_is_running() {
        let value = json(r#"{"statusCheckRollup":[{"status":"IN_PROGRESS"}]}"#);
        assert_eq!(rollup_state(&value), "running");
    }

    #[test]
    fn all_success_is_passing() {
        let value = json(r#"{"statusCheckRollup":[{"status":"COMPLETED","conclusion":"SUCCESS"}]}"#);
        assert_eq!(rollup_state(&value), "passing");
    }

    #[test]
    fn draft_state_wins_over_open() {
        let value = json(r#"{"number":1,"state":"OPEN","isDraft":true,"author":{"login":"a"}}"#);
        let pr = build(&value, Some("a"), &[]);
        assert_eq!(pr.state, "draft");
        assert!(pr.is_mine);
    }

    #[test]
    fn merged_state_survives_draft_flag() {
        let value = json(r#"{"number":2,"state":"MERGED","isDraft":false,"author":{"login":"b"}}"#);
        let pr = build(&value, Some("a"), &[]);
        assert_eq!(pr.state, "merged");
        assert!(!pr.is_mine);
    }
}
