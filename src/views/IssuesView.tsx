import { useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Badge, LabelChip } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs, PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { TextArea, TextField } from "@/components/ui/Field";
import { Avatar } from "./HistoryView";
import { CheckIcon, ExternalLinkIcon, IssueIcon, PlusIcon } from "@/components/Icons";
import { timeAgo } from "@/lib/time";
import type { Issue } from "@/types/github";

type Filter = "open" | "mine" | "closed";

interface IssuesViewProps {
  issues: Issue[];
  loading: boolean;
  busy: boolean;
  signedIn: boolean;
  onCreate: (title: string, body: string) => void;
  onOpenUrl: (url: string) => void;
  onSignIn: () => void;
}

/**
 * Issues, framed as a task list rather than a bug tracker.
 *
 * For a solo developer this is where "things I mean to do" live; on a team it
 * is also how work arrives. Both readings are supported by the same list, so
 * the copy avoids assuming either.
 */
export function IssuesView({
  issues,
  loading,
  busy,
  signedIn,
  onCreate,
  onOpenUrl,
  onSignIn,
}: IssuesViewProps) {
  const [filter, setFilter] = useState<Filter>("open");
  const [composing, setComposing] = useState(false);

  const counts = useMemo(
    () => ({
      open: issues.filter((i) => i.state === "open").length,
      mine: issues.filter((i) => i.assignedToMe && i.state === "open").length,
      closed: issues.filter((i) => i.state === "closed").length,
    }),
    [issues],
  );

  const visible = useMemo(
    () =>
      issues.filter((issue) => {
        if (filter === "closed") return issue.state === "closed";
        if (filter === "mine") return issue.assignedToMe && issue.state === "open";
        return issue.state === "open";
      }),
    [issues, filter],
  );

  if (!signedIn) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Issues" subtitle={BLURB} />
        <EmptyState
          icon={<IssueIcon className="h-6 w-6" />}
          title="Sign in to GitHub"
          body="Issues live on GitHub, so this screen needs an account to read and write them."
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
        title="Issues"
        subtitle={BLURB}
        actions={
          <Button variant="primary" onClick={() => setComposing(true)}>
            <PlusIcon className="h-[15px] w-[15px]" />
            New issue
          </Button>
        }
      >
        <FilterTabs
          active={filter}
          onChange={setFilter}
          tabs={[
            { id: "open", label: "Open", count: counts.open },
            { id: "mine", label: "Assigned to me", count: counts.mine },
            { id: "closed", label: "Closed", count: counts.closed },
          ]}
        />
      </PageHeader>

      {loading ? (
        <p className="py-12 text-center text-[13.5px] text-muted">Loading from GitHub…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<IssueIcon className="h-6 w-6" />}
          title={filter === "closed" ? "Nothing closed yet" : "No open issues"}
          body="Issues are how bugs and ideas get written down before anyone starts coding. Open one for the next thing you mean to fix."
          action={
            <Button variant="primary" onClick={() => setComposing(true)}>
              <PlusIcon className="h-[15px] w-[15px]" />
              New issue
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-[6px]">
          {visible.map((issue) => (
            <div key={issue.number} className="settings-row group items-start">
              <span
                className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-lg border border-line-soft ${
                  issue.state === "open"
                    ? "bg-added/12 text-added"
                    : "bg-surface-alt text-accent"
                }`}
              >
                {issue.state === "open" ? (
                  <IssueIcon className="h-[15px] w-[15px]" />
                ) : (
                  <CheckIcon className="h-[15px] w-[15px]" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenUrl(issue.url)}
                    className="truncate text-left text-[14px] font-medium hover:text-accent hover:underline"
                  >
                    {issue.title}
                  </button>
                  {issue.assignedToMe && <Badge tone="accent">Yours</Badge>}
                  {issue.state === "closed" && <Badge tone="neutral">Closed</Badge>}
                </span>

                <span className="mt-[4px] flex flex-wrap items-center gap-x-2 text-[12.5px] text-faint">
                  <span>#{issue.number}</span>
                  <span>·</span>
                  <span>opened by {issue.author}</span>
                  <span>·</span>
                  <span>{timeAgo(issue.createdAt)}</span>
                  {issue.commentCount > 0 && (
                    <>
                      <span>·</span>
                      <span>
                        {issue.commentCount} {issue.commentCount === 1 ? "comment" : "comments"}
                      </span>
                    </>
                  )}
                </span>

                {issue.labels.length > 0 && (
                  <span className="mt-[6px] flex flex-wrap gap-[5px]">
                    {issue.labels.map((label) => (
                      <LabelChip key={label.name} {...label} />
                    ))}
                  </span>
                )}
              </span>

              <span className="flex flex-none items-center gap-2">
                <Avatar name={issue.author} size={24} />
                <button
                  type="button"
                  onClick={() => onOpenUrl(issue.url)}
                  aria-label={`Open issue ${issue.number} on GitHub`}
                  className="rounded-md border border-line-soft p-[6px] text-muted opacity-0 transition-all hover:border-line hover:bg-surface-alt hover:text-content focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <ExternalLinkIcon className="h-[14px] w-[14px]" />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {composing && (
        <NewIssueModal
          busy={busy}
          onCancel={() => setComposing(false)}
          onCreate={(title, body) => {
            onCreate(title, body);
            setComposing(false);
          }}
        />
      )}
    </div>
  );
}

const BLURB =
  "Bugs, ideas and to-dos, written down where the rest of the project can see them. Working solo? They still beat a text file — you can link a commit to one and close it automatically.";

function NewIssueModal({
  busy,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  onCancel: () => void;
  onCreate: (title: string, body: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <Modal
      title="New issue"
      icon={<IssueIcon className="h-6 w-6" />}
      busy={busy}
      onClose={onCancel}
      subtitle="Describe the problem or the idea. A good issue says what happened, what you expected, and how to see it for yourself."
      footer={
        <>
          <Button onClick={onCancel} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={busy || title.trim().length === 0}
            onClick={() => onCreate(title.trim(), body)}
          >
            {busy ? "Creating…" : "Create issue"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Title"
          value={title}
          onChange={setTitle}
          placeholder="Session expires while the user is still typing"
          autoFocus
        />
        <TextArea
          label="Description"
          value={body}
          onChange={setBody}
          rows={6}
          placeholder={"What happened?\n\nWhat did you expect instead?\n\nSteps to reproduce:\n1. …"}
        />
      </div>
    </Modal>
  );
}
