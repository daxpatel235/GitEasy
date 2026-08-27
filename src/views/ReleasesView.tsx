import { useState } from "react";
import { Button } from "@/components/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs, PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { TextArea, TextField } from "@/components/ui/Field";
import { Explain, TermHeading } from "@/components/Explain";
import {
  BoxIcon,
  DownloadIcon,
  ExternalLinkIcon,
  PlusIcon,
  TagIcon,
} from "@/components/Icons";
import { timeAgo } from "@/lib/time";
import type { Tag } from "@/types/git";
import type { Release } from "@/types/github";

type Section = "releases" | "tags";

interface ReleasesViewProps {
  releases: Release[];
  tags: Tag[];
  loading: boolean;
  busy: boolean;
  onCreateTag: (name: string, message: string) => void;
  onOpenUrl: (url: string) => void;
}

/**
 * Tags and releases together, because the difference between them is exactly
 * what confuses people: a tag is a name for a commit on your computer, and a
 * release is what GitHub builds on top of one so users have something to
 * download. Showing both in one place makes the relationship visible.
 */
export function ReleasesView({
  releases,
  tags,
  loading,
  busy,
  onCreateTag,
  onOpenUrl,
}: ReleasesViewProps) {
  const [section, setSection] = useState<Section>("releases");
  const [tagging, setTagging] = useState(false);

  const suggested = suggestNextVersion(tags);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Releases"
        subtitle={
          <>
            A tag is a permanent name for one commit — usually a version number. A release wraps
            a tag with notes so people have something to install rather than a hash to guess at.{" "}
            <Explain term="tag" />
          </>
        }
        actions={
          <Button variant="primary" onClick={() => setTagging(true)}>
            <PlusIcon className="h-[15px] w-[15px]" />
            New tag
          </Button>
        }
      >
        <FilterTabs
          active={section}
          onChange={setSection}
          tabs={[
            { id: "releases", label: "Published releases", count: releases.length },
            { id: "tags", label: "Tags", count: tags.length },
          ]}
        />
      </PageHeader>

      {loading ? (
        <p className="py-12 text-center text-[13.5px] text-muted">Loading…</p>
      ) : section === "releases" ? (
        releases.length === 0 ? (
          <EmptyState
            icon={<BoxIcon className="h-6 w-6" />}
            title="No releases yet"
            body="When a version is ready to hand to people, tag it and publish a release. GitHub builds a download page from it automatically."
          />
        ) : (
          <div className="flex flex-col gap-[6px]">
            {releases.map((release) => (
              <ReleaseRow
                key={release.tag}
                release={release}
                onOpen={() => onOpenUrl(release.url)}
              />
            ))}
          </div>
        )
      ) : tags.length === 0 ? (
        <EmptyState
          icon={<TagIcon className="h-6 w-6" />}
          title="No tags yet"
          body="Tags mark a specific commit with a name that never moves. Most projects tag every version they ship."
          action={
            <Button variant="primary" onClick={() => setTagging(true)}>
              <PlusIcon className="h-[15px] w-[15px]" />
              New tag
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-[6px]">
          {tags.map((tag) => (
            <div key={tag.name} className="settings-row">
              <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg border border-line-soft bg-surface-alt text-muted">
                <TagIcon className="h-[15px] w-[15px]" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13.5px] font-medium">{tag.name}</span>
                  {!tag.isPublished && <Badge tone="warn">Not pushed</Badge>}
                </span>
                <span className="mt-[2px] flex flex-wrap items-center gap-x-2 text-[12.5px] text-faint">
                  <span className="truncate">{tag.message}</span>
                  <span>·</span>
                  <span className="font-mono text-[11.5px]">{tag.commitHash}</span>
                  <span>·</span>
                  <span>{timeAgo(tag.at)}</span>
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {tagging && (
        <NewTagModal
          suggested={suggested}
          busy={busy}
          onCancel={() => setTagging(false)}
          onCreate={(name, message) => {
            onCreateTag(name, message);
            setTagging(false);
          }}
        />
      )}
    </div>
  );
}

function ReleaseRow({ release, onOpen }: { release: Release; onOpen: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line/70 bg-surface/50 p-4">
      <div className="flex items-start gap-3">
        <span
          className={`grid h-[34px] w-[34px] flex-none place-items-center rounded-lg border border-line-soft ${
            release.isLatest ? "bg-added/12 text-added" : "bg-surface-alt text-muted"
          }`}
        >
          <BoxIcon className="h-[17px] w-[17px]" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{release.name}</span>
            {release.isLatest && <Badge tone="success">Latest</Badge>}
            {release.isDraft && <Badge tone="neutral">Draft</Badge>}
            {release.isPrerelease && <Badge tone="warn">Pre-release</Badge>}
          </div>
          <div className="mt-[3px] flex flex-wrap items-center gap-x-2 text-[12.5px] text-faint">
            <span className="font-mono">{release.tag}</span>
            <span>·</span>
            <span>{timeAgo(release.publishedAt)}</span>
            {release.downloadCount > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-[3px]">
                  <DownloadIcon className="h-3 w-3" />
                  {release.downloadCount.toLocaleString()}
                </span>
              </>
            )}
          </div>
        </div>

        <Button onClick={onOpen} className="flex-none px-3 py-[6px] text-[13px]">
          <ExternalLinkIcon className="h-[13px] w-[13px]" />
          Open
        </Button>
      </div>

      <p className="max-w-[70ch] text-[13px] leading-relaxed text-muted">{release.notes}</p>
    </div>
  );
}

function NewTagModal({
  suggested,
  busy,
  onCancel,
  onCreate,
}: {
  suggested: string;
  busy: boolean;
  onCancel: () => void;
  onCreate: (name: string, message: string) => void;
}) {
  const [name, setName] = useState(suggested);
  const [message, setMessage] = useState("");

  return (
    <Modal
      title="Tag this version"
      icon={<TagIcon className="h-6 w-6" />}
      busy={busy}
      onClose={onCancel}
      subtitle={
        <>
          Marks your latest commit with a name that never moves, so you can always come back to
          exactly this state. <TermHeading term="tag">Learn more</TermHeading>
        </>
      }
      footer={
        <>
          <Button onClick={onCancel} disabled={busy} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={busy || name.trim().length === 0}
            onClick={() => onCreate(name.trim(), message.trim())}
          >
            {busy ? "Tagging…" : "Create tag"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Version"
          value={name}
          onChange={setName}
          mono
          autoFocus
          hint={
            <>
              Most projects use <span className="font-mono text-[12px]">MAJOR.MINOR.PATCH</span>:
              bump the last number for a fix, the middle for a new feature, the first when
              something breaks for existing users.
            </>
          }
        />
        <TextArea
          label="What changed?"
          value={message}
          onChange={setMessage}
          rows={3}
          placeholder="New authentication flow, faster startup, checkout total fix"
          hint="These notes become the release description if you publish this tag on GitHub."
        />
      </div>
    </Modal>
  );
}

/** Bump the patch number of the newest semver-looking tag. */
function suggestNextVersion(tags: Tag[]): string {
  const semver = tags
    .map((t) => /^v?(\d+)\.(\d+)\.(\d+)/.exec(t.name))
    .filter((m): m is RegExpExecArray => m !== null);

  if (semver.length === 0) return "v1.0.0";

  const [major, minor, patch] = semver
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])] as const)
    .sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0]!;

  return `v${major}.${minor}.${patch + 1}`;
}
