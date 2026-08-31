import { useCallback, useEffect, useRef, useState } from "react";
import { gitService } from "@/services";

/** Set once at build time; false in the browser demo, where there is no shell. */
const IN_APP = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** How long to wait after launch before looking. */
const CHECK_DELAY_MS = 4_000;

/** And how often to look again while the app stays open. */
const RECHECK_MS = 6 * 60 * 60 * 1000;

const AUTO_KEY = "update.automatic";
const SKIPPED_KEY = "update.skippedVersion";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "failed";

export interface UpdateState {
  phase: UpdatePhase;
  /** The version on offer, once one is known. */
  version: string | null;
  /** Release notes from the release, when the build published any. */
  notes: string | null;
  /** 0–100 while downloading, otherwise null. */
  progress: number | null;
  error: string | null;
}

const IDLE: UpdateState = {
  phase: "idle",
  version: null,
  notes: null,
  progress: null,
  error: null,
};

/**
 * In-place updates.
 *
 * The rules this follows, in order of how much they matter:
 *
 * 1. **Nothing installs without a click.** Downloading may be automatic;
 *    replacing the running application never is. The user restarts when they
 *    are ready, so an update can never interrupt work in progress.
 * 2. **Signed or nothing.** The updater plugin verifies every download against
 *    a public key compiled into the app. An unsigned or tampered release is
 *    rejected before a single byte is executed, so a compromised release page
 *    still cannot ship code to anybody.
 * 3. **Quiet when it fails.** No network, a corporate proxy, GitHub being down
 *    — none of that is the user's problem, and none of it produces a dialog.
 *    The check simply does not find anything.
 */
export function useAppUpdate() {
  const [state, setState] = useState<UpdateState>(IDLE);

  /** Whether to start the download without being asked. Default on. */
  const [automatic, setAutomatic] = useState(true);

  // The pending Update object from the plugin. Kept in a ref because it is not
  // renderable state and must survive re-renders between download and install.
  const pending = useRef<PendingUpdate | null>(null);
  const started = useRef(false);
  const automaticRef = useRef(automatic);
  automaticRef.current = automatic;

  /* --- The preference ---------------------------------------------------- */

  useEffect(() => {
    void (async () => {
      try {
        const saved = await gitService.getSettings();
        if (saved[AUTO_KEY] === "false") setAutomatic(false);
      } catch {
        // Defaulting to automatic is the documented behaviour, so a database
        // that will not open changes nothing.
      }
    })();
  }, []);

  const setAutomaticDownloads = useCallback((next: boolean) => {
    setAutomatic(next);
    void gitService.setSetting(AUTO_KEY, String(next)).catch(() => undefined);
  }, []);

  /* --- Downloading and installing ---------------------------------------- */

  const download = useCallback(async () => {
    const update = pending.current;
    if (!update) return;

    setState((s) => ({ ...s, phase: "downloading", progress: 0, error: null }));

    let total = 0;
    let received = 0;

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          received = 0;
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          // Without a content length there is no honest percentage to show, so
          // the bar stays indeterminate rather than inventing one.
          const pct = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null;
          setState((s) => ({ ...s, progress: pct }));
        } else if (event.event === "Finished") {
          setState((s) => ({ ...s, progress: 100 }));
        }
      });

      // `downloadAndInstall` stages the update; on Windows the installer runs
      // on exit, on macOS the bundle is swapped. Either way it takes effect on
      // the next launch, which is the user's decision to make.
      setState((s) => ({ ...s, phase: "ready", progress: 100 }));
    } catch (error) {
      setState((s) => ({
        ...s,
        phase: "failed",
        progress: null,
        error: describe(error),
      }));
    }
  }, []);

  const restart = useCallback(async () => {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      // If the relaunch is refused the update is still staged and will apply
      // the next time the app is opened, so there is nothing to report.
    }
  }, []);

  /* --- Checking ---------------------------------------------------------- */

  const check = useCallback(
    async ({ manual = false }: { manual?: boolean } = {}) => {
      if (!IN_APP) return;

      setState((s) => ({ ...s, phase: "checking", error: null }));

      try {
        const { check: checkForUpdate } = await import("@tauri-apps/plugin-updater");
        const update = await checkForUpdate();

        // Already current. The pill shows nothing, which is the correct
        // outcome whether or not the user asked.
        if (!update) {
          setState(IDLE);
          return;
        }

        // A version the user chose to skip stays skipped, unless they went
        // looking for it themselves.
        if (!manual) {
          const saved = await gitService.getSettings().catch(() => ({}) as Record<string, string>);
          if (saved[SKIPPED_KEY] === update.version) {
            setState(IDLE);
            return;
          }
        }

        pending.current = update as unknown as PendingUpdate;
        setState({
          phase: "available",
          version: update.version,
          notes: update.body ?? null,
          progress: null,
          error: null,
        });

        if (automaticRef.current) void download();
      } catch (error) {
        // A failed check is background noise unless the user asked for it.
        setState(
          manual
            ? { ...IDLE, phase: "failed", error: describe(error) }
            : IDLE,
        );
      }
    },
    [download],
  );

  const skip = useCallback(() => {
    const version = state.version;
    setState(IDLE);
    pending.current = null;
    if (version) void gitService.setSetting(SKIPPED_KEY, version).catch(() => undefined);
  }, [state.version]);

  const dismiss = useCallback(() => setState(IDLE), []);

  /* --- When to look ------------------------------------------------------ */

  useEffect(() => {
    if (!IN_APP || started.current) return;
    started.current = true;

    // Deliberately not on the first paint: opening a project is what the user
    // is waiting for, and an update check competing with it is exactly the kind
    // of launch-time stall this app has been fixing.
    const first = setTimeout(() => void check(), CHECK_DELAY_MS);
    const repeat = setInterval(() => void check(), RECHECK_MS);

    return () => {
      clearTimeout(first);
      clearInterval(repeat);
    };
  }, [check]);

  return {
    ...state,
    automatic,
    setAutomaticDownloads,
    check,
    download,
    restart,
    skip,
    dismiss,
    supported: IN_APP,
  };
}

/** The shape the updater plugin reports download progress in. */
type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished"; data?: unknown };

/**
 * The part of the plugin's `Update` this file uses.
 *
 * Narrowed on purpose: naming only what is called means a change to the rest of
 * the plugin's surface cannot silently break this, and the cast at the one
 * assignment site stays honest about what is being relied on.
 */
interface PendingUpdate {
  version: string;
  body?: string;
  downloadAndInstall(onEvent: (event: DownloadEvent) => void): Promise<void>;
}

function describe(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);

  // The plugin's own messages are developer-facing; these are the three cases
  // a user can actually do something about.
  if (/network|dns|connect|timeout/i.test(text)) {
    return "GitEasy could not reach GitHub. Check your connection and try again.";
  }
  if (/signature|verify/i.test(text)) {
    return "That update could not be verified, so it was not installed. Download GitEasy from its releases page instead.";
  }
  if (/permission|denied|access/i.test(text)) {
    return "GitEasy does not have permission to update itself here. Installing the new version by hand will work.";
  }
  return "The update could not be installed. Downloading it from the releases page will work.";
}
