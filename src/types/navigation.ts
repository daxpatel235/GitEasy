/** Top-level views reachable from the sidebar. */
export type View =
  | "home"
  | "changes"
  | "history"
  | "branches"
  | "shelf"
  | "sync"
  | "pull-requests"
  | "issues"
  | "checks"
  | "releases"
  | "learn"
  | "settings";

/** Sections within the Settings view, shown as a sub-nav beside the heading. */
export type SettingsSection =
  | "repository"
  | "remotes"
  | "git"
  | "account"
  | "theme"
  | "shortcuts"
  | "about";
