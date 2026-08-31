import { memo } from "react";
import { CommitBox } from "@/components/CommitBox";
import { FileList } from "@/components/FileList";
import { Button } from "@/components/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Explain, TermHeading } from "@/components/Explain";
import {
  ArchiveIcon,
  CheckIcon,
  CloudUploadIcon,
  ExternalLinkIcon,
  WarningIcon,
} from "@/components/Icons";
import type { ChangedFile, Conflict, LocalSave, PushResult, Repository } from "@/types/git";

interface ChangesViewProps {
  repo: Repository;
  files: ChangedFile[];
  pendingCommits: LocalSave[];
  conflicts: Conflict[];
  message: string;
  description: string;
  explanation: string;
  regenerating: boolean;
  /** How many messages were suggested for these changes, and which is showing. */
  suggestionCount: number;
  suggestionIndex: number;
  pushResult: PushResult | null;
  onMessageChange: (message: string) => void;
  onDescriptionChange: (description: string) => void;
  onRegenerate: () => void;
  onToggleFile: (path: string) => void;
  onToggleAll: (staged: boolean) => void;
  onDiscardFile: (path: string) => void;
  /** Load one file's diff, for rows that arrived without one. */
  onRequestDiff?: (path: string) => void;
  onShelve: () => void;
  onDismissSuccess: () => void;
  onOpenCommit: () => void;
  onReviewPush: () => void;
  onResolveConflicts: () => void;
}

const ChangesViewImpl = ({
  repo,
  files,
  pendingCommits,
  conflicts,
  message,
  description,
  explanation,
  regenerating,
  suggestionCount,
  suggestionIndex,
  pushResult,
  onMessageChange,
  onDescriptionChange,
  onRegenerate,
  onToggleFile,
  onToggleAll,
  onDiscardFile,
  onRequestDiff,
  onShelve,
  onDismissSuccess,
  onOpenCommit,
  onReviewPush,
  onResolveConflicts,
}: ChangesViewProps) => {
  const staged = files.filter((f) => f.staged);
  const pendingFileCount = pendingCommits.reduce((n, save) => n + save.files.length, 0);
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);

  if (pushResult) {
    return <PushedState result={pushResult} onDismiss={onDismissSuccess} onOpen={onOpenCommit} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Changes"
        subtitle={
          files.length === 0
            ? "Files you have edited since your last commit show up here."
            : "Tick what belongs together, describe it, and commit. Nothing leaves your computer at this step."
        }
        actions={
          files.length > 0 ? (
            <Button onClick={onShelve} title="Put these changes aside without committing">
              <ArchiveIcon className="h-[15px] w-[15px]" />
              Shelve
            </Button>
          ) : undefined
        }
      >
        {files.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
            <span className="font-mono tabular-nums">
              <span className="text-added">+{additions}</span>{" "}
              <span className="text-deleted">−{deletions}</span>
            </span>
            <span className="text-faint">·</span>
            <span>
              {files.length} {files.length === 1 ? "file" : "files"} changed on{" "}
              <span className="font-mono text-[12.5px] text-content">{repo.branch}</span>
            </span>
          </div>
        )}
      </PageHeader>

      {/* Conflicts block everything else, so they get the top of the screen. */}
      {conflicts.length > 0 && (
        <section className="flex items-center gap-4 rounded-card border border-deleted/45 bg-deleted/10 px-4 py-[14px]">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-deleted/20 text-deleted">
            <WarningIcon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-[6px] text-[15px] font-medium">
              <TermHeading term="conflict">
                {conflicts.length} {conflicts.length === 1 ? "file needs" : "files need"} your
                decision
              </TermHeading>
            </div>
            <div className="mt-[2px] text-[13.5px] text-muted">
              Someone else changed the same lines you did. Pick which version to keep.
            </div>
          </div>
          <Button variant="primary" onClick={onResolveConflicts} className="flex-none">
            Resolve
          </Button>
        </section>
      )}

      {/* Committed here but not pushed — the most likely thing to need acting on. */}
      {pendingCommits.length > 0 && (
        <section className="flex items-center gap-4 rounded-card border border-modified/40 bg-modified/10 px-4 py-[14px]">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-modified/20 text-modified">
            <CloudUploadIcon className="h-[18px] w-[18px]" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium">
              {pendingCommits.length} {pendingCommits.length === 1 ? "commit" : "commits"} on this
              computer only
            </div>
            <div className="mt-[2px] flex items-center gap-[6px] text-[13.5px] text-muted">
              <span>
                {pendingFileCount} {pendingFileCount === 1 ? "file is" : "files are"} not on GitHub
                yet.
              </span>
              <Explain term="push" />
            </div>
          </div>

          <Button variant="danger" onClick={onReviewPush} className="flex-none">
            <CloudUploadIcon className="h-[16px] w-[16px]" />
            Push
          </Button>
        </section>
      )}

      {files.length === 0 ? (
        pendingCommits.length === 0 && (
          <EmptyState
            icon={<CheckIcon className="h-6 w-6 text-added" />}
            title="Nothing to commit"
            body="Every file matches your last commit. Edit something in your editor and it will appear here."
          />
        )
      ) : (
        <>
          <section className="flex flex-col gap-[10px]">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="display flex items-center gap-[6px] text-[16px] font-semibold">
                Your changes
                <Explain term="diff" />
              </h2>
              <span className="text-[12.5px] text-faint">Click a file to read the lines</span>
            </div>

            <FileList
              files={files}
              onToggle={onToggleFile}
              onToggleAll={onToggleAll}
              onDiscard={onDiscardFile}
              onRequestDiff={onRequestDiff}
            />
          </section>

          <CommitBox
            message={message}
            explanation={explanation}
            description={description}
            onMessageChange={onMessageChange}
            onDescriptionChange={onDescriptionChange}
            onRegenerate={onRegenerate}
            regenerating={regenerating}
            suggestionCount={suggestionCount}
            suggestionIndex={suggestionIndex}
          />

          {staged.length === 0 && (
            <p className="text-center text-[13px] text-muted">
              Tick at least one file above before you can commit.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PushedState({
  result,
  onDismiss,
  onOpen,
}: {
  result: PushResult;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-[6px] px-6 py-[76px] text-center">
      <span className="mb-[6px] grid h-12 w-12 animate-pop-in place-items-center rounded-full bg-added/15 text-added">
        <CheckIcon className="h-6 w-6" />
      </span>

      <div className="display text-[18px] font-semibold">It&rsquo;s on GitHub</div>

      {result.message && (
        <div className="mt-1 rounded-[5px] border border-line-soft bg-surface-alt px-[10px] py-[5px] font-mono text-[12.5px]">
          {result.message}
        </div>
      )}

      <p className="mt-1 max-w-[44ch] text-[13.5px] text-muted">
        {result.fileCount} {result.fileCount === 1 ? "file is" : "files are"} now visible to
        everyone with access to the project.
      </p>

      <Badge tone="success" className="mt-3">
        Your branch is in sync
      </Badge>

      <div className="mt-4 flex gap-2">
        {result.commitUrl && (
          <Button onClick={onOpen}>
            View on GitHub
            <ExternalLinkIcon className="h-[14px] w-[14px]" />
          </Button>
        )}
        <Button variant="primary" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </div>
  );
}

/** Memoised: the parent re-renders on every keystroke in the commit box. */
export const ChangesView = memo(ChangesViewImpl);
