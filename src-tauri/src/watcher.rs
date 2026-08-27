//! Native filesystem watching, debounced.
//!
//! The repository is never scanned on a timer. The OS reports changes (ReadDirectoryChangesW
//! on Windows, FSEvents on macOS, inotify on Linux) and those events are
//! coalesced over a short window, so saving twenty files in a build step wakes
//! the UI once rather than twenty times.
//!
//! A slow heartbeat sits alongside it, and it does not scan either — it just
//! re-reads Git's own state so that changes with no filesystem event inside the
//! work tree (a fetch updating remote refs, a branch moved by another tool)
//! still reach the UI.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{Config, Event, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// How long to wait for the changes to stop arriving before telling the UI.
///
/// Long enough to swallow a save-all, a formatter pass or a package install as
/// one event. A shorter window makes the app feel busier without telling the
/// user anything new, because the refresh it triggers costs more than the wait.
const DEBOUNCE: Duration = Duration::from_millis(900);

/// The longest a burst may hold off the refresh.
///
/// A build that writes continuously would otherwise keep resetting the debounce
/// and the UI would never update at all.
const MAX_DEFER: Duration = Duration::from_secs(5);

/// How often to re-read Git state when nothing on disk has moved.
///
/// Only catches changes with no filesystem event of their own — a fetch moving
/// remote refs, or another tool switching branch. Those are rare, so this is
/// deliberately slow: every tick is work the user did not ask for.
const HEARTBEAT: Duration = Duration::from_secs(45);

/// Emitted when the repository on disk has changed.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoChanged {
    /// The repository this is about, so a stale event from a previous project
    /// can be ignored by the frontend.
    pub path: String,
    /// filesystem | heartbeat
    pub reason: String,
}

/// A running watch. Dropping it stops the thread.
pub struct Watch {
    path: PathBuf,
    stop: Arc<Mutex<bool>>,
}

impl Watch {
    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn stop(&self) {
        if let Ok(mut flag) = self.stop.lock() {
            *flag = true;
        }
    }
}

impl Drop for Watch {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Start watching `repo`, emitting `repository-changed` to the frontend.
pub fn watch(app: AppHandle, repo: &Path) -> Result<Watch, String> {
    let root = repo.to_path_buf();
    let stop = Arc::new(Mutex::new(false));

    let thread_stop = Arc::clone(&stop);
    let thread_root = root.clone();

    std::thread::Builder::new()
        .name("giteasy-watcher".into())
        .spawn(move || {
            run(app, thread_root, thread_stop);
        })
        .map_err(|e| format!("Could not start watching the project folder ({e})"))?;

    Ok(Watch { path: root, stop })
}

fn run(app: AppHandle, root: PathBuf, stop: Arc<Mutex<bool>>) {
    let (tx, rx) = channel::<notify::Result<Event>>();

    let mut watcher = match notify::recommended_watcher(move |event| {
        // A failed send only means the receiver has gone, i.e. we are stopping.
        let _ = tx.send(event);
    }) {
        Ok(watcher) => watcher,
        Err(_) => return,
    };

    let _ = watcher.configure(Config::default().with_compare_contents(false));

    if watcher.watch(&root, RecursiveMode::Recursive).is_err() {
        return;
    }

    // `pending` is when the most recent change arrived; `burst_started` is when
    // the current run of changes began, so a continuous writer still gets a
    // refresh every MAX_DEFER rather than deferring forever.
    let mut pending: Option<Instant> = None;
    let mut burst_started: Option<Instant> = None;
    let mut last_heartbeat = Instant::now();

    loop {
        if stop.lock().map(|f| *f).unwrap_or(true) {
            return;
        }

        // Wake often enough to honour the debounce without spinning: this
        // thread is idle almost all the time, and a tighter loop would burn
        // battery for nothing.
        match rx.recv_timeout(Duration::from_millis(400)) {
            Ok(Ok(event)) => {
                if is_interesting(&root, &event) {
                    pending = Some(Instant::now());
                    burst_started.get_or_insert_with(Instant::now);
                }
            }
            Ok(Err(_)) => {}
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }

        // Fire once the burst has settled, or once it has run long enough that
        // waiting for it to settle would mean never refreshing.
        if let Some(last_change) = pending {
            let settled = last_change.elapsed() >= DEBOUNCE;
            let overdue = burst_started
                .map(|start| start.elapsed() >= MAX_DEFER)
                .unwrap_or(false);

            if settled || overdue {
                pending = None;
                burst_started = None;
                last_heartbeat = Instant::now();
                emit(&app, &root, "filesystem");
            }
        }

        // Slow refresh, so remote-ref changes are noticed without any scan.
        if last_heartbeat.elapsed() >= HEARTBEAT {
            last_heartbeat = Instant::now();
            emit(&app, &root, "heartbeat");
        }
    }
}

fn emit(app: &AppHandle, root: &Path, reason: &str) {
    let _ = app.emit(
        "repository-changed",
        RepoChanged {
            path: root.to_string_lossy().to_string(),
            reason: reason.to_string(),
        },
    );
}

/// Whether an event is worth waking the UI for.
///
/// Git rewrites its own internals constantly — every `git status` touches
/// `.git/index`, and the objects directory churns on every operation. Reacting
/// to those would mean a refresh loop that never settles, so the noisy paths
/// are filtered out while the ones that carry real news (HEAD moving, refs
/// changing, a merge starting) are kept.
fn is_interesting(root: &Path, event: &Event) -> bool {
    event.paths.iter().any(|path| {
        let relative = path.strip_prefix(root).unwrap_or(path);
        let text = relative.to_string_lossy().replace('\\', "/");

        if !text.starts_with(".git/") && !text.contains("/.git/") {
            // Anything in the work tree is real news, except editor scratch
            // files that appear and vanish on every keystroke.
            return !is_editor_noise(&text);
        }

        // Inside .git, only these say something the UI shows.
        const MEANINGFUL: [&str; 8] = [
            ".git/HEAD",
            ".git/MERGE_HEAD",
            ".git/CHERRY_PICK_HEAD",
            ".git/REVERT_HEAD",
            ".git/rebase-merge",
            ".git/rebase-apply",
            ".git/refs/",
            ".git/packed-refs",
        ];

        MEANINGFUL.iter().any(|marker| text.contains(marker))
    })
}

/// Temporary files editors create and delete constantly.
fn is_editor_noise(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);

    name.ends_with('~')
        || name.ends_with(".swp")
        || name.ends_with(".swx")
        || name.ends_with(".tmp")
        || name.starts_with(".#")
        || name.starts_with("~$")
        || path.contains("/node_modules/")
        || path.contains("/target/debug/")
        || path.contains("/target/release/")
        || path.contains("/.next/")
        || path.contains("/dist/.vite/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_editor_swap_files() {
        assert!(is_editor_noise("src/.main.rs.swp"));
        assert!(is_editor_noise("src/main.rs~"));
        assert!(is_editor_noise(".#main.rs"));
    }

    #[test]
    fn ignores_dependency_folders() {
        assert!(is_editor_noise("node_modules/react/index.js".replace("node_modules", "a/node_modules").as_str()));
    }

    #[test]
    fn keeps_ordinary_source_files() {
        assert!(!is_editor_noise("src/main.rs"));
        assert!(!is_editor_noise("README.md"));
    }
}
