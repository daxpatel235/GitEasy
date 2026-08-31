import { useEffect, useRef, useState } from "react";
import { PencilIcon, RefreshIcon, SparkleIcon } from "./Icons";
import { Explain } from "./Explain";

/**
 * Conventional Commits, which most teams either require outright or expect.
 *
 * Offered as a row of chips rather than a rule, so someone who has never heard
 * of the convention still writes a message their team can read.
 */
const TYPES = [
  { prefix: "feat", label: "Feature", hint: "Something new" },
  { prefix: "fix", label: "Fix", hint: "A bug is repaired" },
  { prefix: "refactor", label: "Tidy-up", hint: "Same behaviour, better code" },
  { prefix: "docs", label: "Docs", hint: "Documentation only" },
  { prefix: "test", label: "Tests", hint: "Adding or fixing tests" },
  { prefix: "chore", label: "Chore", hint: "Dependencies, config, tooling" },
] as const;

interface CommitBoxProps {
  message: string;
  explanation: string;
  description: string;
  onMessageChange: (message: string) => void;
  onDescriptionChange: (description: string) => void;
  onRegenerate: () => void;
  regenerating: boolean;
  /** How many messages were suggested for these changes, including this one. */
  suggestionCount?: number;
  /** Which of them is showing, zero-based. */
  suggestionIndex?: number;
}

export function CommitBox({
  message,
  explanation,
  description,
  onMessageChange,
  onDescriptionChange,
  onRegenerate,
  regenerating,
  suggestionCount = 0,
  suggestionIndex = 0,
}: CommitBoxProps) {
  const [editing, setEditing] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Grow the field to fit its content instead of scrolling inside it.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [message]);

  function toggleEdit() {
    const next = !editing;
    setEditing(next);
    if (next) {
      requestAnimationFrame(() => {
        const el = textarea.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    }
  }

  /** Swap the prefix without disturbing what the user already wrote. */
  function applyType(prefix: string) {
    const body = message.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, "");
    onMessageChange(`${prefix}: ${body}`);
  }

  const activeType = TYPES.find((t) => message.startsWith(`${t.prefix}:`))?.prefix;
  const subjectLength = message.length;

  return (
    <section className="flex flex-col gap-[10px] rounded-card border border-line bg-surface/60 px-[14px] py-3">
      <div className="flex items-center gap-[7px]">
        <SparkleIcon className="h-[13px] w-[13px] text-accent" />
        <span className="text-2xs font-semibold uppercase tracking-[0.07em] text-faint">
          Commit message
        </span>
        <Explain term="commit" />
        <span className="ml-auto font-mono text-2xs tabular-nums text-faint">
          <span className={subjectLength > 72 ? "text-modified" : ""}>{subjectLength}</span>/72
        </span>
      </div>

      <div className="flex flex-wrap gap-[5px]">
        {TYPES.map((type) => (
          <button
            key={type.prefix}
            type="button"
            title={type.hint}
            onClick={() => applyType(type.prefix)}
            className={`rounded-full border px-[9px] py-[2px] font-mono text-2xs transition-colors ${
              activeType === type.prefix
                ? "border-accent bg-accent/15 text-accent"
                : "border-line-soft text-faint hover:border-line hover:text-muted"
            }`}
          >
            {type.prefix}
          </button>
        ))}
      </div>

      <textarea
        ref={textarea}
        value={message}
        readOnly={!editing}
        onChange={(e) => onMessageChange(e.target.value)}
        rows={1}
        placeholder="What did you change, and why?"
        aria-label="Commit message"
        className={`-mx-[6px] w-[calc(100%+12px)] resize-none overflow-hidden rounded border px-[6px] py-1 font-mono text-[13px] leading-[1.5] transition-colors placeholder:text-faint ${
          editing ? "border-accent bg-ground outline-none" : "border-transparent bg-transparent"
        }`}
      />

      {explanation && !editing && (
        <p className="max-w-[60ch] text-[12.5px] text-muted">{explanation}</p>
      )}

      {showDescription && (
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={3}
          placeholder="Longer description — why this change, anything a reviewer should know…"
          aria-label="Extended description"
          className="w-full resize-y rounded border border-line bg-ground px-[8px] py-[6px] text-[12.5px] leading-relaxed placeholder:text-faint focus:border-accent focus:outline-none"
        />
      )}

      <div className="flex flex-wrap gap-[6px]">
        <MiniButton onClick={toggleEdit} icon={<PencilIcon className="h-3 w-3" />}>
          {editing ? "Done" : "Edit"}
        </MiniButton>

        <MiniButton
          onClick={onRegenerate}
          disabled={regenerating}
          icon={<RefreshIcon className={`h-3 w-3 ${regenerating ? "animate-spin" : ""}`} />}
        >
          Suggest another
          {suggestionCount > 1 && (
            <span className="font-mono text-2xs tabular-nums text-faint">
              {suggestionIndex + 1}/{suggestionCount}
            </span>
          )}
        </MiniButton>

        <MiniButton
          onClick={() => setShowDescription((v) => !v)}
          icon={<span className="font-mono text-[11px] leading-none">¶</span>}
        >
          {showDescription ? "Hide description" : "Add description"}
        </MiniButton>
      </div>
    </section>
  );
}

function MiniButton({
  children,
  icon,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-[5px] rounded-[5px] border border-line px-[9px] py-1 text-xs text-muted transition-colors hover:bg-surface-alt hover:text-content disabled:opacity-50 disabled:hover:bg-transparent"
    >
      {icon}
      {children}
    </button>
  );
}
