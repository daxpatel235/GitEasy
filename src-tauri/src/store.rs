//! GitEasy's own data, in SQLite.
//!
//! Application data only: which repositories have been opened, the behaviour
//! toggles, window preferences. Git remains the source of truth for everything
//! about a repository's contents and history — nothing here caches commits,
//! branches or file state, because a cache that can disagree with `git status`
//! is worse than no cache.
//!
//! No credential ever reaches this file. Tokens live in the OS keychain, owned
//! by the GitHub CLI.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::models::RecentRepository;

/// The open database, guarded for use from any command thread.
pub struct Store {
    connection: Mutex<Connection>,
}

impl Store {
    /// Open (or create) the database inside the app's data directory.
    pub fn open(data_dir: &Path) -> AppResult<Self> {
        std::fs::create_dir_all(data_dir).map_err(|e| {
            AppError::new(ErrorKind::Unknown, "Could not create GitEasy's data folder.")
                .with_detail(e.to_string())
        })?;

        let path = data_dir.join("giteasy.db");
        let connection = Connection::open(&path).map_err(|e| {
            AppError::new(ErrorKind::Unknown, "Could not open GitEasy's database.")
                .with_detail(e.to_string())
        })?;

        let store = Self {
            connection: Mutex::new(connection),
        };
        store.migrate()?;
        Ok(store)
    }

    /// An in-memory database, for tests.
    #[cfg(test)]
    pub fn in_memory() -> AppResult<Self> {
        let connection = Connection::open_in_memory().map_err(|e| {
            AppError::new(ErrorKind::Unknown, "Could not open the test database")
                .with_detail(e.to_string())
        })?;
        let store = Self {
            connection: Mutex::new(connection),
        };
        store.migrate()?;
        Ok(store)
    }

    fn with<T>(&self, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> AppResult<T> {
        let guard = self
            .connection
            .lock()
            .map_err(|_| AppError::new(ErrorKind::Unknown, "GitEasy's database is busy."))?;

        f(&guard).map_err(|e| {
            AppError::new(ErrorKind::Unknown, "Could not read GitEasy's saved settings.")
                .with_detail(e.to_string())
        })
    }

    /// Create the schema. Safe to run on every start.
    fn migrate(&self) -> AppResult<()> {
        self.with(|conn| {
            conn.execute_batch(
                "
                PRAGMA journal_mode = WAL;
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS repositories (
                    path            TEXT PRIMARY KEY,
                    name            TEXT NOT NULL,
                    last_opened_at  INTEGER NOT NULL,
                    last_branch     TEXT
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key    TEXT PRIMARY KEY,
                    value  TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS repositories_recent
                    ON repositories (last_opened_at DESC);
                ",
            )
        })
    }

    /* --- Repositories --------------------------------------------------- */

    /// Record that a repository was opened, for the recent-projects list.
    pub fn remember_repository(&self, path: &str, name: &str, branch: &str) -> AppResult<()> {
        let now = now_millis();

        self.with(|conn| {
            conn.execute(
                "INSERT INTO repositories (path, name, last_opened_at, last_branch)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(path) DO UPDATE SET
                     name = excluded.name,
                     last_opened_at = excluded.last_opened_at,
                     last_branch = excluded.last_branch",
                params![path, name, now, branch],
            )?;
            Ok(())
        })?;

        Ok(())
    }

    /// Recently opened repositories, newest first.
    ///
    /// Each row reports whether the folder is still there, so the UI can show a
    /// moved project as unavailable rather than failing when it is clicked.
    pub fn recent_repositories(&self, limit: u32) -> AppResult<Vec<RecentRepository>> {
        self.with(|conn| {
            let mut statement = conn.prepare(
                "SELECT path, name, last_opened_at
                 FROM repositories
                 ORDER BY last_opened_at DESC
                 LIMIT ?1",
            )?;

            let rows = statement.query_map(params![limit], |row| {
                let path: String = row.get(0)?;
                let exists = Path::new(&path).join(".git").exists();
                Ok(RecentRepository {
                    name: row.get(1)?,
                    last_opened_at: row.get(2)?,
                    path,
                    exists,
                })
            })?;

            rows.collect()
        })
    }

    /// Remove one repository from the recent list.
    pub fn forget_repository(&self, path: &str) -> AppResult<()> {
        self.with(|conn| {
            conn.execute("DELETE FROM repositories WHERE path = ?1", params![path])?;
            Ok(())
        })
    }

    /// The most recently opened repository, for reopening on launch.
    pub fn last_repository(&self) -> AppResult<Option<String>> {
        self.with(|conn| {
            conn.query_row(
                "SELECT path FROM repositories ORDER BY last_opened_at DESC LIMIT 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
        })
    }

    /* --- Settings -------------------------------------------------------- */

    /// Read a setting.
    pub fn get_setting(&self, key: &str) -> AppResult<Option<String>> {
        self.with(|conn| {
            conn.query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get::<_, String>(0),
            )
            .optional()
        })
    }

    /// Write a setting.
    pub fn set_setting(&self, key: &str, value: &str) -> AppResult<()> {
        self.with(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )?;
            Ok(())
        })
    }

    /// Every setting, as a map for the frontend to hydrate from in one call.
    pub fn all_settings(&self) -> AppResult<std::collections::HashMap<String, String>> {
        self.with(|conn| {
            let mut statement = conn.prepare("SELECT key, value FROM settings")?;
            let rows = statement.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;

            let mut map = std::collections::HashMap::new();
            for row in rows {
                let (key, value) = row?;
                map.insert(key, value);
            }
            Ok(map)
        })
    }
}

/// The app's data directory, resolved per platform.
pub fn data_dir() -> PathBuf {
    // Tauri's own path resolver needs an AppHandle; this keeps the store
    // constructible before the app is built, and matches where Tauri would put
    // it anyway.
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|h| h.join("Library").join("Application Support"))
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME")
                    .map(PathBuf::from)
                    .map(|h| h.join(".local").join("share"))
            })
    };

    base.unwrap_or_else(std::env::temp_dir).join("GitEasy")
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remembers_and_lists_repositories() {
        let store = Store::in_memory().unwrap();
        store.remember_repository("/a/b", "b", "main").unwrap();

        let recent = store.recent_repositories(10).unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].name, "b");
        // The folder does not exist, so the row reports it as unavailable.
        assert!(!recent[0].exists);
    }

    #[test]
    fn reopening_updates_rather_than_duplicates() {
        let store = Store::in_memory().unwrap();
        store.remember_repository("/a/b", "b", "main").unwrap();
        store.remember_repository("/a/b", "b", "feature").unwrap();

        assert_eq!(store.recent_repositories(10).unwrap().len(), 1);
    }

    #[test]
    fn forgets_a_repository() {
        let store = Store::in_memory().unwrap();
        store.remember_repository("/a/b", "b", "main").unwrap();
        store.forget_repository("/a/b").unwrap();
        assert!(store.recent_repositories(10).unwrap().is_empty());
    }

    #[test]
    fn round_trips_settings() {
        let store = Store::in_memory().unwrap();
        store.set_setting("warnOnMainBranch", "false").unwrap();
        assert_eq!(
            store.get_setting("warnOnMainBranch").unwrap(),
            Some("false".to_string())
        );

        store.set_setting("warnOnMainBranch", "true").unwrap();
        assert_eq!(
            store.get_setting("warnOnMainBranch").unwrap(),
            Some("true".to_string())
        );
    }

    #[test]
    fn missing_setting_is_none() {
        let store = Store::in_memory().unwrap();
        assert!(store.get_setting("nothing").unwrap().is_none());
    }

    #[test]
    fn last_repository_is_the_newest() {
        let store = Store::in_memory().unwrap();
        store.remember_repository("/a/one", "one", "main").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        store.remember_repository("/a/two", "two", "main").unwrap();

        assert_eq!(store.last_repository().unwrap(), Some("/a/two".to_string()));
    }
}
