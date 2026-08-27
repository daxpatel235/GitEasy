import { memo, useCallback, useMemo, useState } from "react";
import { ChevronRightIcon, TrashIcon, UndoIcon } from "./Icons";
import {
  STATUS_LABEL,
  STATUS_LETTER,
  type ChangedFile,
  type DiffLine,
  type FileStatus,
} from "@/types/git";

const STATUS_COLOR: Record<FileStatus, string> = {
  modified: "text-modified",
  added: "text-added",
  deleted: "text-deleted",
  renamed: "text-modified",
  untracked: "text-faint",
  conflicted: "text-deleted",
};

interface FileListProps {
  files: ChangedFile[];
  /** Omit both handlers to render a read-only list, as history does. */
  onToggle?: (path: string) => void;
  onToggleAll?: (staged: boolean) => void;
  onDiscard?: (path: string) => void;
  /**
   * Fetch the diff for a file that arrived without one.
   *
   * Long lists ship without every patch attached — generating them all costs
   * more than showing them is worth — so opening a row asks for that one file.
   */
  onRequestDiff?: (path: string) => void;
}

export function FileList({
  files,
  onToggle,
  onToggleAll,
  onDiscard,
  onRequestDiff,
}: FileListProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Stable across renders, so memoised rows are not invalidated by a new
  // function identity on every keystroke elsewhere in the app.
  const toggleRow = useCallback(
    (file: ChangedFile, isOpen: boolean) => {
      setExpanded(isOpen ? null : file.path);
      // Ask for the diff the first time a row without one is opened.
      if (!isOpen && file.diff.length === 0) onRequestDiff?.(file.path);
    },
    [onRequestDiff],
  );

  const selectable = Boolean(onToggle);
  const { stagedCount, allStaged } = useMemo(() => {
    const staged = files.reduce((total, f) => total + (f.staged ? 1 : 0), 0);
    return { stagedCount: staged, allStaged: staged === files.length && files.length > 0 };
  }, [files]);

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface/60">
      {selectable && onToggleAll && (
        <div className="flex items-center gap-[10px] border-b border-line bg-surface-alt/60 px-3 py-[7px]">
          <Tick checked={allStaged} indeterminate={stagedCount > 0 && !allStaged} onChange={() => onToggleAll(!allStaged)} />
          <span className="text-[12.5px] text-muted">
            {stagedCount === 0
              ? "Nothing ticked — tick the files you want to commit"
              : `${stagedCount} of ${files.length} ticked for the next commit`}
          </span>
        </div>
      )}

      {files.map((file, index) => (
        <FileRow
          key={file.path}
          file={file}
          open={expanded === file.path}
          divided={index > 0 || selectable}
          selectable={selectable}
          onToggle={onToggle}
          onDiscard={onDiscard}
          onOpen={toggleRow}
          canLoadDiff={Boolean(onRequestDiff)}
        />
      ))}
    </div>
  );
}

interface FileRowProps {
  file: ChangedFile;
  open: boolean;
  divided: boolean;
  selectable: boolean;
  onToggle?: (path: string) => void;
  onDiscard?: (path: string) => void;
  onOpen: (file: ChangedFile, isOpen: boolean) => void;
  canLoadDiff: boolean;
}

/**
 * One row, memoised.
 *
 * This is the component that decides whether the app feels fast. The commit
 * message box lives in the same tree, so without this every keystroke would
 * re-render every row and every line of every open diff. `files` keeps its
 * identity while typing, so each row's props are unchanged and React skips the
 * whole subtree.
 */
const FileRow = memo(function FileRow({
  file,
  open,
  divided,
  selectable,
  onToggle,
  onDiscard,
  onOpen,
  canLoadDiff,
}: FileRowProps) {
  return (
    <div className={open ? "row-contain" : "row-skip row-contain"}>
      <div
        className={`group flex w-full items-center gap-[10px] px-3 py-[9px] transition-colors duration-150 hover:bg-surface-alt ${
          divided ? "border-t border-line-soft" : ""
        } ${open ? "bg-surface-alt" : ""} ${
          selectable && !file.staged ? "opacity-55" : ""
        }`}
      >
        {selectable && onToggle && (
          <Tick checked={file.staged} onChange={() => onToggle(file.path)} label={file.path} />
        )}

        <button
          type="button"
          onClick={() => onOpen(file, open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-[10px] text-left"
        >
          <span
            title={STATUS_LABEL[file.status]}
            className={`w-[13px] flex-none text-center font-mono text-xs font-medium ${STATUS_COLOR[file.status]}`}
          >
            {STATUS_LETTER[file.status]}
          </span>

          <FilePath path={file.path} />

          <span className="ml-auto flex-none font-mono text-2xs tabular-nums text-faint">
            {file.additions > 0 && <span className="text-added">+{file.additions}</span>}
            {file.deletions > 0 && <span className="text-deleted"> −{file.deletions}</span>}
          </span>

          <ChevronRightIcon
            className={`h-3 w-3 flex-none text-faint transition-transform duration-150 ${
              open ? "rotate-90" : ""
            }`}
          />
        </button>

        {onDiscard && (
          <button
            type="button"
            onClick={() => onDiscard(file.path)}
            title={`Throw away your changes to ${file.path}. This cannot be undone.`}
            className="flex-none rounded p-1 text-faint opacity-0 transition-all hover:bg-deleted/15 hover:text-deleted focus-visible:opacity-100 group-hover:opacity-100"
          >
            {file.status === "untracked" ? (
              <TrashIcon className="h-[14px] w-[14px]" />
            ) : (
              <UndoIcon className="h-[14px] w-[14px]" />
            )}
          </button>
        )}
      </div>

      {/* Only the open row builds diff rows at all. */}
      {open &&
        (file.diff.length > 0 ? (
          <DiffView lines={file.diff} />
        ) : (
          <PendingDiff file={file} loading={canLoadDiff} />
        ))}
    </div>
  );
});

/**
 * Shown while a diff is on its way, or when there is deliberately not one.
 *
 * A file with no patch is not an error: very large and binary files are left
 * out on purpose, because rendering a hundred thousand generated lines costs
 * far more than anyone gains from seeing them.
 */
function PendingDiff({ file, loading }: { file: ChangedFile; loading: boolean }) {
  const tooBig = file.additions + file.deletions > 2000;

  return (
    <div className="border-t border-line-soft bg-ground/40 px-4 py-3 text-[12.5px] text-muted">
      {tooBig
        ? `This file has ${(file.additions + file.deletions).toLocaleString()} changed lines — too many to show here. It will still be committed normally.`
        : loading
          ? "Reading the changes…"
          : "No preview available for this file."}
    </div>
  );
}

/** Square checkbox matching the app's surfaces rather than the OS default. */
function Tick({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label ? `Include ${label} in the next commit` : "Include everything"}
      onClick={onChange}
      className={`grid h-[15px] w-[15px] flex-none place-items-center rounded-[4px] border transition-colors ${
        checked || indeterminate ? "border-accent bg-accent" : "border-line hover:border-muted"
      }`}
    >
      {indeterminate ? (
        <span className="h-[2px] w-[7px] rounded-full bg-accent-ink" />
      ) : (
        checked && (
          <svg viewBox="0 0 12 12" className="h-[10px] w-[10px] text-accent-ink">
            <path
              d="m2.5 6.2 2.3 2.3L9.5 3.8"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )
      )}
    </button>
  );
}

/** Dims the directory so the filename reads first. */
function FilePath({ path }: { path: string }) {
  const cut = path.lastIndexOf("/") + 1;
  return (
    <span className="truncate font-mono text-[12.5px]">
      <span className="text-faint">{path.slice(0, cut)}</span>
      {path.slice(cut)}
    </span>
  );
}

const LINE_STYLE: Record<DiffLine["kind"], string> = {
  add: "bg-added/10 text-added",
  delete: "bg-deleted/10 text-deleted",
  meta: "text-faint",
  context: "",
};

const LINE_PREFIX: Record<DiffLine["kind"], string> = {
  add: "+ ",
  delete: "− ",
  meta: "  ",
  context: "  ",
};

/** Lines rendered before the reader has to ask for more. */
const DIFF_PAGE = 400;

/**
 * The lines of one diff.
 *
 * Memoised and paged, because this is where the DOM node count explodes: a
 * thousand-line diff is two thousand elements, and rebuilding them on an
 * unrelated state change is what makes the window stutter. Only the first page
 * is built up front — enough to fill several screens — and the rest is one
 * click away.
 */
export const DiffView = memo(function DiffView({ lines }: { lines: DiffLine[] }) {
  const [shown, setShown] = useState(DIFF_PAGE);

  if (lines.length === 0) {
    return (
      <p className="border-t border-line-soft bg-ground/60 px-4 py-3 text-[12.5px] text-faint">
        No line-level changes to show for this file.
      </p>
    );
  }

  const visible = lines.length > shown ? lines.slice(0, shown) : lines;
  const remaining = lines.length - visible.length;

  return (
    <div className="border-t border-line-soft bg-ground/60">
      <div className="overflow-x-auto py-2 font-mono text-xs leading-[1.65]">
        {visible.map((line, i) => (
          <div
            key={i}
            className={`diff-line-skip grid grid-cols-[44px_1fr] whitespace-pre ${LINE_STYLE[line.kind]}`}
          >
            <span className="select-none pr-3 text-right tabular-nums text-faint">
              {line.lineNumber ?? ""}
            </span>
            <span className="pr-4">
              {LINE_PREFIX[line.kind]}
              {line.content}
            </span>
          </div>
        ))}
      </div>

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setShown((current) => current + DIFF_PAGE * 2)}
          className="w-full border-t border-line-soft px-4 py-[7px] text-[12.5px] text-muted transition-colors hover:bg-surface-alt hover:text-content"
        >
          Show {Math.min(remaining, DIFF_PAGE * 2).toLocaleString()} more{" "}
          {remaining === 1 ? "line" : "lines"} — {remaining.toLocaleString()} hidden
        </button>
      )}
    </div>
  );
});
