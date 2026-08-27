//! Releases — the published half of the Releases screen.

use std::path::Path;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::exec::{gh, gh_raw};
use crate::models::Release;

/// Published releases, newest first.
pub fn list(repo: &Path, limit: u32) -> AppResult<Vec<Release>> {
    let limit = limit.to_string();

    let raw = gh(
        Some(repo),
        &[
            "release",
            "list",
            "--limit",
            &limit,
            "--json",
            "tagName,name,publishedAt,isLatest,isDraft,isPrerelease",
        ],
    )?;

    let value = super::parse_json(&raw)?;
    let items = value.as_array().cloned().unwrap_or_default();

    let mut releases = Vec::new();

    for item in items {
        let tag = super::text(&item, "tagName");
        if tag.is_empty() {
            continue;
        }

        // Notes and download counts are not in the list payload, so they come
        // from one `view` per release. The list is short enough for that to be
        // cheap, and the Releases screen shows the notes inline.
        let (notes, download_count, url) = detail(repo, &tag);

        releases.push(Release {
            name: {
                let name = super::text(&item, "name");
                if name.is_empty() { tag.clone() } else { name }
            },
            published_at: super::iso_to_millis(&super::text(&item, "publishedAt")),
            is_latest: item.get("isLatest").and_then(|v| v.as_bool()).unwrap_or(false),
            is_draft: item.get("isDraft").and_then(|v| v.as_bool()).unwrap_or(false),
            is_prerelease: item
                .get("isPrerelease")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            notes,
            url,
            download_count,
            tag,
        });
    }

    Ok(releases)
}

/// Notes, total downloads and URL for one release.
fn detail(repo: &Path, tag: &str) -> (String, u64, String) {
    let Ok(raw) = gh(
        Some(repo),
        &["release", "view", tag, "--json", "body,url,assets"],
    ) else {
        return (String::new(), 0, String::new());
    };

    let Ok(value) = super::parse_json(&raw) else {
        return (String::new(), 0, String::new());
    };

    let downloads = value
        .get("assets")
        .and_then(|v| v.as_array())
        .map(|assets| {
            assets
                .iter()
                .map(|a| super::number(a, "downloadCount"))
                .sum()
        })
        .unwrap_or(0);

    (
        super::text(&value, "body"),
        downloads,
        super::text(&value, "url"),
    )
}

/// Publish a release from an existing tag.
pub fn create(
    repo: &Path,
    tag: &str,
    title: &str,
    notes: &str,
    prerelease: bool,
    draft: bool,
) -> AppResult<Release> {
    let tag = tag.trim();

    if tag.is_empty() {
        return Err(AppError::invalid("Choose which version to publish."));
    }

    if tag.starts_with('-') {
        return Err(AppError::invalid("That is not a valid version name."));
    }

    let mut args: Vec<&str> = vec!["release", "create", tag];

    args.push("--title");
    args.push(if title.trim().is_empty() { tag } else { title.trim() });

    // Always pass notes so `gh` never opens an editor and blocks.
    args.push("--notes");
    args.push(notes);

    if prerelease {
        args.push("--prerelease");
    }
    if draft {
        args.push("--draft");
    }

    let out = gh_raw(Some(repo), &args)?;

    if !out.ok() {
        let lower = out.stderr.to_lowercase();

        if lower.contains("already exists") {
            return Err(AppError::invalid(format!(
                "A release for {tag} already exists on GitHub."
            )));
        }

        return Err(
            AppError::new(ErrorKind::Rejected, "Could not publish that release.")
                .with_detail(&out.stderr),
        );
    }

    list(repo, 30)?
        .into_iter()
        .find(|r| r.tag == tag)
        .ok_or_else(|| {
            AppError::new(
                ErrorKind::Unknown,
                "The release was published, but GitEasy could not read it back. Refresh to see it.",
            )
        })
}
