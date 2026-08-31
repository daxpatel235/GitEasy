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
///
/// Either way the result carries `alternatives`, so "Suggest another" always
/// has somewhere to go. When the model answers, the local candidates are kept
/// behind its suggestion rather than thrown away.
pub fn suggest_commit_message(
    files: &[ChangedFile],
    diff: &str,
    use_ai: bool,
) -> CommitSuggestion {
    if files.is_empty() {
        return empty_suggestion();
    }

    let local = local_commit_message_with_diff(files, diff);

    if use_ai && available() {
        if let Ok(mut suggestion) = remote_commit_message(files, diff) {
            // The local candidates stay available underneath, minus anything
            // that repeats what the model just said.
            suggestion.alternatives = merge_alternatives(
                &suggestion.message,
                suggestion.alternatives,
                std::iter::once(local.message).chain(local.alternatives),
            );
            return suggestion;
        }
        // A failed call is not an error the user needs to see — the local
        // suggestion is a perfectly good answer.
    }

    local
}

fn empty_suggestion() -> CommitSuggestion {
    CommitSuggestion {
        message: String::new(),
        explanation: String::new(),
        alternatives: Vec::new(),
    }
}

/// A deterministic, offline commit message built from the changes themselves.
pub fn local_commit_message(files: &[ChangedFile]) -> CommitSuggestion {
    local_commit_message_with_diff(files, "")
}

/// The offline generator.
///
/// It produces several genuinely different messages rather than one, because
/// the honest answer to "what is this commit?" is usually a choice between
/// framings — what changed, where it changed, or why. The list is ordered
/// best-first and de-duplicated, and every entry is a message someone could
/// reasonably commit as-is.
pub fn local_commit_message_with_diff(files: &[ChangedFile], diff: &str) -> CommitSuggestion {
    if files.is_empty() {
        return empty_suggestion();
    }

    let facts = Facts::read(files, diff);
    let mut candidates: Vec<String> = Vec::new();

    // 1. The primary reading: inferred type, scope, and an action verb chosen
    //    from what actually happened to the files.
    let kind = facts.kind();
    let scope = facts.scope();
    let subject = facts.subject();

    push_unique(
        &mut candidates,
        conventional(kind, scope.as_deref(), &format!("{} {}", facts.verb(), subject)),
    );

    // 2. The same change described by its area rather than its files. Only
    //    worth offering when there is an area to name.
    if let Some(area) = facts.area() {
        push_unique(
            &mut candidates,
            conventional(kind, scope.as_deref(), &format!("{} {area}", facts.verb())),
        );
    }

    // 3. A scope-free phrasing, for repositories that do not use scopes.
    if scope.is_some() {
        push_unique(
            &mut candidates,
            conventional(kind, None, &format!("{} {subject}", facts.verb())),
        );
    }

    // 4. The runner-up type. A change is often defensibly two things at once —
    //    a fix that is also a refactor — and guessing wrong is the single most
    //    common reason the first suggestion is not the one you want.
    if let Some(second) = facts.second_kind() {
        push_unique(
            &mut candidates,
            conventional(second, scope.as_deref(), &format!("{} {subject}", verb_for(second))),
        );
    }

    // 5. A plain, unprefixed sentence. Plenty of projects do not use
    //    Conventional Commits at all.
    push_unique(&mut candidates, sentence_case(&format!("{} {subject}", facts.verb())));

    // 6. A shape-of-the-change message, as a last resort that is still true.
    push_unique(&mut candidates, conventional(kind, None, &facts.shape()));

    let message = candidates.first().cloned().unwrap_or_else(|| "chore: update project files".into());
    let alternatives = candidates.into_iter().skip(1).take(5).collect();

    CommitSuggestion {
        message,
        explanation: facts.explanation(),
        alternatives,
    }
}

/// Assemble `type(scope): summary`, keeping the subject line within 72
/// characters — the limit the commit box counts against.
fn conventional(kind: &str, scope: Option<&str>, summary: &str) -> String {
    let head = match scope {
        Some(scope) => format!("{kind}({scope})"),
        None => kind.to_string(),
    };

    // "fix: fix parse" stutters. When the verb repeats the type, reword rather
    // than just dropping it, so the summary still reads as a sentence.
    let reworded;
    let summary = match summary.strip_prefix(&format!("{kind} ")) {
        Some(rest) => {
            reworded = match kind {
                "fix" => format!("correct {rest}"),
                "docs" => format!("write up {rest}"),
                "test" => format!("add tests for {rest}"),
                _ => rest.to_string(),
            };
            reworded.as_str()
        }
        None => summary,
    };

    let line = format!("{head}: {summary}");
    if line.len() <= 72 {
        return line;
    }

    // Trim the summary rather than the type, and cut on a word boundary so the
    // result still reads as a sentence.
    let room = 72usize.saturating_sub(head.len() + 2);
    format!("{head}: {}", truncate_words(summary, room))
}

fn truncate_words(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_string();
    }

    // Step back to a character boundary first: a path can hold multi-byte
    // characters, and slicing through one panics.
    let mut end = limit.min(text.len());
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }

    let cut = text[..end].rfind(' ').unwrap_or(end);
    text[..cut].trim_end().to_string()
}

fn sentence_case(text: &str) -> String {
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// Add `candidate` unless it is empty or already present (case-insensitively).
fn push_unique(into: &mut Vec<String>, candidate: String) {
    let candidate = candidate.trim().to_string();
    if candidate.is_empty() {
        return;
    }
    if into.iter().any(|existing| existing.eq_ignore_ascii_case(&candidate)) {
        return;
    }
    into.push(candidate);
}

/// Append `extra` to `existing`, dropping anything that repeats `primary` or a
/// message already in the list.
fn merge_alternatives(
    primary: &str,
    existing: Vec<String>,
    extra: impl IntoIterator<Item = String>,
) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    push_unique(&mut out, primary.to_string());

    for candidate in existing.into_iter().chain(extra) {
        push_unique(&mut out, candidate);
    }

    // `primary` was only in the list to de-duplicate against.
    out.into_iter().skip(1).take(5).collect()
}

/* -------------------------------------------------------------------------- */
/* Reading the changes                                                         */
/* -------------------------------------------------------------------------- */

/// What can be told about a change without a model: the counts, the paths, and
/// a few reliable signals from the diff text.
struct Facts<'a> {
    files: &'a [ChangedFile],
    added: usize,
    modified: usize,
    deleted: usize,
    renamed: usize,
    /// Files ordered by how much of them changed.
    ranked: Vec<&'a ChangedFile>,
    /// Set when the diff text points at a repair rather than a new capability.
    looks_like_fix: bool,
    /// Set when added and removed lines roughly balance, which is what moving
    /// code around looks like from the outside.
    looks_like_move: bool,
}

impl<'a> Facts<'a> {
    fn read(files: &'a [ChangedFile], diff: &str) -> Self {
        let added = files
            .iter()
            .filter(|f| f.status == "added" || f.status == "untracked")
            .count();
        let deleted = files.iter().filter(|f| f.status == "deleted").count();
        let renamed = files.iter().filter(|f| f.original_path.is_some()).count();
        let modified = files.len().saturating_sub(added + deleted);

        let mut ranked: Vec<&ChangedFile> = files.iter().collect();
        // Biggest first; ties broken by path so the output never depends on the
        // order Git happened to list the files in.
        ranked.sort_by(|a, b| {
            (b.additions + b.deletions)
                .cmp(&(a.additions + a.deletions))
                .then_with(|| a.path.cmp(&b.path))
        });

        let insertions: u32 = files.iter().map(|f| f.additions).sum();
        let removals: u32 = files.iter().map(|f| f.deletions).sum();

        // Only the added lines are examined, and only for a handful of words.
        // This is a cheap read of the text the user just wrote — nothing about
        // it leaves the machine.
        let looks_like_fix = diff
            .lines()
            .filter(|l| l.starts_with('+') && !l.starts_with("+++"))
            .any(|l| {
                let lower = l.to_ascii_lowercase();
                ["fix", "bug", "broken", "regression", "workaround", "hotfix", "revert"]
                    .iter()
                    .any(|needle| lower.contains(needle))
            });

        let churn = insertions + removals;
        let looks_like_move = churn > 20
            && insertions > 0
            && removals > 0
            && (insertions.abs_diff(removals) * 5) < churn;

        Self {
            files,
            added,
            modified,
            deleted,
            renamed,
            ranked,
            looks_like_fix,
            looks_like_move,
        }
    }

    /// Every path, lowercased, for the "do all files look like X" questions.
    fn all(&self, test: impl Fn(&str) -> bool) -> bool {
        self.files.iter().all(|f| test(&f.path.to_ascii_lowercase()))
    }

    fn any(&self, test: impl Fn(&str) -> bool) -> bool {
        self.files.iter().any(|f| test(&f.path.to_ascii_lowercase()))
    }

    /// The best guess at a Conventional Commits type.
    ///
    /// Ordered most-specific first: a change that is entirely documentation is
    /// `docs` even if it also adds files, because that is the more useful label.
    fn kind(&self) -> &'static str {
        if self.all(is_doc) {
            "docs"
        } else if self.all(is_test) {
            "test"
        } else if self.all(is_config) {
            "chore"
        } else if self.all(is_style_asset) {
            "style"
        } else if self.looks_like_fix {
            "fix"
        } else if self.renamed == self.files.len() && self.renamed > 0 {
            "refactor"
        } else if self.added == self.files.len() {
            "feat"
        } else if self.deleted > 0 && self.added == 0 && self.modified == 0 {
            "chore"
        } else if self.looks_like_move {
            "refactor"
        } else if self.added > 0 {
            "feat"
        } else {
            // Edits to existing files with no other signal. `chore` overclaims
            // less than `refactor`, which asserts the structure changed — and
            // `feat` is offered as the second reading anyway.
            "chore"
        }
    }

    /// A defensible second reading, so the list is not six phrasings of one
    /// guess. Returns `None` when there is no honest alternative.
    fn second_kind(&self) -> Option<&'static str> {
        let first = self.kind();

        let second = if first == "fix" {
            "refactor"
        } else if first == "feat" {
            if self.any(is_test) {
                "test"
            } else {
                "fix"
            }
        } else if first == "refactor" {
            if self.added > 0 {
                "feat"
            } else {
                "chore"
            }
        } else if first == "chore" {
            "refactor"
        } else if first == "docs" || first == "style" || first == "test" {
            "chore"
        } else {
            return None;
        };

        (second != first).then_some(second)
    }

    /// The verb that matches what happened, so the message is not always
    /// "update" — the word that makes every commit look identical in a log.
    fn verb(&self) -> &'static str {
        if self.renamed == self.files.len() && self.renamed > 0 {
            "rename"
        } else if self.deleted > 0 && self.added == 0 && self.modified == 0 {
            "remove"
        } else if self.added == self.files.len() {
            "add"
        } else if self.looks_like_fix {
            "fix"
        } else if self.looks_like_move {
            "reorganise"
        } else if self.added > 0 && self.modified > 0 {
            "extend"
        } else {
            "update"
        }
    }

    /// The directory the change sits in, when it sits in exactly one — the
    /// natural Conventional Commits scope.
    fn scope(&self) -> Option<String> {
        let mut dirs = self.files.iter().map(|f| {
            let path = f.path.trim_start_matches("./");
            match path.rsplit_once('/') {
                Some((dir, _)) => dir.to_string(),
                None => String::new(),
            }
        });

        let first = dirs.next()?;
        if first.is_empty() || !dirs.all(|d| d == first) {
            return None;
        }

        // The last meaningful segment reads better as a scope than the whole
        // path: `auth`, not `src/services/auth`.
        let leaf = first.rsplit('/').find(|s| !s.is_empty() && !is_noise_dir(s))?;
        (leaf.len() <= 20).then(|| leaf.to_ascii_lowercase())
    }

    /// What to call the thing that changed.
    fn subject(&self) -> String {
        let names: Vec<String> = self.ranked.iter().take(2).map(|f| stem(&f.path)).collect();

        match names.len() {
            0 => "project files".to_string(),
            1 if self.files.len() > 1 => {
                format!("{} and {}", names[0], others(self.files.len() - 1))
            }
            1 => names[0].clone(),
            _ if self.files.len() > 2 => {
                format!("{} and {}", names.join(", "), others(self.files.len() - 2))
            }
            _ => names.join(" and "),
        }
    }

    /// A shared directory to name instead of the files, when there is one and
    /// it is not the same word the scope already used.
    fn area(&self) -> Option<String> {
        let scope = self.scope()?;
        (self.files.len() > 1).then(|| format!("the {scope} area"))
    }

    /// A description built only from the counts. Always true, never specific.
    fn shape(&self) -> String {
        let n = self.files.len();
        format!("update {n} {}", if n == 1 { "file" } else { "files" })
    }

    /// The plain-English line under the message box.
    fn explanation(&self) -> String {
        let mut parts = Vec::new();
        if self.added > 0 {
            parts.push(format!("{} added", self.added));
        }
        if self.modified > 0 {
            parts.push(format!("{} changed", self.modified));
        }
        if self.deleted > 0 {
            parts.push(format!("{} deleted", self.deleted));
        }

        let counts = if parts.is_empty() {
            "Nothing changed".to_string()
        } else {
            let n = self.files.len();
            format!("{} {}: {}", n, if n == 1 { "file" } else { "files" }, parts.join(", "))
        };

        let insertions: u32 = self.files.iter().map(|f| f.additions).sum();
        let removals: u32 = self.files.iter().map(|f| f.deletions).sum();

        if insertions == 0 && removals == 0 {
            return format!("{counts}.");
        }

        format!("{counts} — {insertions} lines in, {removals} out.")
    }
}

/// "1 other" / "3 others" — the plural that a naive format string gets wrong.
fn others(n: usize) -> String {
    if n == 1 {
        "1 other".to_string()
    } else {
        format!("{n} others")
    }
}

fn verb_for(kind: &str) -> &'static str {
    match kind {
        "fix" => "fix",
        "feat" => "add",
        "docs" => "document",
        "test" => "cover",
        "chore" => "tidy",
        "style" => "restyle",
        _ => "rework",
    }
}

/// The file's name without its directory or extension.
fn stem(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(name);

    // `index.ts` and `mod.rs` say nothing; the directory above them does.
    if matches!(stem, "index" | "mod" | "main" | "lib" | "__init__") {
        if let Some((dir, _)) = path.rsplit_once('/') {
            if let Some(parent) = dir.rsplit('/').next() {
                if !parent.is_empty() {
                    return parent.to_string();
                }
            }
        }
    }

    if stem.is_empty() { name.to_string() } else { stem.to_string() }
}

fn is_doc(path: &str) -> bool {
    path.ends_with(".md")
        || path.ends_with(".txt")
        || path.ends_with(".rst")
        || path.ends_with(".adoc")
        || path.contains("docs/")
        || path.contains("licence")
        || path.contains("license")
}

fn is_test(path: &str) -> bool {
    path.contains("test")
        || path.contains("spec")
        || path.contains("__tests__")
        || path.contains("fixtures/")
}

fn is_config(path: &str) -> bool {
    const NAMES: [&str; 14] = [
        "package.json",
        "package-lock.json",
        "cargo.toml",
        "cargo.lock",
        "tsconfig.json",
        "vite.config",
        ".gitignore",
        ".editorconfig",
        "dockerfile",
        "makefile",
        ".env.example",
        "eslint",
        "prettier",
        ".github/",
    ];
    NAMES.iter().any(|name| path.contains(name))
        || path.ends_with(".yml")
        || path.ends_with(".yaml")
        || path.ends_with(".toml")
        || path.ends_with(".ini")
}

fn is_style_asset(path: &str) -> bool {
    path.ends_with(".css")
        || path.ends_with(".scss")
        || path.ends_with(".sass")
        || path.ends_with(".less")
}

/// Directory names that carry no meaning as a Conventional Commits scope.
fn is_noise_dir(name: &str) -> bool {
    matches!(name, "src" | "lib" | "app" | "source" | "packages" | "." | "..")
}

/// Ask the model for a commit message.
fn remote_commit_message(files: &[ChangedFile], diff: &str) -> AppResult<CommitSuggestion> {
    let names: Vec<&str> = files.iter().map(|f| f.path.as_str()).take(20).collect();

    let prompt = format!(
        "Write git commit messages for these changes.\n\n\
         Files: {}\n\n\
         Diff (may be truncated):\n{}\n\n\
         Reply with exactly five lines and nothing else:\n\
         Line 1: the best conventional-commit subject (type: summary), at most 72 characters.\n\
         Line 2: one plain-English sentence a beginner would understand, describing what changed.\n\
         Lines 3-5: three further subjects, each at most 72 characters. Make them genuinely \
         different from line 1 and from each other — a different commit type, a different scope, \
         or a different emphasis. Do not restate line 1 in other words.\n\
         Do not number the lines or add any other text.",
        names.join(", "),
        trim_diff(diff)
    );

    let reply = ask(&prompt, 400)?;
    let mut lines = reply
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(strip_list_marker);

    let message = lines.next().unwrap_or_default();
    let explanation = lines.next().unwrap_or_default();

    if message.is_empty() {
        return Err(AppError::new(ErrorKind::Unknown, "No suggestion came back."));
    }

    let mut alternatives = Vec::new();
    for line in lines.take(3) {
        push_unique(&mut alternatives, line);
    }

    Ok(CommitSuggestion {
        message,
        explanation,
        alternatives,
    })
}

/// Drop a leading "1.", "-" or "*" if the model numbered its list anyway.
fn strip_list_marker(line: &str) -> String {
    let trimmed = line.trim_start_matches(['-', '*', '•']).trim_start();
    let without_number = trimmed
        .split_once(". ")
        .filter(|(head, _)| !head.is_empty() && head.chars().all(|c| c.is_ascii_digit()))
        .map(|(_, rest)| rest)
        .unwrap_or(trimmed);
    without_number.trim().to_string()
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
        assert!(suggestion.alternatives.is_empty());
    }

    #[test]
    fn all_new_files_are_a_feature() {
        let files = vec![file("src/auth.js", "added", 30)];
        let suggestion = local_commit_message(&files);
        assert!(suggestion.message.starts_with("feat"));
        assert!(suggestion.message.contains("auth"));
    }

    #[test]
    fn markdown_only_changes_are_docs() {
        let files = vec![file("README.md", "modified", 3)];
        let suggestion = local_commit_message(&files);
        assert!(suggestion.message.starts_with("docs"));
    }

    #[test]
    fn names_the_biggest_change_first() {
        let files = vec![file("small.js", "modified", 1), file("big.js", "modified", 90)];
        let suggestion = local_commit_message(&files);
        assert!(suggestion.message.contains("big"));
    }

    /* -- alternatives ---------------------------------------------------- */

    #[test]
    fn offers_several_distinct_alternatives() {
        let files = vec![
            file("src/services/auth.ts", "modified", 40),
            file("src/services/session.ts", "modified", 12),
        ];
        let suggestion = local_commit_message(&files);

        assert!(
            suggestion.alternatives.len() >= 2,
            "expected alternatives, got {:?}",
            suggestion.alternatives
        );

        // Every entry must be different from the headline and from each other,
        // which is the entire reason this list exists.
        let mut seen = vec![suggestion.message.to_ascii_lowercase()];
        for alt in &suggestion.alternatives {
            let lower = alt.to_ascii_lowercase();
            assert!(!seen.contains(&lower), "repeated suggestion: {alt}");
            assert!(!alt.trim().is_empty());
            seen.push(lower);
        }
    }

    #[test]
    fn every_suggestion_fits_the_subject_limit() {
        let files = vec![
            file("src/components/very/deeply/nested/ComponentName.tsx", "modified", 80),
            file("src/components/very/deeply/nested/AnotherComponent.tsx", "modified", 60),
            file("src/components/very/deeply/nested/ThirdComponent.tsx", "added", 10),
        ];
        let suggestion = local_commit_message(&files);

        assert!(suggestion.message.len() <= 72, "{}", suggestion.message);
        for alt in &suggestion.alternatives {
            assert!(alt.len() <= 72, "too long: {alt}");
        }
    }

    #[test]
    fn a_shared_directory_becomes_the_scope() {
        let files = vec![
            file("src/services/auth.ts", "modified", 10),
            file("src/services/token.ts", "modified", 8),
        ];
        let suggestion = local_commit_message(&files);
        assert!(
            suggestion.message.contains("(services)"),
            "expected a scope, got {}",
            suggestion.message
        );
    }

    #[test]
    fn files_in_different_directories_get_no_scope() {
        let files = vec![
            file("src/auth.ts", "modified", 10),
            file("docs/guide.md", "modified", 8),
        ];
        let suggestion = local_commit_message(&files);
        assert!(!suggestion.message.contains('('), "{}", suggestion.message);
    }

    #[test]
    fn fix_wording_in_the_diff_is_read_as_a_fix() {
        let files = vec![file("src/parse.ts", "modified", 4)];
        let diff = "@@\n-  return x\n+  // fix the off-by-one that broke paging\n+  return x + 1\n";
        let suggestion = local_commit_message_with_diff(&files, diff);
        assert!(suggestion.message.starts_with("fix"), "{}", suggestion.message);
    }

    #[test]
    fn an_ordinary_diff_is_not_read_as_a_fix() {
        let files = vec![file("src/parse.ts", "modified", 4)];
        let diff = "@@\n+  return x + 1\n";
        let suggestion = local_commit_message_with_diff(&files, diff);
        assert!(!suggestion.message.starts_with("fix"), "{}", suggestion.message);
    }

    #[test]
    fn deleting_everything_says_remove() {
        let files = vec![file("src/old.ts", "deleted", 0)];
        let suggestion = local_commit_message(&files);
        assert!(
            suggestion.message.contains("remove"),
            "expected a removal verb, got {}",
            suggestion.message
        );
    }

    #[test]
    fn index_files_are_named_after_their_directory() {
        assert_eq!(stem("src/services/auth/index.ts"), "auth");
        assert_eq!(stem("src/git/mod.rs"), "git");
        assert_eq!(stem("src/components/Button.tsx"), "Button");
    }

    #[test]
    fn the_verb_is_not_always_update() {
        let added = vec![file("src/new.ts", "added", 20)];
        let removed = vec![file("src/gone.ts", "deleted", 0)];

        let a = local_commit_message(&added).message;
        let b = local_commit_message(&removed).message;
        assert_ne!(a, b);
    }

    #[test]
    fn the_type_is_never_repeated_by_the_verb() {
        // "fix: fix parse" reads badly; the summary should be reworded.
        let line = conventional("fix", None, "fix parse");
        assert_eq!(line, "fix: correct parse");
        assert_eq!(conventional("docs", None, "docs guide"), "docs: write up guide");
    }

    #[test]
    fn one_other_file_is_singular() {
        assert_eq!(others(1), "1 other");
        assert_eq!(others(3), "3 others");
    }

    #[test]
    fn plain_edits_do_not_claim_to_be_a_refactor() {
        // Nothing added, nothing deleted, no fix wording, no big move: there is
        // no evidence of restructuring, so `refactor` would be overclaiming.
        let files = vec![file("src/thing.ts", "modified", 4)];
        let suggestion = local_commit_message(&files);
        assert!(
            !suggestion.message.starts_with("refactor"),
            "{}",
            suggestion.message
        );
    }

    #[test]
    fn a_long_summary_never_splits_a_character() {
        // A path of multi-byte characters, long enough to force truncation.
        let files = vec![file(&"é".repeat(80), "modified", 4)];
        let suggestion = local_commit_message(&files);
        assert!(suggestion.message.len() <= 72);
    }

    #[test]
    fn conventional_trims_a_long_summary_on_a_word_boundary() {
        let line = conventional("feat", Some("scope"), &"word ".repeat(40));
        assert!(line.len() <= 72);
        assert!(line.starts_with("feat(scope): "));
        assert!(!line.ends_with(' '));
    }

    #[test]
    fn merge_alternatives_drops_repeats() {
        let merged = merge_alternatives(
            "feat: add auth",
            vec!["fix: repair auth".into()],
            vec!["FEAT: ADD AUTH".into(), "fix: repair auth".into(), "docs: note it".into()],
        );
        assert_eq!(merged, vec!["fix: repair auth", "docs: note it"]);
    }

    #[test]
    fn strips_list_markers_from_a_model_reply() {
        assert_eq!(strip_list_marker("1. feat: add auth"), "feat: add auth");
        assert_eq!(strip_list_marker("- fix: repair it"), "fix: repair it");
        assert_eq!(strip_list_marker("feat: untouched"), "feat: untouched");
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
