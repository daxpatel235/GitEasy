/**
 * GitHub-side domain types.
 *
 * Deliberately separate from `types/git.ts`: everything here needs the network
 * and an account, whereas the Git types describe a folder on this computer.
 * Keeping the split visible in the type layer keeps it visible in the UI.
 */

import type { CheckState } from "./git";

export type PullRequestState = "open" | "draft" | "merged" | "closed";

export type ReviewState = "approved" | "changes-requested" | "pending" | "none";

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  state: PullRequestState;
  /** Branch the work is on. */
  head: string;
  /** Branch it would merge into. */
  base: string;
  createdAt: number;
  updatedAt: number;
  commentCount: number;
  review: ReviewState;
  checks: CheckState;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: Label[];
  url: string;
  /** Opened by the signed-in user. */
  isMine: boolean;
  /** The signed-in user has been asked to review it. */
  reviewRequested: boolean;
  /** No conflicts and all checks green — GitHub would let you merge now. */
  mergeable: boolean;
}

export type IssueState = "open" | "closed";

export interface Issue {
  number: number;
  title: string;
  author: string;
  state: IssueState;
  createdAt: number;
  commentCount: number;
  labels: Label[];
  url: string;
  assignedToMe: boolean;
}

export interface Label {
  name: string;
  /** Hex without the hash, exactly as the GitHub API returns it. */
  color: string;
}

export type RunStatus = "queued" | "running" | "success" | "failure" | "cancelled";

/** One run of a GitHub Actions workflow. */
export interface WorkflowRun {
  id: string;
  /** The workflow's display name, e.g. "Tests". */
  name: string;
  status: RunStatus;
  branch: string;
  commitMessage: string;
  shortHash: string;
  actor: string;
  startedAt: number;
  /** Null while the run is still going. */
  durationMs: number | null;
  url: string;
}

export interface Release {
  tag: string;
  name: string;
  publishedAt: number;
  isLatest: boolean;
  isDraft: boolean;
  isPrerelease: boolean;
  notes: string;
  url: string;
  downloadCount: number;
}

/** A repository the signed-in user can clone, for the "open from GitHub" flow. */
export interface RemoteRepo {
  slug: string;
  description: string;
  language: string | null;
  stars: number;
  isPrivate: boolean;
  isFork: boolean;
  updatedAt: number;
  url: string;
}

/** The signed-in GitHub account, or null when nobody is signed in. */
export interface GitHubAccount {
  login: string;
  name: string;
  avatarUrl: string | null;
}
