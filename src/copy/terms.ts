/**
 * The app's vocabulary.
 *
 * GitEasy uses the real Git words — Commit, Push, Pull, Branch — because they
 * are what every tutorial, colleague and error message the user will ever meet
 * also uses. Teaching someone "Save on this computer" leaves them stranded the
 * first time a teammate says "did you push?".
 *
 * What the app does instead is never leave a term unexplained: every one of
 * them carries a one-line plain meaning that the UI shows underneath the
 * button, and a longer explanation available on hover and in Learn.
 *
 * This file is the single source for all of it. Change a word here and it
 * changes everywhere — labels, tooltips, the glossary and onboarding.
 */

export interface Term {
  /** The real Git word. */
  label: string;
  /** One line, plain English. Shown next to the label wherever there is room. */
  plain: string;
  /** A paragraph for the tooltip and the glossary. */
  detail: string;
  /** What GitEasy runs for you. Shown so the user can learn it if they want. */
  command: string;
  /** Whether the action can be taken back afterwards. Drives the UI's tone. */
  reversible: boolean;
}

export type TermKey =
  | "commit"
  | "push"
  | "pull"
  | "fetch"
  | "branch"
  | "checkout"
  | "merge"
  | "rebase"
  | "stage"
  | "stash"
  | "clone"
  | "fork"
  | "remote"
  | "origin"
  | "upstream"
  | "syncFork"
  | "pullRequest"
  | "conflict"
  | "revert"
  | "amend"
  | "discard"
  | "tag"
  | "release"
  | "cherryPick"
  | "gitignore"
  | "head"
  | "diff"
  | "actions"
  | "init"
  | "readme";

export const TERMS: Record<TermKey, Term> = {
  commit: {
    label: "Commit",
    plain: "Save a snapshot on this computer",
    detail:
      "A commit records the current state of the files you ticked, together with a short note about why you changed them. It stays on this computer until you push. You can commit as often as you like — small, frequent commits are easier to read back and easier to undo.",
    command: "git add … && git commit -m \"…\"",
    reversible: true,
  },
  push: {
    label: "Push",
    plain: "Upload your commits to GitHub",
    detail:
      "Pushing sends the commits sitting on this computer up to GitHub, where anyone with access to the project can see them. This is the step that makes your work public, so GitEasy always shows you exactly what is about to go out.",
    command: "git push",
    reversible: false,
  },
  pull: {
    label: "Pull",
    plain: "Bring down other people's work",
    detail:
      "Pulling downloads commits other people have pushed and merges them into your branch. Do it before you start work and before you push, and you will almost never hit a conflict.",
    command: "git pull",
    reversible: true,
  },
  fetch: {
    label: "Fetch",
    plain: "Check for new work without applying it",
    detail:
      "Fetch asks GitHub what has changed and downloads it, but leaves your files exactly as they are. It is the safe way to find out whether you are behind before deciding what to do about it.",
    command: "git fetch --all",
    reversible: true,
  },
  branch: {
    label: "Branch",
    plain: "A separate line of work",
    detail:
      "A branch lets you work on something without touching everyone else's copy. You make commits on it, and when the work is ready you merge it back — or open a pull request so someone reviews it first. Most teams keep one main branch and make a new branch for every task.",
    command: "git branch <name>",
    reversible: true,
  },
  checkout: {
    label: "Switch",
    plain: "Move to another branch",
    detail:
      "Switching swaps the files in your project folder to the version on another branch. Anything you have not committed comes with you, so commit or shelve your work first if you want a clean move.",
    command: "git switch <name>",
    reversible: true,
  },
  merge: {
    label: "Merge",
    plain: "Combine another branch into this one",
    detail:
      "Merging takes the commits from another branch and adds them to the one you are on. If both branches changed the same lines, Git stops and asks you which version wins — that is a conflict, and GitEasy walks you through it.",
    command: "git merge <branch>",
    reversible: true,
  },
  rebase: {
    label: "Rebase",
    plain: "Replay your commits on top of the latest work",
    detail:
      "Rebasing rewrites your commits so they sit on top of the newest work instead of alongside it, which keeps history a straight line. It rewrites history, so never rebase a branch other people are already working from.",
    command: "git pull --rebase",
    reversible: false,
  },
  stage: {
    label: "Stage",
    plain: "Tick the files you want in the next commit",
    detail:
      "Git lets you commit some of your changes and leave the rest for later. Ticking a file stages it; the next commit contains exactly the ticked files and nothing else.",
    command: "git add <file>",
    reversible: true,
  },
  stash: {
    label: "Shelf",
    plain: "Put unfinished work aside for a moment",
    detail:
      "Shelving takes your uncommitted changes off your desk and stores them safely, leaving the project clean. Useful when you need to switch branches mid-task. Git calls this a stash. Nothing is lost — you restore it whenever you want.",
    command: "git stash push",
    reversible: true,
  },
  clone: {
    label: "Clone",
    plain: "Download a project from GitHub for the first time",
    detail:
      "Cloning copies an entire project — every file and its whole history — onto your computer and remembers where it came from, so pushing and pulling work straight away.",
    command: "git clone <url>",
    reversible: true,
  },
  fork: {
    label: "Fork",
    plain: "Your own copy of someone else's project",
    detail:
      "A fork is a personal copy of a project you do not have write access to. You push to your fork, then open a pull request asking the original project to take your changes. This is how nearly all open-source contribution works.",
    command: "gh repo fork",
    reversible: true,
  },
  remote: {
    label: "Remote",
    plain: "A copy of this project living on a server",
    detail:
      "A remote is a nickname for a URL that holds a copy of this project. Most repositories have one, called origin. Forks usually have a second one, called upstream, pointing at the original.",
    command: "git remote -v",
    reversible: true,
  },
  origin: {
    label: "Origin",
    plain: "Your copy on GitHub",
    detail:
      "Origin is the default name for the remote you cloned from and the one you push to. When GitEasy says your work is on GitHub, it means it reached origin.",
    command: "git remote get-url origin",
    reversible: true,
  },
  upstream: {
    label: "Upstream",
    plain: "The original project you forked",
    detail:
      "When you fork a project, upstream is the name given to the original. It keeps moving while you work, which is why forks need syncing.",
    command: "git remote add upstream <url>",
    reversible: true,
  },
  syncFork: {
    label: "Sync fork",
    plain: "Pull the original project's latest work into your copy",
    detail:
      "Your fork does not update itself. Syncing fetches the original project's newest commits and merges them into your branch, so your pull request is built on current code instead of a months-old snapshot.",
    command: "git fetch upstream && git merge upstream/main",
    reversible: true,
  },
  pullRequest: {
    label: "Pull request",
    plain: "Ask for your branch to be reviewed and merged",
    detail:
      "A pull request puts your branch side by side with the main one so people can read the changes, comment on specific lines and approve them. It is where code review happens, and on most teams it is the only route into the main branch.",
    command: "gh pr create",
    reversible: true,
  },
  conflict: {
    label: "Conflict",
    plain: "Two people changed the same lines",
    detail:
      "When your version and someone else's touch the same lines, Git will not guess which is right — it stops and hands the decision to you. Conflicts are normal and expected; you pick a side line by line, then commit the result.",
    command: "git status",
    reversible: true,
  },
  revert: {
    label: "Revert",
    plain: "Undo a commit with a new commit",
    detail:
      "Reverting creates a fresh commit that reverses an earlier one. Nothing is erased, so it is safe to do on work that has already been pushed — which is exactly why it is preferred over deleting history.",
    command: "git revert <commit>",
    reversible: true,
  },
  amend: {
    label: "Amend",
    plain: "Fix your most recent commit",
    detail:
      "Amending replaces your last commit rather than adding another one — handy for a typo in the message or a file you forgot. Only do it before pushing; amending something already on GitHub rewrites history for everyone else.",
    command: "git commit --amend",
    reversible: false,
  },
  discard: {
    label: "Discard",
    plain: "Throw away changes you have not committed",
    detail:
      "Discarding restores a file to its last committed state. This is one of the few genuinely unrecoverable actions in Git — the changes are not in history anywhere, so there is nothing to restore them from.",
    command: "git restore <file>",
    reversible: false,
  },
  tag: {
    label: "Tag",
    plain: "A permanent name for one commit",
    detail:
      "A tag marks a specific commit with a name that never moves, usually a version number like v1.2.0. Branches move as you work; tags do not.",
    command: "git tag -a v1.0.0",
    reversible: true,
  },
  release: {
    label: "Release",
    plain: "A tagged version published on GitHub",
    detail:
      "A release wraps a tag with notes and downloadable files, giving people a clear thing to install rather than a commit hash to guess at.",
    command: "gh release create v1.0.0",
    reversible: true,
  },
  cherryPick: {
    label: "Copy commit",
    plain: "Take one commit from another branch",
    detail:
      "Copying a commit applies a single change from somewhere else onto your branch, without bringing along everything around it. Git calls this cherry-picking. Useful for getting one bug fix onto a release branch.",
    command: "git cherry-pick <commit>",
    reversible: true,
  },
  gitignore: {
    label: "Ignored files",
    plain: "Files Git should never track",
    detail:
      "Build output, dependency folders and anything with a password in it should stay out of the project's history. Listing them in .gitignore keeps them out permanently, and stops them cluttering your list of changes.",
    command: "cat .gitignore",
    reversible: true,
  },
  head: {
    label: "Current position",
    plain: "The commit your files currently match",
    detail:
      "Git calls this HEAD. It is normally the newest commit on your branch, and it is what your changes are measured against.",
    command: "git rev-parse --short HEAD",
    reversible: true,
  },
  diff: {
    label: "Changes",
    plain: "The exact lines that differ",
    detail:
      "A diff shows added lines in green and removed lines in red, with a little of the surrounding code for context. Reading yours before committing is the cheapest bug-catching habit there is.",
    command: "git diff",
    reversible: true,
  },
  actions: {
    label: "Checks",
    plain: "Automated tests GitHub runs on your code",
    detail:
      "Many projects run tests, linters and builds automatically every time you push. A red check means something you pushed broke — the run's log says what.",
    command: "gh run list",
    reversible: true,
  },
  init: {
    label: "Initialise",
    plain: "Turn a folder into a Git project",
    detail:
      "Initialising creates a hidden .git folder inside your project. That is all a Git repository actually is — nothing is uploaded anywhere yet. From this point Git can start recording snapshots when you commit.",
    command: "git init",
    reversible: true,
  },
  readme: {
    label: "README",
    plain: "The page people see first",
    detail:
      "A file named README.md is what GitHub shows on a project's front page. It usually explains what the project is and how to use it — the closest thing Git has to a cover page.",
    command: "echo \"# Project\" > README.md",
    reversible: true,
  },
};

/** Convenience for the common case of reading one label. */
export function term(key: TermKey): string {
  return TERMS[key].label;
}

/** Ordered groups used by the Learn screen. */
export const GLOSSARY_GROUPS: { title: string; blurb: string; keys: TermKey[] }[] = [
  {
    title: "The everyday loop",
    blurb: "Four words cover ninety per cent of what you will ever do.",
    keys: ["stage", "commit", "push", "pull"],
  },
  {
    title: "Working in parallel",
    blurb: "How teams stay out of each other's way.",
    keys: ["branch", "checkout", "merge", "rebase", "conflict"],
  },
  {
    title: "Servers and copies",
    blurb: "Where your project lives when it is not on your computer.",
    keys: ["remote", "origin", "upstream", "clone", "fork", "syncFork", "fetch"],
  },
  {
    title: "Review and release",
    blurb: "Getting work in front of people, and shipping it.",
    keys: ["pullRequest", "actions", "tag", "release"],
  },
  {
    title: "Fixing things",
    blurb: "Everything here has been done by every developer alive.",
    keys: ["stash", "amend", "revert", "cherryPick", "discard"],
  },
  {
    title: "Odds and ends",
    blurb: "Terms you will meet in error messages.",
    keys: ["head", "diff", "gitignore", "init", "readme"],
  },
];
