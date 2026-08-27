import { useState } from "react";
import { Button } from "./Button";
import { Modal } from "./ui/Modal";
import { Badge } from "./ui/Badge";
import { Explain } from "./Explain";
import { DiffView } from "./FileList";
import { ChevronRightIcon, CloudUploadIcon, ShieldIcon } from "./Icons";
import { STATUS_LETTER, type FileStatus, type LocalSave } from "@/types/git";

const STATUS_COLOR: Record<FileStatus, string> = {
  modified: "text-modified",
  added: "text-added",
  deleted: "text-deleted",
  renamed: "text-modified",
  untracked: "text-faint",
  conflicted: "text-deleted",
};

interface PushModalProps {
  saves: LocalSave[];
  repoName: string;
  branch: string;
  /** Set when the branch is protected on GitHub — a pull request is required. */
  branchProtected: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation for the one step that leaves the machine.
 *
 * Everything behind it is blurred so the decision has the user's full
 * attention, and every file can be opened in place to read the actual lines
 * before they become public.
 */
export function PushModal({
  saves,
  repoName,
  branch,
  branchProtected,
  busy,
  onCancel,
  onConfirm,
}: PushModalProps) {
  const [openFile, setOpenFile] = useState<string | null>(null);

  const fileCount = saves.reduce((total, save) => total + save.files.length, 0);

  return (
    <Modal
      title="Push to GitHub?"
      tone="warn"
      icon={<CloudUploadIcon className="h-6 w-6" />}
      busy={busy}
      onClose={onCancel}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-x-1">
          This uploads {saves.length} {saves.length === 1 ? "commit" : "commits"} (
          {fileCount} {fileCount === 1 ? "file" : "files"}) to{" "}
          <span className="font-medium text-content">{repoName}</span> on{" "}
          <span className="font-mono text-[13px] text-content">{branch}</span>. Anyone with
          access to the project will be able to see it.
          <Explain term="push" />
        </span>
      }
      footer={
        <>
          <Button onClick={onCancel} disabled={busy} className="flex-1">
            Not yet
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={busy}
            data-autofocus
            className="flex-[1.4]"
          >
            {busy ? "Pushing…" : "Yes, push"}
          </Button>
        </>
      }
    >
      {branchProtected && (
        <div className="flex items-start gap-3 rounded-card border border-modified/40 bg-modified/10 px-3 py-[10px]">
          <ShieldIcon className="mt-[1px] h-[17px] w-[17px] flex-none text-modified" />
          <p className="text-[13px] leading-relaxed text-muted">
            <span className="font-medium text-content">{branch}</span> is protected. GitHub will
            refuse a direct push — open a pull request instead so someone can review the change
            first.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-semibold uppercase tracking-[0.07em] text-faint">
            What gets sent
          </span>
          <span className="text-[13px] text-faint">Click a file to read the changes</span>
        </div>

        <div className="max-h-[320px] overflow-y-auto rounded-lg border border-line">
          {saves.map((save, saveIndex) => (
            <div key={save.id}>
              <div
                className={`flex items-center gap-2 bg-surface-alt px-4 py-2 ${
                  saveIndex > 0 ? "border-t border-line" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[13px] text-content">
                    {save.message}
                  </div>
                  <div className="mt-[2px] text-[12px] text-faint">
                    {save.files.length} {save.files.length === 1 ? "file" : "files"}
                  </div>
                </div>
                <Badge tone="warn">Not on GitHub yet</Badge>
              </div>

              {save.files.map((file) => {
                const key = `${save.id}:${file.path}`;
                const open = openFile === key;

                return (
                  <div key={key} className="border-t border-line-soft">
                    <button
                      type="button"
                      onClick={() => setOpenFile(open ? null : key)}
                      aria-expanded={open}
                      className={`flex w-full items-center gap-3 px-4 py-[10px] text-left transition-colors hover:bg-surface-alt ${
                        open ? "bg-surface-alt" : ""
                      }`}
                    >
                      <span
                        className={`w-[14px] flex-none text-center font-mono text-[14px] font-medium ${STATUS_COLOR[file.status]}`}
                      >
                        {STATUS_LETTER[file.status]}
                      </span>

                      <span className="min-w-0 flex-1 truncate font-mono text-[13.5px]">
                        {file.path}
                      </span>

                      <span className="flex-none font-mono text-[12px] tabular-nums text-faint">
                        {file.additions > 0 && <span className="text-added">+{file.additions}</span>}
                        {file.deletions > 0 && (
                          <span className="text-deleted"> −{file.deletions}</span>
                        )}
                      </span>

                      <ChevronRightIcon
                        className={`h-4 w-4 flex-none text-faint transition-transform duration-150 ${
                          open ? "rotate-90" : ""
                        }`}
                      />
                    </button>

                    {open && <DiffView lines={file.diff} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
