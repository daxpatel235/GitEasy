import { useCallback, useState } from "react";

const STORAGE_KEY = "giteasy.onboarded";

/**
 * Whether the user has completed onboarding before.
 *
 * Stored locally, like every other preference in this app. A cleared profile
 * simply means they see the introduction again, which is harmless.
 */
export function useFirstRun() {
  const [onboarded, setOnboarded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const complete = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Persistence is a convenience — never block the user on it.
    }
    setOnboarded(true);
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore.
    }
    setOnboarded(false);
  }, []);

  return { onboarded, complete, reset };
}
