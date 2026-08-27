import { useEffect, useRef } from "react";
import { isDesktop } from "@/services";

/** What the Rust watcher sends when something on disk changes. */
interface RepoChanged {
  path: string;
  reason: "filesystem" | "heartbeat";
}

/**
 * Refresh the app when the repository changes underneath it.
 *
 * The backend does the watching with native filesystem events and debounces
 * them, so this only ever receives settled bursts — editing twenty files in a
 * build step arrives as one message, not twenty. There is no polling on either
 * side: the slow "heartbeat" message exists so that changes with no filesystem
 * event in the work tree (a fetch moving remote refs, another tool switching
 * branch) still reach the UI.
 *
 * A second guard here keeps a burst that arrives while a refresh is already
 * running from stacking up more of them.
 */
export function useRepositoryWatcher(
  path: string | null,
  onChange: (reason: RepoChanged["reason"]) => void | Promise<void>,
) {
  // Held in a ref so a new callback identity does not tear down the listener.
  const handler = useRef(onChange);
  handler.current = onChange;

  const running = useRef(false);

  useEffect(() => {
    if (!isDesktop || !path) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");

      const stop = await listen<RepoChanged>("repository-changed", (event) => {
        // Ignore events for a project that is no longer open.
        if (event.payload.path !== path) return;
        if (running.current) return;

        running.current = true;
        void Promise.resolve(handler.current(event.payload.reason)).finally(() => {
          running.current = false;
        });
      });

      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [path]);
}
