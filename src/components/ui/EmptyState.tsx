import type { ReactNode } from "react";

/**
 * What a screen shows when it has nothing to show.
 *
 * Always says what would put something here, because an empty list with no
 * explanation reads as a broken app to someone new to Git.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-[64px] text-center">
      {icon && (
        <span className="mb-2 grid h-12 w-12 place-items-center rounded-full border border-line-soft bg-surface-alt text-faint">
          {icon}
        </span>
      )}
      <div className="display text-[16px] font-semibold">{title}</div>
      <p className="max-w-[46ch] text-[13.5px] leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** A card wrapper matching the settings-row surface, for list items. */
export function Card({
  children,
  className = "",
  selected = false,
}: {
  children: ReactNode;
  className?: string;
  selected?: boolean;
}) {
  return (
    <div className={`settings-row ${className}`} data-selected={selected || undefined}>
      {children}
    </div>
  );
}
