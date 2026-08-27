import { useState } from "react";
import { Button } from "./Button";
import { Modal } from "./ui/Modal";
import { Badge } from "./ui/Badge";
import { TextField } from "./ui/Field";
import { Explain } from "./Explain";
import { DownloadIcon, ForkIcon, SearchIcon, StarIcon } from "./Icons";
import { timeAgo } from "@/lib/time";
import type { RemoteRepo } from "@/types/github";

interface CloneModalProps {
  repos: RemoteRepo[];
  busy: boolean;
  signedIn: boolean;
  onCancel: () => void;
  onClone: (url: string) => void;
}

/**
 * Two ways in, because people arrive with either.
 *
 * Someone following a tutorial has a URL on their clipboard; someone opening
 * their own work wants to see a list. Paste and browse sit side by side rather
 * than behind a mode switch.
 */
export function CloneModal({ repos, busy, signedIn, onCancel, onClone }: CloneModalProps) {
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? repos.filter((r) => `${r.slug} ${r.description}`.toLowerCase().includes(needle))
    : repos;

  const valid = /^(https?:\/\/|git@)/.test(url.trim());

  return (
    <Modal
      title="Download a project from GitHub"
      icon={<DownloadIcon className="h-6 w-6" />}
      busy={busy}
      onClose={onCancel}
      width="md"
      subtitle={
        <>
          This copies the whole project — every file and its complete history — onto your
          computer, and remembers where it came from so pushing works straight away.{" "}
          <Explain term="clone" />
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
            disabled={!valid || busy}
            onClick={() => onClone(url.trim())}
          >
            {busy ? "Downloading…" : "Download"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Project address"
          value={url}
          onChange={setUrl}
          mono
          autoFocus
          placeholder="https://github.com/owner/project"
          hint={
            url.length > 0 && !valid
              ? "That does not look like a repository address. Copy it from the green Code button on GitHub."
              : "Paste the link from GitHub's Code button, or pick one of yours below."
          }
        />

        {signedIn && repos.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[12px] text-faint">or pick one of yours</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            {repos.length > 5 && (
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-[10px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-faint" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a project"
                  aria-label="Find a project"
                  className="w-full rounded-md border border-line bg-ground py-[8px] pl-[30px] pr-3 text-[13px] placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>
            )}

            <div className="max-h-[220px] overflow-y-auto rounded-lg border border-line">
              {visible.map((repo, index) => (
                <button
                  key={repo.slug}
                  type="button"
                  onClick={() => setUrl(`${repo.url}.git`)}
                  className={`flex w-full items-start gap-3 px-3 py-[10px] text-left transition-colors hover:bg-surface-alt ${
                    index > 0 ? "border-t border-line-soft" : ""
                  } ${url === `${repo.url}.git` ? "bg-accent/10" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-[13px] font-medium">
                        {repo.slug}
                      </span>
                      {repo.isPrivate && <Badge tone="neutral">Private</Badge>}
                      {repo.isFork && (
                        <Badge tone="neutral" icon={<ForkIcon className="h-[10px] w-[10px]" />}>
                          Fork
                        </Badge>
                      )}
                    </span>
                    <span className="mt-[2px] block truncate text-[12px] text-faint">
                      {repo.description || "No description"}
                    </span>
                  </span>

                  <span className="flex flex-none flex-col items-end gap-[2px] text-[11.5px] text-faint">
                    <span>{timeAgo(repo.updatedAt)}</span>
                    {repo.stars > 0 && (
                      <span className="inline-flex items-center gap-[3px]">
                        <StarIcon className="h-3 w-3" />
                        {repo.stars}
                      </span>
                    )}
                  </span>
                </button>
              ))}

              {visible.length === 0 && (
                <p className="px-3 py-6 text-center text-[12.5px] text-muted">
                  Nothing matches “{query}”.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
