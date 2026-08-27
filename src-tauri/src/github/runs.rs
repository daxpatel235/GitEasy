//! GitHub Actions runs — the Checks screen.

use std::path::Path;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::exec::{gh, gh_raw};
use crate::models::WorkflowRun;

const FIELDS: &str =
    "databaseId,name,status,conclusion,headBranch,displayTitle,headSha,startedAt,updatedAt,url,event";

/// Recent workflow runs.
pub fn list(repo: &Path, limit: u32) -> AppResult<Vec<WorkflowRun>> {
    let limit = limit.to_string();

    let raw = gh(
        Some(repo),
        &["run", "list", "--limit", &limit, "--json", FIELDS],
    )?;

    let value = super::parse_json(&raw)?;
    let items = value.as_array().cloned().unwrap_or_default();

    Ok(items
        .iter()
        .map(|item| {
            let started_at = super::iso_to_millis(&super::text(item, "startedAt"));
            let updated_at = super::iso_to_millis(&super::text(item, "updatedAt"));
            let status = state_of(item);

            // A finished run's duration is the gap between its two timestamps;
            // one still going has no duration yet, which the UI renders as a
            // live "running" row rather than a wrong number.
            let duration_ms = if status == "running" || status == "queued" {
                None
            } else if updated_at > started_at && started_at > 0 {
                Some(updated_at - started_at)
            } else {
                None
            };

            let sha = super::text(item, "headSha");

            WorkflowRun {
                id: super::number(item, "databaseId").to_string(),
                name: super::text(item, "name"),
                status,
                branch: super::text(item, "headBranch"),
                commit_message: super::text(item, "displayTitle"),
                short_hash: sha.chars().take(7).collect(),
                actor: super::login(item, "actor"),
                started_at,
                duration_ms,
                url: super::text(item, "url"),
            }
        })
        .collect())
}

/// Map Actions' status/conclusion pair onto the UI's five states.
fn state_of(item: &serde_json::Value) -> String {
    let status = super::text(item, "status").to_lowercase();
    let conclusion = super::text(item, "conclusion").to_lowercase();

    match status.as_str() {
        "queued" | "waiting" | "requested" | "pending" => return "queued".into(),
        "in_progress" => return "running".into(),
        _ => {}
    }

    match conclusion.as_str() {
        "success" => "success".into(),
        "failure" | "timed_out" | "startup_failure" => "failure".into(),
        "cancelled" | "skipped" | "stale" | "neutral" | "action_required" => "cancelled".into(),
        // Completed with nothing recorded yet.
        _ => "running".into(),
    }
}

/// Start a run again.
pub fn rerun(repo: &Path, id: &str) -> AppResult<()> {
    // Run ids are numeric; refusing anything else keeps a crafted value from
    // reaching `gh` as a flag.
    if id.trim().is_empty() || !id.trim().chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::invalid("That is not a run GitEasy can start again."));
    }

    let out = gh_raw(Some(repo), &["run", "rerun", id.trim()])?;

    if !out.ok() {
        let lower = out.stderr.to_lowercase();

        if lower.contains("cannot be rerun") || lower.contains("still in progress") {
            return Err(AppError::invalid(
                "That run cannot be started again yet — it is still going.",
            ));
        }

        return Err(
            AppError::new(ErrorKind::Rejected, "Could not start that run again.")
                .with_detail(&out.stderr),
        );
    }

    Ok(())
}

/// The check state for one commit, so History can show a tick or a cross.
pub fn checks_for_commit(repo: &Path, sha: &str) -> String {
    if sha.trim().is_empty() {
        return "none".to_string();
    }

    let Ok(raw) = gh(
        Some(repo),
        &[
            "api",
            &format!("repos/{{owner}}/{{repo}}/commits/{sha}/check-runs"),
            "--jq",
            ".check_runs",
        ],
    ) else {
        return "none".to_string();
    };

    let Ok(value) = super::parse_json(&raw) else {
        return "none".to_string();
    };

    let Some(runs) = value.as_array() else {
        return "none".to_string();
    };

    if runs.is_empty() {
        return "none".to_string();
    }

    let mut running = false;
    let mut failing = false;

    for run in runs {
        let status = super::text(run, "status").to_lowercase();
        let conclusion = super::text(run, "conclusion").to_lowercase();

        if status != "completed" {
            running = true;
        }

        if conclusion == "failure" || conclusion == "timed_out" {
            failing = true;
        }
    }

    if failing {
        "failing".into()
    } else if running {
        "running".into()
    } else {
        "passing".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn json(text: &str) -> serde_json::Value {
        serde_json::from_str(text).unwrap()
    }

    #[test]
    fn queued_run() {
        assert_eq!(state_of(&json(r#"{"status":"queued"}"#)), "queued");
    }

    #[test]
    fn running_run() {
        assert_eq!(state_of(&json(r#"{"status":"in_progress"}"#)), "running");
    }

    #[test]
    fn successful_run() {
        assert_eq!(
            state_of(&json(r#"{"status":"completed","conclusion":"success"}"#)),
            "success"
        );
    }

    #[test]
    fn failed_run() {
        assert_eq!(
            state_of(&json(r#"{"status":"completed","conclusion":"failure"}"#)),
            "failure"
        );
    }

    #[test]
    fn cancelled_run() {
        assert_eq!(
            state_of(&json(r#"{"status":"completed","conclusion":"cancelled"}"#)),
            "cancelled"
        );
    }

    #[test]
    fn rerun_rejects_non_numeric_id() {
        let result = rerun(Path::new("."), "--help");
        assert!(result.is_err());
    }
}
