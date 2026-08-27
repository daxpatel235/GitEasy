import { useState } from "react";
import { Button } from "./Button";
import { Modal } from "./ui/Modal";
import { TextField } from "./ui/Field";
import { Explain } from "./Explain";
import { ForkIcon } from "./Icons";

/**
 * Adding a second remote, which in practice always means one thing: telling
 * GitEasy which project this one was forked from, so the Sync screen can offer
 * to pull the original's changes in.
 */
export function AddRemoteModal({
  busy,
  onCancel,
  onAdd,
}: {
  busy: boolean;
  onCancel: () => void;
  onAdd: (name: string, url: string) => void;
}) {
  const [name, setName] = useState("upstream");
  const [url, setUrl] = useState("");

  const valid = /^(https?:\/\/|git@)/.test(url.trim()) && name.trim().length > 0;

  return (
    <Modal
      title="Add a remote"
      icon={<ForkIcon className="h-6 w-6" />}
      busy={busy}
      onClose={onCancel}
      width="sm"
      subtitle={
        <>
          Point GitEasy at another copy of this project. Usually this is the original you forked
          — naming it <span className="font-mono text-[13px] text-content">upstream</span> is the
          convention. <Explain term="upstream" />
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
            onClick={() => onAdd(name.trim(), url.trim())}
          >
            {busy ? "Adding…" : "Add remote"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Nickname"
          value={name}
          onChange={setName}
          mono
          hint="What GitEasy will call it. Keep 'upstream' unless you have a reason not to."
        />
        <TextField
          label="Address"
          value={url}
          onChange={setUrl}
          mono
          autoFocus
          placeholder="https://github.com/original-owner/project.git"
          hint="Copy it from the original project's green Code button on GitHub."
        />
      </div>
    </Modal>
  );
}
