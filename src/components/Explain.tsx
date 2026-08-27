import { useState, type ReactNode } from "react";
import { TERMS, type TermKey } from "@/copy/terms";
import { TerminalIcon } from "./Icons";

/**
 * The app's answer to "what does that word mean?".
 *
 * GitEasy uses real Git vocabulary everywhere, which is only defensible if no
 * term is ever left unexplained. Any word that came from Git gets one of
 * these next to it: hover or focus, and the definition appears — plus the
 * actual command, for the user who wants to graduate to the terminal.
 *
 * Rendered as a plain button rather than `title=""` so it works on touch, can
 * be reached by keyboard, and can carry the command line.
 */
export function Explain({
  term,
  align = "left",
}: {
  term: TermKey;
  /** Flip to `right` near the edge of a panel so the card stays on screen. */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const entry = TERMS[term];

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`What does "${entry.label}" mean?`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="grid h-[15px] w-[15px] flex-none place-items-center rounded-full border border-line-soft text-[10px] font-semibold leading-none text-faint transition-colors hover:border-accent hover:text-accent"
      >
        ?
      </button>

      {open && (
        <span
          role="tooltip"
          className={`absolute bottom-full z-40 mb-2 w-[280px] animate-fade-in rounded-lg border border-line bg-surface p-[13px] text-left shadow-2xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <span className="block text-[13px] font-semibold text-content">{entry.label}</span>
          <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">
            {entry.detail}
          </span>
          <span className="mt-[10px] flex items-center gap-[6px] rounded-[5px] border border-line-soft bg-ground px-2 py-[5px]">
            <TerminalIcon className="h-3 w-3 flex-none text-faint" />
            <span className="truncate font-mono text-[11.5px] text-muted">{entry.command}</span>
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * A Git term written out properly: the real word, its plain meaning, and the
 * explainer. Used in headings and next to the buttons that do the thing.
 */
export function TermHeading({
  term,
  children,
}: {
  term: TermKey;
  /** Overrides the label when the sentence needs different wording. */
  children?: ReactNode;
}) {
  const entry = TERMS[term];
  return (
    <span className="inline-flex items-center gap-[6px]">
      <span>{children ?? entry.label}</span>
      <Explain term={term} />
    </span>
  );
}

/** The one-line plain meaning on its own, for use under a button or title. */
export function PlainMeaning({ term }: { term: TermKey }) {
  return <span className="text-[12.5px] text-muted">{TERMS[term].plain}</span>;
}
