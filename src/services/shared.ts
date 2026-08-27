import type { AppError, DiffLine, ErrorKind } from "@/types/git";

/**
 * Helpers shared by the fixture and Tauri service implementations.
 *
 * Diff parsing lives here rather than in either service because both need the
 * identical result — the fixture is only useful as a stand-in if it produces
 * exactly the rows the real backend does.
 */

/**
 * Parse a unified diff into the rows the file list renders.
 *
 * Only what the UI shows is kept: the `diff --git`, `index`, `---` and `+++`
 * headers carry nothing a reader needs, so they are dropped. Line numbers track
 * the *new* file, which is why removed lines carry none.
 */
export function parseDiff(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let lineNumber = 0;

  for (const raw of patch.split("\n")) {
    if (
      raw.startsWith("diff --git") ||
      raw.startsWith("index ") ||
      raw.startsWith("--- ") ||
      raw.startsWith("+++ ") ||
      raw.startsWith("new file mode") ||
      raw.startsWith("deleted file mode") ||
      raw.startsWith("old mode") ||
      raw.startsWith("new mode") ||
      raw.startsWith("similarity index") ||
      raw.startsWith("rename from") ||
      raw.startsWith("rename to") ||
      raw.startsWith("Binary files")
    ) {
      continue;
    }

    if (raw.startsWith("@@")) {
      // "@@ -1,6 +14,9 @@" — the new-file start line follows the plus.
      const match = /\+(\d+)/.exec(raw);
      lineNumber = match ? Number(match[1]) : 0;
      lines.push({ kind: "meta", lineNumber: null, content: raw });
      continue;
    }

    if (raw.startsWith("+")) {
      lines.push({ kind: "add", lineNumber, content: raw.slice(1) });
      lineNumber += 1;
    } else if (raw.startsWith("-")) {
      lines.push({ kind: "delete", lineNumber: null, content: raw.slice(1) });
    } else if (raw.startsWith("\\")) {
      // "\ No newline at end of file" — real, but not a line of the file.
      continue;
    } else if (raw.length > 0) {
      lines.push({ kind: "context", lineNumber, content: raw.slice(1) });
      lineNumber += 1;
    }
  }

  return lines;
}

const ERROR_KINDS: ErrorKind[] = [
  "notARepository",
  "gitMissing",
  "gitHubCliMissing",
  "notAuthenticated",
  "network",
  "conflict",
  "dirtyWorkingTree",
  "rejected",
  "invalidInput",
  "unknown",
];

/**
 * Normalise anything thrown by a Tauri command into an `AppError`.
 *
 * The Rust side returns structured errors, but a command can also fail before
 * reaching that code — a bad argument name, or the IPC itself — and those
 * arrive as plain strings. Everything the UI catches is therefore funnelled
 * through here, so `error.kind` and `error.message` are always present.
 */
export function toAppError(error: unknown): AppError {
  if (typeof error === "object" && error !== null) {
    const candidate = error as Partial<AppError>;
    if (
      typeof candidate.message === "string" &&
      typeof candidate.kind === "string" &&
      ERROR_KINDS.includes(candidate.kind as ErrorKind)
    ) {
      return {
        kind: candidate.kind as ErrorKind,
        message: candidate.message,
        detail: typeof candidate.detail === "string" ? candidate.detail : undefined,
      };
    }
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return { kind: "unknown", message: error };
  }

  if (error instanceof Error && error.message) {
    return { kind: "unknown", message: error.message };
  }

  return {
    kind: "unknown",
    message: "Something went wrong. Nothing on this computer was changed.",
  };
}

/** True when an error is worth offering a retry for rather than just reporting. */
export function isRetryable(error: AppError): boolean {
  return error.kind === "network";
}

/** True when the fix is to sign in to GitHub. */
export function needsSignIn(error: AppError): boolean {
  return error.kind === "notAuthenticated" || error.kind === "gitHubCliMissing";
}
