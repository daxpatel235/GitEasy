//! GitEasy's Rust half.
//!
//! The frontend never runs a command of its own choosing. It calls the named,
//! typed commands registered below, each of which decides for itself which Git
//! operation the request means and builds the argument vector for it. There is
//! no shell anywhere in this crate.

mod ai;
mod commands;
mod error;
mod exec;
mod git;
mod github;
mod models;
mod store;
mod watcher;

use commands::AppState;
use store::Store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = Store::open(&store::data_dir()).unwrap_or_else(|e| {
        // A broken database must not stop the app: Git is the source of truth,
        // and everything except the recent-projects list works without it.
        eprintln!("GitEasy: could not open its database ({}). Preferences will not persist this session.", e.message);
        Store::open(&std::env::temp_dir().join("GitEasy"))
            .expect("could not open a fallback database")
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Updates are checked, downloaded and installed by the frontend, which
        // asks first. Nothing here reaches the network on its own.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::new(store))
        .invoke_handler(tauri::generate_handler![
            // Environment, identity, authentication
            commands::environment,
            commands::git_installed,
            commands::git_identity,
            commands::set_git_identity,
            commands::github_account,
            commands::github_sign_in,
            commands::github_sign_out,
            // Repository
            commands::open_repository,
            commands::is_repository,
            commands::init_repository,
            commands::clone_repository,
            commands::publish_repository,
            commands::recent_repositories,
            commands::forget_repository,
            commands::is_empty_repository,
            commands::stop_watching,
            // Changes
            commands::changed_files,
            commands::changed_files_with_diffs,
            commands::file_diff,
            commands::file_hunks,
            commands::stage_files,
            commands::unstage_files,
            commands::stage_hunk,
            commands::unstage_hunk,
            commands::discard_file,
            // Commits
            commands::commit,
            commands::amend_commit,
            commands::head_is_pushed,
            commands::pending_commits,
            commands::commit_files,
            commands::commit_detail,
            commands::revert_commit,
            commands::cherry_pick,
            commands::reset_to,
            commands::commit_warnings,
            // Branches
            commands::branches,
            commands::create_branch,
            commands::switch_branch,
            commands::rename_branch,
            commands::delete_branch,
            commands::unmerged_count,
            commands::merge_branch,
            commands::rebase_branch,
            commands::compare_refs,
            // History
            commands::history,
            commands::file_history,
            commands::blame,
            // Remotes and sync
            commands::remotes,
            commands::add_remote,
            commands::set_remote_url,
            commands::remove_remote,
            commands::sync_state,
            commands::fetch_remotes,
            commands::pull,
            commands::push_to_github,
            commands::push_tags,
            commands::sync_fork,
            // Shelf
            commands::stashes,
            commands::stash_push,
            commands::stash_pop,
            commands::stash_apply,
            commands::stash_drop,
            commands::stash_show,
            // Conflicts
            commands::conflicts,
            commands::repo_operation,
            commands::resolve_conflict,
            commands::conflict_file_contents,
            commands::resolve_conflict_manually,
            commands::mark_resolved,
            commands::continue_operation,
            commands::abort_operation,
            // Tags
            commands::tags,
            commands::create_tag,
            commands::delete_tag,
            // GitHub
            commands::pull_requests,
            commands::create_pull_request,
            commands::merge_pull_request,
            commands::close_pull_request,
            commands::issues,
            commands::create_issue,
            commands::close_issue,
            commands::workflow_runs,
            commands::rerun_workflow,
            commands::releases,
            commands::create_release,
            commands::my_repos,
            commands::create_github_repo,
            // AI
            commands::ai_available,
            commands::suggest_commit_message,
            commands::explain_changes,
            commands::explain_error,
            commands::explain_conflict,
            // Settings
            commands::get_settings,
            commands::set_setting,
            // Misc
            commands::open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GitEasy");
}
