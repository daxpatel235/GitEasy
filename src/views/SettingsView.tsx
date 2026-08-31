import { useState } from "react";
import { ThemeSection } from "@/components/settings/ThemeSection";
import {
  AboutSection,
  AccountSection,
  GitSection,
  RemotesSection,
  RepositorySection,
  ShortcutsSection,
  type Behaviour,
} from "@/components/settings/InfoSections";
import type { GitIdentity, Remote, Repository } from "@/types/git";
import type { GitHubAccount } from "@/types/github";
import type { SettingsSection } from "@/types/navigation";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "repository", label: "Project" },
  { id: "remotes", label: "Remotes" },
  { id: "git", label: "Behaviour" },
  { id: "account", label: "Account" },
  { id: "theme", label: "Theme" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "about", label: "About" },
];

/** Sub-heading shown under the big section title. */
const SUBTITLES: Record<SettingsSection, string> = {
  repository: "The project GitEasy is currently working with.",
  remotes: "Servers holding a copy of this project.",
  git: "What GitEasy does for you automatically, and what it warns you about.",
  account: "Your GitHub sign-in. Optional — everything local works without it.",
  theme: "Choose how GitEasy looks. Changes apply straight away.",
  shortcuts: "Every keyboard shortcut in the app.",
  about: "About this app.",
};

interface SettingsViewProps {
  repo: Repository | null;
  remotes: Remote[];
  account: GitHubAccount | null;
  behaviour: Behaviour;
  busy: boolean;
  onBehaviourChange: (next: Behaviour) => void;
  onChangeRepository: () => void;
  onOpenFolder: () => void;
  onAddRemote: () => void;
  onRemoveRemote: (name: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onReplayIntro: () => void;
  /** Update controls, forwarded to the About section. */
  update?: React.ComponentProps<typeof AboutSection>["update"];
  /** The name and email stamped on commits — separate from the account. */
  identity?: GitIdentity | null;
  /** Set when the Git email is not on the signed-in GitHub account. */
  identityWarning?: string | null;
  onEditIdentity?: () => void;
}

export function SettingsView({
  repo,
  remotes,
  account,
  behaviour,
  busy,
  onBehaviourChange,
  onChangeRepository,
  onOpenFolder,
  onAddRemote,
  onRemoveRemote,
  onSignIn,
  onSignOut,
  onReplayIntro,
  update,
  identity,
  identityWarning,
  onEditIdentity,
}: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>("repository");

  return (
    <div className="flex flex-col gap-7">
      {/*
        Heading row: the oversized section name on the left, the section nav on
        the right — the landing pattern for every Settings page.
      */}
      <div className="flex flex-col gap-6 border-b border-line-soft pb-6">
        <div>
          <h1 className="display text-[44px] font-semibold leading-none tracking-[-0.03em]">
            {SECTIONS.find((s) => s.id === section)?.label}
          </h1>
          <p className="mt-3 max-w-[56ch] text-[15px] text-muted">{SUBTITLES[section]}</p>
        </div>

        <nav className="flex flex-wrap gap-4" aria-label="Settings sections">
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                aria-current={active ? "page" : undefined}
                className={`relative text-[15px] font-medium transition-colors ${
                  active ? "text-content" : "text-muted hover:text-content"
                }`}
              >
                {s.label}
                {active && (
                  <span className="absolute -bottom-1 left-0 right-0 h-[3px] rounded-full bg-accent" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {section === "repository" && (
        <RepositorySection
          repo={repo}
          onChangeRepository={onChangeRepository}
          onOpenFolder={onOpenFolder}
        />
      )}
      {section === "remotes" && (
        <RemotesSection remotes={remotes} onAdd={onAddRemote} onRemove={onRemoveRemote} />
      )}
      {section === "git" && <GitSection behaviour={behaviour} onChange={onBehaviourChange} />}
      {section === "account" && (
        <AccountSection
          account={account}
          busy={busy}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          identity={identity}
          identityWarning={identityWarning}
          onEditIdentity={onEditIdentity}
        />
      )}
      {section === "theme" && <ThemeSection />}
      {section === "shortcuts" && <ShortcutsSection />}
      {section === "about" && <AboutSection onReplayIntro={onReplayIntro} update={update} />}
    </div>
  );
}
