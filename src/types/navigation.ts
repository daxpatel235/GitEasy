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

/**
 * Views worth reopening on a restored session.
 *
 * Settings is left out on purpose: nobody was *working* in Settings, so landing
 * there on launch would feel like the app had lost its place rather than kept
 * it. Everything else is somewhere you can genuinely be mid-task.
 */
export const NAVIGABLE_VIEWS: View[] = [
  "home",
  "changes",
  "history",
  "branches",
  "shelf",
  "sync",
  "pull-requests",
  "issues",
  "checks",
  "releases",
  "learn",
];

/** Sections within the Settings view, shown as a sub-nav beside the heading. */
export type SettingsSection =
  | "repository"
  | "remotes"
  | "git"
  | "account"
  | "theme"
  | "shortcuts"
  | "about";
