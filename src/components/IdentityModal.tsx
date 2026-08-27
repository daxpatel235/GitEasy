import { useState } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./Button";
import { TextField } from "./ui/Field";
import { UserIcon, TerminalIcon, WarningIcon } from "./Icons";
import type { GitIdentity } from "@/types/git";

interface IdentityModalProps {
  /** What is configured now, so the fields start from the truth. */
  identity: GitIdentity;
  /** Suggested from the signed-in GitHub account, when there is one. */
  suggestedName?: string | null;
  suggestedEmail?: string | null;
  busy: boolean;
  /** Shown when the Git email does not match the GitHub account. */
  warning?: string | null;
  onSave: (name: string, email: string) => void;
  onCancel?: () => void;
}

/**
 * The name and email that go on every commit.
 *
 * Git refuses to commit without these, and the error it gives is four lines of
 * configuration advice — which is where a lot of people stop. This asks for the
 * two values in plain terms instead, and says what they are for.
 *
 * Deliberately separate from signing in to GitHub. That decides what the app is
 * allowed to do on the network; this decides whose name appears on the work.
 * Conflating them is why commits so often show up under the wrong account.
 */
export function IdentityModal({
  identity,
  suggestedName,
  suggestedEmail,
  busy,
  warning,
  onSave,
  onCancel,
}: IdentityModalProps) {
  const [name, setName] = useState(identity.name ?? suggestedName ?? "");
  const [email, setEmail] = useState(identity.email ?? suggestedEmail ?? "");

  const cleanName = name.trim();
  const cleanEmail = email.trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  const canSave = cleanName.length > 0 && emailLooksValid;

  return (
    <Modal
      title={identity.configured ? "Change how your commits are signed" : "Who is making these commits?"}
      icon={<UserIcon className="h-6 w-6" />}
      busy={busy}
      onClose={busy ? undefined : onCancel}
      width="md"
      subtitle={
        identity.configured
          ? "Every commit carries a name and an email address. This is what yours say."
          : "Git puts a name and an email on every commit, so anyone reading the history knows who made each change. It will not let you commit until it has both."
      }
      footer={
        <>
          {onCancel && (
            <Button className="flex-1" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => onSave(cleanName, cleanEmail)}
            disabled={!canSave || busy}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {warning && (
          <div className="flex items-start gap-3 rounded-card border border-modified/40 bg-modified/10 px-4 py-3">
            <WarningIcon className="mt-[2px] h-[17px] w-[17px] flex-none text-modified" />
            <p className="text-[13px] leading-relaxed text-muted">{warning}</p>
          </div>
        )}

        <TextField
          label="Name"
          value={name}
          onChange={setName}
          autoFocus
          placeholder="Ada Lovelace"
          hint="Shown next to every commit you make. Your real name or a username both work."
        />

        <TextField
          label="Email"
          value={email}
          onChange={setEmail}
          mono
          placeholder="ada@example.com"
          hint="Use the same address as your GitHub account, and your work will be linked to your profile there."
        />

        {cleanEmail.length > 0 && !emailLooksValid && (
          <p className="text-[12.5px] text-deleted">That does not look like an email address.</p>
        )}

        <div className="flex items-start gap-[9px] rounded-lg bg-surface-alt/40 px-3 py-[9px]">
          <TerminalIcon className="mt-[2px] h-[13px] w-[13px] flex-none text-faint" />
          <p className="font-mono text-[11.5px] leading-relaxed text-faint">
            git config --global user.name "{cleanName || "<name>"}"
            <br />
            git config --global user.email "{cleanEmail || "<email>"}"
          </p>
        </div>

        <p className="text-[12.5px] leading-relaxed text-muted">
          This is separate from signing in to GitHub. Signing in lets GitEasy read pull requests
          and push without a password; this decides whose name is on the work itself.
        </p>
      </div>
    </Modal>
  );
}
