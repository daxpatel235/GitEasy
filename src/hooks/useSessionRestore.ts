import { useCallback, useEffect, useRef } from "react";
import { gitService } from "@/services";
import type { Repository } from "@/types/git";

/** Where the last session's project and screen are kept. */
const PATH_KEY = "session.lastRepoPath";
const VIEW_KEY = "session.lastView";

export interface RestoredSession {
  repo: Repository;
  view: string | null;
}

/**
 * Reopen the project the user was last in, the way an editor does.
 *
 * The point is that closing GitEasy — or shutting the machine down — is not a
 * decision to abandon what you were working on. Restarting should put you back
 * where you were, not in front of a folder picker.
 *
 * What is restored is only *where you were looking*: the project folder and the
 * screen. Nothing is committed, pushed, pulled or fetched on the way in, and
 * the working tree is read fresh from Git, so a restored session can never show
 * a stale view of the repository or act on the user's behalf.
 */
export function useSessionRestore({
  enabled,
  ready,
  hasRepo,
  onRestore,
}: {
  /** The user's preference. `null` while it is still being read. */
  enabled: boolean | null;
  /** Whether the saved preferences have arrived. */
  ready: boolean;
  /** Skip restoring if a project is already open. */
  hasRepo: boolean;
  onRestore: (session: RestoredSession) => void;
}) {
  // Restoring is a once-per-launch thing. Without this guard, toggling the
  // setting off and on again would reopen the project underneath the user.
  const attempted = useRef(false);
  const restore = useRef(onRestore);
  restore.current = onRestore;

  useEffect(() => {
    if (!ready || attempted.current) return;

    // Mark the attempt before the first await, so a re-render mid-flight
    // cannot start a second one.
    attempted.current = true;

    if (!enabled || hasRepo) return;

    let cancelled = false;

    void (async () => {
      try {
        const saved = await gitService.getSettings();
        const path = saved[PATH_KEY];
        if (cancelled || !path) return;

        // Read the repository fresh rather than trusting anything cached: the
        // folder may have been moved, deleted, or had its branch changed by
        // another tool since GitEasy last ran.
        const repo = await gitService.openRepositoryAt(path);
        if (cancelled) return;

        restore.current({ repo, view: saved[VIEW_KEY] ?? null });
      } catch {
        // A project that will not open is not an error worth interrupting a
        // launch over — the user lands on the picker, which is where they
        // would have been anyway.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, ready, hasRepo]);
}

/** Remember the project and screen to come back to. */
export function useRememberSession(repoPath: string | null, view: string) {
  useEffect(() => {
    if (!repoPath) return;

    // Written as the user works rather than on close, because a machine that
    // is shut down or loses power never gets to run a close handler.
    void gitService.setSetting(PATH_KEY, repoPath).catch(() => undefined);
    void gitService.setSetting(VIEW_KEY, view).catch(() => undefined);
  }, [repoPath, view]);
}

/** Forget the saved session, so the next launch starts at the picker. */
export function useForgetSession() {
  return useCallback(async () => {
    await gitService.setSetting(PATH_KEY, "").catch(() => undefined);
  }, []);
}
