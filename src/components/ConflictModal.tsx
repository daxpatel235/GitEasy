import { useState } from "react";
import { Button } from "./Button";
import { Modal } from "./ui/Modal";
import { Badge } from "./ui/Badge";
import { Explain } from "./Explain";
import { CheckIcon, RefreshIcon, SparkleIcon, WarningIcon } from "./Icons";
import type { Conflict } from "@/types/git";

interface ConflictModalProps {
  conflicts: Conflict[];
  busy: boolean;
  onResolve: (path: string, keep: "mine" | "theirs") => void;
  onFinish: () => void;
  onCancel: () => void;
  /** Abandon the merge and put the branch back as it was. */
  onAbort?: () => void;
  /** Ask for a plain-English explanation of one conflict. Optional. */
  onExplain?: (path: string) => Promise<string>;
}

/**
 * The screen that decides whether someone keeps using Git.
 *
 * A raw conflict is a file full of `<<<<<<<` markers and no instructions,
 * which is where most beginners give up and re-clone the repository. Here the
 * two versions sit side by side, "mine" and "theirs" are spelled out in terms
 * of who wrote them, and the choice is a button rather than manual editing.
 */
export function ConflictModal({
  conflicts,
  busy,
  onResolve,
  onFinish,
  onCancel,
  onAbort,
  onExplain,
}: ConflictModalProps) {
  const [index, setIndex] = useState(0);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);

  const conflict = conflicts[index];
  const resolved = conflicts.filter((c) => c.choice !== null).length;
  const allResolved = resolved === conflicts.length;

  if (!conflict) return null;

  function choose(keep: "mine" | "theirs") {
    onResolve(conflict!.path, keep);
    // Move to the next undecided file so the user is never left hunting.
    const next = conflicts.findIndex((c, i) => i > index && c.choice === null);
    if (next !== -1) {
      setIndex(next);
      setExplanation(null);
    }
  }

  function show(next: number) {
    setIndex(next);
    setExplanation(null);
  }

  async function explain() {
    if (!onExplain) return;
    setExplaining(true);
    try {
      setExplanation(await onExplain(conflict!.path));
    } catch {
      setExplanation(
        "The explanation could not be fetched. The two versions above are still the whole story — pick whichever matches what you meant to do.",
      );
    } finally {
      setExplaining(false);
    }
  }

  return (
    <Modal
      title="Two versions of the same lines"
      tone="danger"
      icon={<WarningIcon className="h-6 w-6" />}
      busy={busy}
      onClose={onCancel}
      width="lg"
      subtitle={
        <>
          Somebody changed the same lines you did, so Git stopped rather than guess. Pick which
          version to keep for each file — this is normal, and every developer does it.{" "}
          <Explain term="conflict" />
        </>
      }
      footer={
        <>
          <Button onClick={onCancel} disabled={busy} className="flex-1">
            Decide later
          </Button>
          {onAbort && (
            <Button variant="danger" onClick={onAbort} disabled={busy} className="flex-1">
              Stop the merge
            </Button>
          )}
          <Button
            variant="primary"
            className="flex-[1.4]"
            disabled={!allResolved || busy}
            onClick={onFinish}
          >
            {busy
              ? "Finishing…"
              : allResolved
                ? "Done — finish the merge"
                : `${conflicts.length - resolved} still to decide`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* File switcher, showing progress through the set. */}
        {conflicts.length > 1 && (
          <div className="flex flex-wrap gap-[5px]">
            {conflicts.map((c, i) => (
              <button
                key={c.path}
                type="button"
                onClick={() => show(i)}
                className={`inline-flex items-center gap-[5px] rounded-md border px-[9px] py-[5px] font-mono text-[12px] transition-colors ${
                  i === index
                    ? "border-accent bg-accent/12 text-accent"
                    : "border-line-soft text-muted hover:border-line"
                }`}
              >
                {c.choice !== null && <CheckIcon className="h-[11px] w-[11px] text-added" />}
                {c.path.split("/").at(-1)}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px]">{conflict.path}</span>
          {conflict.choice !== null && (
            <Badge tone="success">
              Keeping {conflict.choice === "mine" ? "your version" : "their version"}
            </Badge>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Side
            title="Your version"
            note="What you changed on this branch"
            lines={conflict.mine}
            tone="mine"
            chosen={conflict.choice === "mine"}
            onChoose={() => choose("mine")}
            disabled={busy}
          />
          <Side
            title="Their version"
            note="What arrived from the other branch"
            lines={conflict.theirs}
            tone="theirs"
            chosen={conflict.choice === "theirs"}
            onChoose={() => choose("theirs")}
            disabled={busy}
          />
        </div>

        {/* Optional, and off unless the app has been given a key. */}
        {onExplain && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void explain()}
              disabled={busy || explaining}
              className="inline-flex w-fit items-center gap-[6px] rounded-md border border-line-soft px-[10px] py-[6px] text-[12.5px] text-muted transition-colors hover:border-line hover:text-content disabled:opacity-60"
            >
              {explaining ? (
                <RefreshIcon className="h-[13px] w-[13px] animate-spin" />
              ) : (
                <SparkleIcon className="h-[13px] w-[13px]" />
              )}
              {explaining ? "Reading both versions…" : "Explain the difference"}
            </button>

            {explanation && (
              <p className="rounded-lg bg-surface-alt/50 px-3 py-[10px] text-[12.5px] leading-relaxed text-muted">
                {explanation}
              </p>
            )}
          </div>
        )}

        <p className="text-[12.5px] leading-relaxed text-muted">
          Need parts of both? Pick either side here to get moving, then edit the file in your
          editor — it will show up as a normal change you can commit.
        </p>
      </div>
    </Modal>
  );
}

function Side({
  title,
  note,
  lines,
  tone,
  chosen,
  onChoose,
  disabled,
}: {
  title: string;
  note: string;
  lines: string[];
  tone: "mine" | "theirs";
  chosen: boolean;
  onChoose: () => void;
  disabled: boolean;
}) {
  // Static class pairs — Tailwind cannot see a class name built at runtime.
  const chosenBorder = tone === "mine" ? "border-added" : "border-modified";

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border transition-colors ${
        chosen ? chosenBorder : "border-line"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-line-soft bg-surface-alt px-3 py-2">
        <span className="text-[13px] font-semibold">{title}</span>
        <span className="text-[11.5px] text-faint">{note}</span>
      </div>

      <div className="max-h-[180px] flex-1 overflow-auto bg-ground/60 py-2 font-mono text-[12px] leading-[1.7]">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`whitespace-pre px-3 ${
              tone === "mine" ? "bg-added/8 text-added" : "bg-modified/8 text-modified"
            }`}
          >
            {line}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onChoose}
        disabled={disabled}
        className={`border-t border-line-soft px-3 py-[9px] text-[13px] font-medium transition-colors disabled:opacity-50 ${
          chosen ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface-alt hover:text-content"
        }`}
      >
        {chosen ? "Keeping this one" : "Keep this one"}
      </button>
    </div>
  );
}
