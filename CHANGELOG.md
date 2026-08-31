# Changelog

All notable changes to GitEasy are recorded here. Versions follow
[semantic versioning](https://semver.org).

---

## 1.0.1 — 2026-09-01

A responsiveness release. Nothing about how GitEasy works changed; what changed
is that the window no longer stops answering while it works.

### Fixed

**The window no longer greys out during Git or GitHub operations.**

Every one of GitEasy's 95 backend commands ran on the same thread that draws the
window. Git is a real program and GitHub is a real network round trip, so while
either was running the interface could not repaint — Windows would grey the title
bar and offer to close the app. All 95 commands now run on a background thread
pool, so the window keeps drawing and keeps accepting clicks no matter what is
happening underneath.

**Opening a repository shows the connection dialog immediately.**

GitEasy used to read the full repository state, the pending-commit list and the
AI suggestion *before* it drew the "Git is connected" dialog. On a large
repository, or the first time a repository was opened, that was a visible stall
with nothing on screen. The dialog now appears the moment a folder is chosen, and
each piece of state fills in behind it as it arrives.

**Syncing with GitHub no longer blocks the rest of the app.**

The GitHub screens — account, remote, ahead/behind counts — were fetched as one
all-or-nothing batch, so the slowest request held up every other screen and a
single failure emptied all of them. Each request is now independent: screens fill
in as their answers arrive, and one failing request no longer blanks the others.

**Settings → "Location on this computer" opens the right folder.**

GitEasy resolves repository paths to their canonical form, which on Windows means
the `\\?\C:\…` extended-length prefix. File Explorer cannot parse that prefix and
silently fell back to Documents. The path is still validated canonically; the
plain path is now what gets handed to the file manager.

**Choosing a custom accent colour stays inside the window.**

Settings → Theme → *choose your own colour* opened the operating system's colour
dialog in a separate window. It is now an inline picker in the settings page
itself, with explicit **Save** and **Cancel** buttons — Cancel restores the colour
you had before you started.

### Notes

No settings, repositories or preferences change format in this release. Installing
1.0.1 over 1.0.0 keeps everything as it was.

---

## 1.0.0 — 2026-08-27

First public release.

- Open, clone, initialise and switch between repositories
- Live changes with per-file and per-hunk diffs, staging, unstaging and discard
- Commit, amend, revert and reset, with optional AI-written commit messages
- Branches: create, switch, rename, delete, merge, rebase and compare
- Remotes: push, pull, fetch, add, change and remove, with ahead/behind counts
- History with a commit graph, file history, blame and commit comparison
- Conflict resolution: ours/theirs/base, manual editing, continue or abort
- GitHub sign-in through the official browser flow via the GitHub CLI — GitEasy
  never sees or stores your password or token
- Native filesystem watching, so the Changes screen updates without polling
- Installers for Windows, macOS (Intel and Apple silicon) and Linux
