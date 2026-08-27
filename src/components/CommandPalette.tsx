import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "./Icons";

export interface Command {
  id: string;
  label: string;
  /** Plain-English description of what it will do. */
  hint?: string;
  group: string;
  icon?: React.ReactNode;
  /** Extra words to match on, so "upload" finds Push. */
  keywords?: string;
  disabled?: boolean;
  run: () => void;
}

/**
 * Everything the app can do, one keystroke away.
 *
 * Two audiences, one component: a developer types three letters and hits
 * enter, while a beginner opens it to browse what is even possible — which is
 * why every entry carries a plain-English hint rather than just a verb.
 */
export function CommandPalette({
  commands,
  onClose,
}: {
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.hint ?? ""} ${c.group} ${c.keywords ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [commands, query]);

  // Reset the cursor whenever the result set changes under it.
  useEffect(() => setActive(0), [query]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, matches.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const chosen = matches[active];
        if (chosen && !chosen.disabled) {
          onClose();
          chosen.run();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [matches, active, onClose]);

  // Group headings, preserving the order the commands were declared in.
  const grouped = useMemo(() => {
    const out: { group: string; items: { command: Command; index: number }[] }[] = [];
    matches.forEach((command, index) => {
      const last = out.at(-1);
      if (last && last.group === command.group) last.items.push({ command, index });
      else out.push({ group: command.group, items: [{ command, index }] });
    });
    return out;
  }, [matches]);

  return (
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in justify-center bg-black/50 p-6 pt-[12vh] backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="flex h-fit max-h-[70vh] w-full max-w-[560px] animate-scale-in flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
      >
        <div className="flex flex-none items-center gap-[10px] border-b border-line px-4">
          <SearchIcon className="h-[17px] w-[17px] flex-none text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to do?"
            aria-label="Search commands"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="flex-1 bg-transparent py-[14px] text-[15px] placeholder:text-faint focus:outline-none"
          />
          <kbd className="flex-none rounded border border-line-soft px-[6px] py-[2px] font-mono text-2xs text-faint">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {matches.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13.5px] text-muted">
              Nothing matches “{query}”.
            </p>
          ) : (
            grouped.map(({ group, items }) => (
              <div key={group} className="mb-1">
                <div className="px-3 py-[6px] text-2xs font-semibold uppercase tracking-[0.08em] text-faint">
                  {group}
                </div>
                {items.map(({ command, index }) => (
                  <button
                    key={command.id}
                    type="button"
                    data-index={index}
                    disabled={command.disabled}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => {
                      onClose();
                      command.run();
                    }}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-[9px] text-left transition-colors disabled:opacity-40 ${
                      index === active ? "bg-accent/12" : ""
                    }`}
                  >
                    {command.icon && (
                      <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-md border border-line-soft bg-surface-alt text-muted">
                        {command.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">
                        {command.label}
                      </span>
                      {command.hint && (
                        <span className="mt-[1px] block truncate text-[12.5px] text-muted">
                          {command.hint}
                        </span>
                      )}
                    </span>
                    {index === active && (
                      <kbd className="flex-none rounded border border-line-soft px-[6px] py-[2px] font-mono text-2xs text-faint">
                        ↵
                      </kbd>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
