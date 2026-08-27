import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Shared stroke geometry for every icon in the set. */
function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8.5Z" />
    </Icon>
  );
}

export function ChangesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 4v16M18 4v16M6 9h12M6 15h12" />
    </Icon>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.9 6.1l-1.4 1.4M7.5 16.5l-1.4 1.4M17.9 17.9l-1.4-1.4M7.5 7.5 6.1 6.1" />
    </Icon>
  );
}

export function BranchIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.8}>
      <circle cx="7" cy="6" r="2.2" />
      <circle cx="7" cy="18" r="2.2" />
      <circle cx="17" cy="8" r="2.2" />
      <path d="M7 8.2v7.6M17 10.2c0 3-3 3.4-6 3.8" />
    </Icon>
  );
}

export function RepoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18v18H6.5A1.5 1.5 0 0 1 5 19.5v-15Z" />
      <path d="M5 17h13" />
    </Icon>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h3.6l1.8 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </Icon>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.6}>
      <path d="M12 4.5 13.4 9l4.6 1.4-4.6 1.4L12 16.4l-1.4-4.6L6 10.4 10.6 9 12 4.5Z" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L19 9a2 2 0 0 0-2.8-2.8L5 17v3Z" />
    </Icon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4h-4" />
    </Icon>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.8}>
      <path d="M12 5v13M7 13.5l5 5 5-5" />
    </Icon>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.8}>
      <path d="M12 19V6M7 10.5l5-5 5 5" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={2.2}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={2}>
      <path d="m9 5 7 7-7 7" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={2}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 5h5v5M19 5l-8 8" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.8}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.8}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </Icon>
  );
}

export function PaletteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3a9 9 0 1 0 0 18c.8 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8Z" />
      <circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.8}>
      <path d="M12 4.5 21 19.5H3L12 4.5Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M8 4v5h7V4M8 15h8" />
    </Icon>
  );
}

export function CloudUploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 18a4 4 0 0 1-.6-7.95 5.5 5.5 0 0 1 10.7-1.6A4.25 4.25 0 0 1 17.5 18" />
      <path d="M12 21v-8M9 15.5l3-3 3 3" />
    </Icon>
  );
}

/**
 * The GitEasy mark: one commit branching into two.
 *
 * Drawn as vector rather than scaled from the source PNG so it stays sharp at
 * every size it appears at — 15px in a settings row, 36px on the welcome
 * screen — and inherits `currentColor`, which is what lets it sit correctly in
 * all fourteen palettes across light and dark.
 *
 * Geometry traced from the brand artwork in `assets/brand/wordmark.png`,
 * normalised so the mark is optically centred in the box.
 */
/**
 * The mark's paths, shared by the themed logo and the full-colour brand tile.
 *
 * Coordinates are the artwork's own geometry mapped into a 24 box: the node
 * centres and radii, the stroke weight and the fork position are all measured
 * from `assets/brand/wordmark.png` rather than eyeballed, so the vector is the
 * same shape as the source at any size.
 */
function MarkPaths({ colour }: { colour: string }) {
  return (
    <>
      {/* Stem down from the parent commit, then two arms to the children. */}
      <path
        d="M12 8.2v7.8"
        stroke={colour}
        strokeWidth={2.27}
        strokeLinecap="round"
      />
      <path
        d="M12 15.96c0 2.4-2.6 2.5-5.35 3.9M12 15.96c0 2.4 2.6 2.5 5.35 3.9"
        stroke={colour}
        strokeWidth={2.27}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="12" cy="4.95" r="3.27" fill={colour} />
      <circle cx="4.3" cy="19.87" r="2.45" fill={colour} />
      <circle cx="19.7" cy="19.87" r="2.45" fill={colour} />
    </>
  );
}

export function GitEasyLogo(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <MarkPaths colour="currentColor" />
    </svg>
  );
}

/**
 * The full-colour brand mark — gradient tile plus the white glyph.
 *
 * Used where GitEasy is introducing itself (onboarding, the connect screen)
 * rather than acting as a piece of interface furniture. Everywhere else uses
 * `GitEasyLogo`, which takes the surrounding text colour.
 *
 * The gradient id is derived from a module-level counter so two marks on the
 * same page cannot collide on it.
 */
let markInstance = 0;

export function GitEasyMark({ className = "" }: { className?: string }) {
  const id = `giteasy-mark-${(markInstance += 1)}`;

  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7868EC" />
          <stop offset="100%" stopColor="#4F40CA" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="9.85" fill={`url(#${id})`} />
      {/* The mark is centred in its own 24 box, so this scales it about the
          tile's centre to fill half the width — the same glyph-to-tile ratio as
          the source artwork. */}
      <g transform="translate(10.047 10.047) scale(1.1628)">
        <MarkPaths colour="#fff" />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Added for the wider feature set                                             */
/* -------------------------------------------------------------------------- */

export function GitHubIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.51 2.87 8.34 6.84 9.69.5.1.68-.22.68-.49l-.01-1.9c-2.78.62-3.37-1.2-3.37-1.2-.46-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.34 1.12 2.91.86.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5.01 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.35 4.79-4.58 5.05.36.32.68.94.68 1.9l-.01 2.82c0 .27.18.6.69.49A10.03 10.03 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

export function PullRequestIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="6.5" cy="5.5" r="2.2" />
      <circle cx="6.5" cy="18.5" r="2.2" />
      <circle cx="17.5" cy="18.5" r="2.2" />
      <path d="M6.5 7.7v8.6M17.5 16.3V10a2.5 2.5 0 0 0-2.5-2.5h-3.4" />
      <path d="m13.4 5.3-2.2 2.2 2.2 2.2" />
    </Icon>
  );
}

export function IssueIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.4" />
    </Icon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10.2 9.2 15 12l-4.8 2.8V9.2Z" fill="currentColor" />
    </Icon>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11.6 3H20a1 1 0 0 1 1 1v8.4a1 1 0 0 1-.3.7l-7.6 7.6a1 1 0 0 1-1.4 0l-8.4-8.4a1 1 0 0 1 0-1.4l7.6-7.6a1 1 0 0 1 .7-.3Z" />
      <circle cx="16.4" cy="7.6" r="1.3" />
    </Icon>
  );
}

export function BoxIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 20 7v10l-8 4-8-4V7l8-4Z" />
      <path d="M4 7l8 4 8-4M12 11v10" />
    </Icon>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />
    </Icon>
  );
}

export function ArchiveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 7h18v3H3zM5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
      <path d="M10 14h4" />
    </Icon>
  );
}

export function SyncIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.8}>
      <path d="M4 11a8 8 0 0 1 13.3-5.9L20 7.5" />
      <path d="M20 3.5v4h-4" />
      <path d="M20 13a8 8 0 0 1-13.3 5.9L4 16.5" />
      <path d="M4 20.5v-4h4" />
    </Icon>
  );
}

export function MergeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="5.5" r="2.2" />
      <circle cx="7" cy="18.5" r="2.2" />
      <circle cx="17" cy="12" r="2.2" />
      <path d="M7 7.7v8.6M7 10.5c0 2.5 3 3.5 7.8 3.5" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7M10 11v5M14 11v5" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={2}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}

export function CircleSlashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6.5 17.5 11-11" />
    </Icon>
  );
}

export function DotIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9h10a5 5 0 0 1 0 10h-4" />
      <path d="M8 5 4 9l4 4" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="11" height="11" rx="1.6" />
      <path d="M15 6.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h1.5" />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 19 6v6c0 4-3 7.2-7 8.5-4-1.3-7-4.5-7-8.5V6l7-2.5Z" />
      <path d="m9.3 12 1.9 1.9 3.5-3.6" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Icon>
  );
}

export function KeyboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M8.5 13.5h7" />
    </Icon>
  );
}

export function TerminalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="m7.5 10 2.5 2-2.5 2M13 14h4" />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v10M8 10.5l4 4 4-4" />
      <path d="M5 18.5h14" />
    </Icon>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.7l5.4-.8L12 4Z" />
    </Icon>
  );
}

export function ForkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="6.5" cy="5.5" r="2.2" />
      <circle cx="17.5" cy="5.5" r="2.2" />
      <circle cx="12" cy="18.5" r="2.2" />
      <path d="M6.5 7.7v1.8a2.5 2.5 0 0 0 2.5 2.5h6a2.5 2.5 0 0 0 2.5-2.5V7.7M12 12v4.3" />
    </Icon>
  );
}
