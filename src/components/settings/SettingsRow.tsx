import type { ReactNode } from "react";
import { ChevronRightIcon } from "../Icons";

interface SettingsRowProps {
  /** Left-hand visual — a theme colour circle or an icon. */
  leading: ReactNode;
  title: string;
  subtitle?: string;
  /** Right-hand content shown before the chevron. */
  trailing?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  /** Rows that only display information hide the chevron. */
  interactive?: boolean;
}

/**
 * A Windows 11 settings row: raised card, icon, title over a sub-label, and a
 * chevron on the right. Used for every list in Settings.
 */
export function SettingsRow({
  leading,
  title,
  subtitle,
  trailing,
  selected = false,
  onClick,
  interactive = true,
}: SettingsRowProps) {
  const content = (
    <>
      <span className="flex-none">{leading}</span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-medium text-content">{title}</span>
        {subtitle && (
          <span className="mt-[2px] block truncate text-[14px] text-muted">{subtitle}</span>
        )}
      </span>

      {trailing}

      {interactive && <ChevronRightIcon className="h-[18px] w-[18px] flex-none text-faint" />}
    </>
  );

  if (!onClick) {
    return (
      <div className="settings-row" data-selected={selected}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-selected={selected}
      aria-pressed={selected}
      className="settings-row"
    >
      {content}
    </button>
  );
}
