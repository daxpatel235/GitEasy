import { useCallback, useEffect, useState } from "react";
import { gitService } from "@/services";
import { DEFAULT_BEHAVIOUR, type Behaviour } from "@/components/settings/InfoSections";

/**
 * The behaviour toggles, persisted in GitEasy's own database.
 *
 * These are preferences about how the app behaves, not anything about a
 * repository — Git stays the source of truth for that — so they live in SQLite
 * on the Rust side and survive a restart.
 *
 * The defaults apply until the saved values arrive, so the first paint is never
 * blocked on a round trip.
 */
export function usePersistentBehaviour(): [Behaviour, (next: Behaviour) => void, boolean] {
  const [behaviour, setBehaviour] = useState<Behaviour>(DEFAULT_BEHAVIOUR);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const saved = await gitService.getSettings();
        if (cancelled) return;

        // Only keys the app knows are read back, so a stale or hand-edited
        // database cannot introduce a toggle that no longer exists.
        const restored = { ...DEFAULT_BEHAVIOUR };
        for (const key of Object.keys(DEFAULT_BEHAVIOUR) as (keyof Behaviour)[]) {
          const value = saved[`behaviour.${key}`];
          if (value === "true" || value === "false") {
            restored[key] = value === "true";
          }
        }
        setBehaviour(restored);
      } catch {
        // A missing or unreadable database is not worth interrupting anyone
        // over — the defaults are all perfectly good settings.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(
    (next: Behaviour) => {
      setBehaviour((previous) => {
        // Write only what actually changed, rather than all eight every time.
        for (const key of Object.keys(next) as (keyof Behaviour)[]) {
          if (previous[key] !== next[key]) {
            void gitService.setSetting(`behaviour.${key}`, String(next[key])).catch(() => {
              // Losing a preference is not worth a toast; it will be written
              // again the next time the user touches the toggle.
            });
          }
        }
        return next;
      });
    },
    [],
  );

  return [behaviour, update, loaded];
}
