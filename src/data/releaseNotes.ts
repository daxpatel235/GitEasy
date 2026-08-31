/**
 * What changed in each release, shown once after an update.
 *
 * Kept beside the app rather than fetched, so the notes appear instantly, work
 * offline, and cannot be changed underneath a version that has already shipped.
 * The newest entry comes first; only entries newer than the version the user
 * last ran are shown.
 */

export interface ReleaseNote {
  /** Must match the version in package.json exactly. */
  version: string;
  /** ISO date, used for the "released on" line. */
  date: string;
  /** One line under the heading. Sets the tone for the whole release. */
  headline: string;
  highlights: Highlight[];
}

export interface Highlight {
  /** A short noun phrase — what this is, not a sentence. */
  title: string;
  /** Two sentences at most, in the same plain voice as the rest of the app. */
  body: string;
  /** Which of the small illustrative glyphs to show beside it. */
  icon: "sparkle" | "bolt" | "shield" | "brush" | "repo";
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.0.2",
    date: "2026-09-01",
    headline: "Better commit messages, and GitEasy remembers where you were.",
    highlights: [
      {
        icon: "sparkle",
        title: "Commit messages worth keeping",
        body: "GitEasy now reads what actually changed — what was added, removed or renamed, and whether the new lines look like a repair — and drafts several genuinely different messages from it. \"Suggest another\" steps through them instantly instead of handing back the same sentence.",
      },
      {
        icon: "repo",
        title: "Picks up where you left off",
        body: "Closing GitEasy, or shutting the machine down, no longer means finding your project again. It reopens on the same project and the same screen. You can switch this off under Settings → Git.",
      },
      {
        icon: "bolt",
        title: "Updates install themselves",
        body: "New versions are downloaded in the background and applied when you next restart — no more going back to the releases page. An indicator appears in the top bar, Settings gets a dot, and the command palette can check on demand. Every update is signed and verified before installing, and automatic downloading can be switched off under Settings → About.",
      },
      {
        icon: "brush",
        title: "This window",
        body: "Every update now says what changed, so a new version is never a mystery.",
      },
    ],
  },
  {
    version: "1.0.1",
    date: "2026-09-01",
    headline: "The window no longer stops answering while it works.",
    highlights: [
      {
        icon: "bolt",
        title: "No more freezing",
        body: "Every Git and GitHub operation now runs off the thread that draws the window, so GitEasy keeps responding no matter what is happening underneath.",
      },
      {
        icon: "bolt",
        title: "Projects open immediately",
        body: "The connection dialog appears the moment you pick a folder, and the rest fills in behind it. GitHub screens each load on their own, so one slow request no longer holds up the others.",
      },
      {
        icon: "brush",
        title: "Two smaller fixes",
        body: "\"Location on this computer\" opens the right folder on Windows, and choosing a custom accent colour stays inside the settings page instead of opening a separate window.",
      },
    ],
  },
];
