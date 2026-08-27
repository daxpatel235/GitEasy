import { useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Badge, LabelChip, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs, PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { SelectField, TextArea, TextField } from "@/components/ui/Field";
import { Avatar, ChecksDot } from "./HistoryView";
import { Explain } from "@/components/Explain";
import {
  CheckIcon,
  ExternalLinkIcon,
  MergeIcon,
  PlusIcon,
  PullRequestIcon,
  ShieldIcon,
} from "@/components/Icons";
import { timeAgo } from "@/lib/time";
import type { Branch } from "@/types/git";
import type { PullRequest, PullRequestState, ReviewState } from "@/types/github";

type Filter = "open" | "mine" | "review" | "closed";

interface PullRequestsViewProps {
  pullRequests: PullRequest[];
  branches: Branch[];
  currentBranch: string;
  defaultBranch: string;
  loading: boolean;
  busy: boolean;
  signedIn: boolean;
  /** Opens the create dialog pre-filled, e.g. from the Branches screen. */
  draftBranch: string | null;
  onDraftBranchChange: (branch: string | null) => void;
  onCreate: (input: { head: string; base: string; title: string; body: string; draft: boolean }) => void;
  onMerge: (number: number) => void;
  onOpenUrl: (url: string) => void;
  onSignIn: () => void;
}

export function PullRequestsView({
  pullRequests,
  branches,
  currentBranch,
  defaultBranch,
  loading,
  busy,
  signedIn,
  draftBranch,
  onDraftBranchChange,
  onCreate,
  onMerge,
  onOpenUrl,
  onSignIn,
}: PullRequestsViewProps) {
  const [filter, setFilter] = useState<Filter>("open");

  const counts = useMemo(
    () => ({
      open: pullRequests.filter((p) => p.state === "open" || p.state === "draft").length,
      mine: pullRequests.filter((p) => p.isMine && p.state !== "merged" && p.state !== "closed")
        .length,
      review: pullRequests.filter((p) => p.reviewRequested).length,
      closed: pullRequests.filter((p) => p.state === "merged" || p.state === "closed").length,
    }),
    [pullRequests],
  );

  const visible = useMemo(
    () =>
      pullRequests.filter((pr) => {
        const closed = pr.state === "merged" || pr.state === "closed";
        if (filter === "closed") return closed;
        if (filter === "mine") return pr.isMine && !closed;
        if (filter === "review") return pr.reviewRequested;
        return !closed;
      }),
    [pullRequests, filter],
  );

  if (!signedIn) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Pull requests" subtitle={PR_BLURB} />
        <EmptyState
          icon={<PullRequestIcon className="h-6 w-6" />}
          title="Sign in to GitHub"
          body="Pull requests live on GitHub rather than on your computer, so this screen needs an account to read them."
          action={
            <Button variant="primary" onClick={onSignIn}>
              Sign in to GitHub
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pull requests"
        subtitle={PR_BLURB}
        actions={
          <Button variant="primary" onClick={() => onDraftBranchChange(currentBranch)}>
            <PlusIcon className="h-[15px] w-[15px]" />
            New pull request
          </Button>
        }
      >
        <FilterTabs
          active={filter}
          onChange={setFilter}
          tabs={[
            { id: "open", label: "Open", count: counts.open },
            { id: "mine", label: "Mine", count: counts.mine },
            { id: "review", label: "Waiting on you", count: counts.review },
            { id: "closed", label: "Done", count: counts.closed },
          ]}
        />
      </PageHeader>

      {loading ? (
        <p className="py-12 text-center text-[13.5px] text-muted">Loading from GitHub…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<PullRequestIcon className="h-6 w-6" />}
          title="Nothing here"
          body={
            filter === "review"
              ? "Nobody is waiting on your review. Enjoy it."
              : "No pull requests match this filter. Push a branch and open one to get your work reviewed."
          }
        />
      ) : (
        <div className="flex flex-col gap-[6px]">
          {visible.map((pr) => (
            <PullRequestRow
              key={pr.number}
              pr={pr}
              busy={busy}
              onMerge={() => onMerge(pr.number)}
              onOpen={() => onOpenUrl(pr.url)}
            />
          ))}
        </div>
      )}

      {draftBranch && (
        <CreatePullRequestModal
          branches={branches}
          head={draftBranch}
          base={defaultBranch}
          busy={busy}
          onCancel={() => onDraftBranchChange(null)}
          onCreate={(input) => {
            onCreate(input);
            onDraftBranchChange(null);
          }}
        />
      )}
    </div>
  );
}

const PR_BLURB = (
  <>
    A pull request puts your branch side by side with the main one so people can read it,
    comment on individual lines and approve it. On most teams it is the only way work reaches
    the main branch. <Explain term="pullRequest" />
  </>
);

const STATE_STYLE: Record<PullRequestState, { tone: BadgeTone; label: string }> = {
  open: { tone: "success", label: "Open" },
  draft: { tone: "neutral", label: "Draft" },
  merged: { tone: "accent", label: "Merged" },
  closed: { tone: "danger", label: "Closed" },
};

const REVIEW_STYLE: Record<ReviewState, { tone: BadgeTone; label: string } | null> = {
  approved: { tone: "success", label: "Approved" },
  "changes-requested": { tone: "danger", label: "Changes requested" },
  pending: { tone: "warn", label: "Review needed" },
  none: null,
};

function PullRequestRow({
  pr,
  busy,
  onMerge,
  onOpen,
}: {
  pr: PullRequest;
  busy: boolean;
  onMerge: () => void;
  onOpen: () => void;
}) {
  const state = STATE_STYLE[pr.state];
  const review = REVIEW_STYLE[pr.review];
  const live = pr.state === "open" || pr.state === "draft";

  return (
    <div className="settings-row group items-start">
      <span className="pt-[2px]">
        <Avatar name={pr.author} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="truncate text-left text-[14px] font-medium hover:text-accent hover:underline"
          >
            {pr.title}
          </button>
          <Badge tone={state.tone}>{state.label}</Badge>
          {review && <Badge tone={review.tone}>{review.label}</Badge>}
          {pr.reviewRequested && <Badge tone="accent">Waiting on you</Badge>}
        </span>

        <span className="mt-[4px] flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-faint">
          <span>#{pr.number}</span>
          <span>·</span>
          <span>{pr.author}</span>
          <span>·</span>
          <span>{timeAgo(pr.updatedAt)}</span>
          <span>·</span>
          <span className="font-mono text-[11.5px]">
            {pr.head} → {pr.base}
          </span>
          {pr.commentCount > 0 && (
            <>
              <span>·</span>
              <span>
                {pr.commentCount} {pr.commentCount === 1 ? "comment" : "comments"}
              </span>
            </>
          )}
        </span>

        {pr.labels.length > 0 && (
          <span className="mt-[6px] flex flex-wrap gap-[5px]">
            {pr.labels.map((label) => (
              <LabelChip key={label.name} {...label} />
            ))}
          </span>
        )}
      </span>

      <span className="flex flex-none flex-col items-end gap-[6px]">
        <span className="flex items-center gap-2">
          <ChecksDot state={pr.checks} />
          <span className="font-mono text-2xs tabular-nums text-faint">
            <span className="text-added">+{pr.additions}</span>{" "}
            <span className="text-deleted">−{pr.deletions}</span>
          </span>
        </span>

        {live && (
          <span className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <Button onClick={onOpen} className="px-[9px] py-[5px] text-[12.5px]">
              <ExternalLinkIcon className="h-[13px] w-[13px]" />
              Open
            </Button>
            {pr.mergeable && (
              <Button
                variant="primary"
                onClick={onMerge}
                disabled={busy}
                className="px-[9px] py-[5px] text-[12.5px]"
                title="Merge this pull request into its target branch"
              >
                <MergeIcon className="h-[13px] w-[13px]" />
                Merge
              </Button>
            )}
          </span>
        )}
      </span>
    </div>
  );
}

function CreatePullRequestModal({
  branches,
  head,
  base,
  busy,
  onCancel,
  onCreate,
}: {
  branches: Branch[];
  head: string;
  base: string;
  busy: boolean;
  onCancel: () => void;
  onCreate: (input: {
    head: string;
    base: string;
    title: string;
    body: string;
    draft: boolean;
  }) => void;
}) {
  const [headBranch, setHeadBranch] = useState(head);
  const [baseBranch, setBaseBranch] = useState(base);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);

  const source = branches.find((b) => b.name === headBranch);
  const neverPushed = source ? !source.upstream : false;
  const sameBranch = headBranch === baseBranch;

  const options = branches.map((b) => ({
    value: b.name,
    label: b.isDefault ? `${b.name} (main branch)` : b.name,
  }));

  return (
    <Modal
      title="Open a pull request"
      icon={<PullRequestIcon className="h-6 w-6" />}
      busy={busy}
      onClose={onCancel}
      width="lg"
      subtitle="Ask for your branch to be reviewed and merged. Reviewers see every line you changed and can comment on any of them."
      footer={
        <>
          <Button onClick={onCancel} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-[1.4]"
            disabled={busy || title.trim().length === 0 || sameBranch}
            onClick={() =>
              onCreate({ head: headBranch, base: baseBranch, title: title.trim(), body, draft })
            }
          >
            {busy ? "Opening…" : draft ? "Create draft" : "Open pull request"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Merge this branch"
            value={headBranch}
            onChange={setHeadBranch}
            options={options}
            hint="The work you want reviewed."
          />
          <SelectField
            label="Into this one"
            value={baseBranch}
            onChange={setBaseBranch}
            options={options}
            hint="Usually the project's main branch."
          />
        </div>

        {sameBranch && (
          <p className="text-[12.5px] text-deleted">
            A branch cannot be merged into itself. Pick two different branches.
          </p>
        )}

        {neverPushed && !sameBranch && (
          <div className="flex items-start gap-[10px] rounded-lg border border-modified/40 bg-modified/10 px-3 py-[9px]">
            <ShieldIcon className="mt-[1px] h-[15px] w-[15px] flex-none text-modified" />
            <p className="text-[12.5px] leading-relaxed text-muted">
              <span className="font-mono text-[12px] text-content">{headBranch}</span> has never
              been pushed. GitEasy will push it first — otherwise GitHub has nothing to show
              reviewers.
            </p>
          </div>
        )}

        <TextField
          label="Title"
          value={title}
          onChange={setTitle}
          placeholder="Move session handling into a shared auth module"
          autoFocus
          hint="One line. Say what changes, not what you did."
        />

        <TextArea
          label="Description"
          value={body}
          onChange={setBody}
          rows={5}
          placeholder={"What does this change and why?\n\nAnything a reviewer should look at closely?\n\nCloses #151"}
          hint={
            <>
              Writing <span className="font-mono text-[12px]">Closes #151</span> makes GitHub
              close that issue automatically when this is merged.
            </>
          }
        />

        <button
          type="button"
          onClick={() => setDraft((v) => !v)}
          className="flex items-start gap-3 rounded-lg border border-line-soft bg-surface-alt/40 px-3 py-[10px] text-left transition-colors hover:border-line"
        >
          <span
            className={`mt-[1px] grid h-[16px] w-[16px] flex-none place-items-center rounded-[4px] border transition-colors ${
              draft ? "border-accent bg-accent" : "border-line"
            }`}
          >
            {draft && <CheckIcon className="h-[11px] w-[11px] text-accent-ink" />}
          </span>
          <span>
            <span className="block text-[13px] font-medium">Open as a draft</span>
            <span className="mt-[2px] block text-[12px] leading-relaxed text-muted">
              Visible to the team but explicitly not ready for review. Useful for getting early
              feedback without anyone feeling obliged to approve it.
            </span>
          </span>
        </button>
      </div>
    </Modal>
  );
}

