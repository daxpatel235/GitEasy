import { memo } from "react";
import { Button } from "@/components/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Explain } from "@/components/Explain";
import { ArchiveIcon, BranchIcon, TrashIcon, UndoIcon } from "@/components/Icons";
import { timeAgo } from "@/lib/time";
import type { Stash } from "@/types/git";

interface ShelfViewProps {
  stashes: Stash[];
  busy: boolean;
  hasChanges: boolean;
  onShelveCurrent: () => void;
  onRestore: (id: string) => void;
  onDrop: (id: string) => void;
}

/**
 * The stash, renamed to something a person would say out loud.
 *
 * "Stash" is one of Git's least guessable words for a feature beginners need
 * constantly — the moment they are told to switch branches mid-task. Calling
 * it a shelf makes the mental model obvious; the tooltip still teaches the
 * real name, because their colleagues will use it.
 */
const ShelfViewImpl = ({
  stashes,
  busy,
  hasChanges,
  onShelveCurrent,
  onRestore,
  onDrop,
}: ShelfViewProps) => {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Shelf"
        subtitle={
          <>
            Unfinished work you have set aside. It stays here, safely, until you put it back —
            handy when you need a clean project to switch branches. Git calls this a stash.{" "}
            <Explain term="stash" />
          </>
        }
        actions={
          <Button variant="primary" onClick={onShelveCurrent} disabled={!hasChanges || busy}>
            <ArchiveIcon className="h-[15px] w-[15px]" />
            Shelve current work
          </Button>
        }
      />

      {stashes.length === 0 ? (
        <EmptyState
          icon={<ArchiveIcon className="h-6 w-6" />}
          title="The shelf is empty"
          body={
            hasChanges
              ? "You have uncommitted changes. Shelve them if you need to switch branches without committing half-finished work."
              : "Nothing is set aside. When you have changes you are not ready to commit, park them here."
          }
        />
      ) : (
        <div className="flex flex-col gap-[6px]">
          {stashes.map((stash) => (
            <div key={stash.id} className="settings-row group">
              <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg border border-line-soft bg-surface-alt text-muted">
                <ArchiveIcon className="h-[15px] w-[15px]" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{stash.message}</span>
                <span className="mt-[2px] flex flex-wrap items-center gap-x-2 text-[12.5px] text-faint">
                  <span className="inline-flex items-center gap-[4px]">
                    <BranchIcon className="h-3 w-3" />
                    <span className="font-mono">{stash.branch}</span>
                  </span>
                  <span>·</span>
                  <span>
                    {stash.fileCount} {stash.fileCount === 1 ? "file" : "files"}
                  </span>
                  <span>·</span>
                  <span>{timeAgo(stash.at)}</span>
                </span>
              </span>

              <Badge tone="neutral" className="flex-none font-mono">
                {stash.id}
              </Badge>

              <span className="flex flex-none items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <Button
                  onClick={() => onRestore(stash.id)}
                  disabled={busy}
                  className="px-[10px] py-[6px] text-[13px]"
                  title="Put these changes back into your project"
                >
                  <UndoIcon className="h-[14px] w-[14px]" />
                  Put back
                </Button>
                <button
                  type="button"
                  onClick={() => onDrop(stash.id)}
                  disabled={busy}
                  title="Throw this away permanently"
                  aria-label={`Delete ${stash.message}`}
                  className="rounded-md border border-line-soft p-[7px] text-muted transition-colors hover:border-deleted/50 hover:bg-deleted/10 hover:text-deleted disabled:opacity-40"
                >
                  <TrashIcon className="h-[14px] w-[14px]" />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Memoised: the parent re-renders on every keystroke in the commit box. */
export const ShelfView = memo(ShelfViewImpl);
