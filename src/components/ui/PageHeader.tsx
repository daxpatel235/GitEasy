import type { ReactNode } from "react";

/**
 * The heading every screen opens with.
 *
 * Title, one plain-English sentence saying what the screen is for, and space
 * on the right for the screen's primary action. Keeping this in one component
 * is what stops twelve views drifting into twelve different layouts.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  actions?: ReactNode;
  /** Filter tabs and the like, shown under the divider. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-line-soft pb-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="display text-[26px] font-semibold leading-tight">{title}</h1>
          <p className="mt-[6px] max-w-[62ch] text-[14px] leading-relaxed text-muted">
            {subtitle}
          </p>
        </div>
        {actions && <div className="flex flex-none items-center gap-2 pt-1">{actions}</div>}
      </div>

      {children}
    </div>
  );
}

/** Horizontal filter tabs with counts, used by the list screens. */
export function FilterTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-[7px] rounded-md px-[11px] py-[6px] text-[13.5px] transition-colors ${
              selected
                ? "bg-surface-alt font-medium text-content"
                : "text-muted hover:bg-surface-alt/60 hover:text-content"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`rounded-full px-[6px] py-[1px] font-mono text-2xs tabular-nums ${
                  selected ? "bg-accent/15 text-accent" : "bg-line/60 text-faint"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
