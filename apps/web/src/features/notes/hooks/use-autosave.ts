import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateNote } from "../api/notes-api.js";
import type { ProseMirrorDoc } from "./note-content-split.js";

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface UseAutosaveOptions {
  noteId: string;
  /** Idle period (ms) after the last edit before a debounced save fires. Defaults to 1500ms. */
  idleMs?: number;
}

export interface SaveNowOverrides {
  content?: ProseMirrorDoc;
  tagIds?: string[];
}

export interface UseAutosaveResult {
  status: AutosaveStatus;
  /** Records the editor's latest content and (re)starts the idle debounce timer. */
  scheduleSave: (content: ProseMirrorDoc) => void;
  /**
   * Saves immediately, bypassing the idle debounce - for discrete actions like tag
   * toggles. Returns a promise that rejects on failure, so a caller (e.g. a tag
   * toggle) can revert its own optimistic UI state without affecting body/title
   * autosave's own "keep unsaved edits on failure" behavior.
   */
  saveNow: (overrides?: SaveNowOverrides) => Promise<void>;
  /**
   * Sends any unsaved edit now and resolves once it (and any in-flight save) has settled.
   * A no-op when nothing is dirty; rejects if the save fails, leaving the edit dirty so a
   * later retry can resend it. Unlike saveNow(), it never resends already-saved content.
   */
  flushPending: () => Promise<void>;
  /** Re-attempts the most recent save after a failure. */
  retry: () => void;
  /**
   * Reverts the pending tag selection a failed saveNow() left queued, so a later
   * retry/save doesn't resend tags the caller has already reverted in its own UI state.
   */
  revertPendingTagIds: (tagIds: string[] | undefined) => void;
  /**
   * Discards any unsaved pending edit and clears dirty status, so the flush-on-unmount
   * effect won't fire a save for a note that's already been deleted elsewhere or whose
   * editor state was just replaced (e.g. by a version restore).
   */
  cancelPendingSave: () => void;
}

const DEFAULT_IDLE_MS = 1500;

function isDirtyStatus(status: AutosaveStatus): boolean {
  return status === "pending" || status === "saving" || status === "error";
}

export function useAutosave({
  noteId,
  idleMs = DEFAULT_IDLE_MS,
}: UseAutosaveOptions): UseAutosaveResult {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const pendingContentRef = useRef<ProseMirrorDoc | null>(null);
  const pendingTagIdsRef = useRef<string[] | undefined>(undefined);
  const dirtyRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Serializes overlapping flush() calls (e.g. a debounce firing while a tag-toggle
  // save is still in flight) so a second mutateAsync never starts before the first
  // resolves - otherwise an older response can land after a newer one and clobber
  // the query cache with stale data.
  const inFlightRef = useRef<Promise<void> | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: { content: ProseMirrorDoc; tagIds?: string[] }) =>
      updateNote(noteId, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(["note", noteId], data);
    },
  });

  const flush = useCallback((): Promise<void> => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (inFlightRef.current) {
      return inFlightRef.current.then(() => flush());
    }
    if (!dirtyRef.current || pendingContentRef.current === null) {
      return Promise.resolve();
    }
    const payload = { content: pendingContentRef.current, tagIds: pendingTagIdsRef.current };
    dirtyRef.current = false;
    setStatus("saving");
    const promise = mutation.mutateAsync(payload).then(
      () => {
        setStatus("saved");
      },
      (error: unknown) => {
        dirtyRef.current = true;
        setStatus("error");
        throw error;
      },
    );
    // Tracked separately from `promise` (below) and always resolves, whether the
    // save succeeded or failed, so waiting for "the in-flight save to settle"
    // never itself produces an unhandled rejection - the failure is still
    // surfaced to callers via the returned `promise`.
    inFlightRef.current = promise
      .catch(() => {})
      .finally(() => {
        inFlightRef.current = null;
      });
    return promise;
  }, [mutation]);

  const scheduleSave = useCallback(
    (content: ProseMirrorDoc) => {
      pendingContentRef.current = content;
      dirtyRef.current = true;
      setStatus("pending");
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        flush().catch(() => {});
      }, idleMs);
    },
    [flush, idleMs],
  );

  const saveNow = useCallback(
    (overrides?: SaveNowOverrides): Promise<void> => {
      if (overrides?.content !== undefined) {
        pendingContentRef.current = overrides.content;
      }
      if (overrides?.tagIds !== undefined) {
        pendingTagIdsRef.current = overrides.tagIds;
      }
      dirtyRef.current = true;
      return flush();
    },
    [flush],
  );

  const retry = useCallback(() => {
    dirtyRef.current = true;
    flush().catch(() => {});
  }, [flush]);

  const revertPendingTagIds = useCallback((tagIds: string[] | undefined) => {
    pendingTagIdsRef.current = tagIds;
  }, []);

  const cancelPendingSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    dirtyRef.current = false;
    pendingContentRef.current = null;
    setStatus("idle");
  }, []);

  // `flush` gets a new identity whenever the underlying mutation's status
  // changes (every save), so the unmount effect below reads it via a ref
  // rather than depending on it directly - otherwise its cleanup would fire
  // on every save, not just on an actual unmount/note change.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Flush-on-unmount: fire-and-forget so unsaved edits aren't discarded when the
  // editor unmounts (in-app navigation), per web-notes-editor spec's "Unmounting
  // with unsaved edits flushes them" scenario.
  useEffect(() => {
    return () => {
      flushRef.current().catch(() => {});
    };
  }, [noteId]);

  // beforeunload guard: registered only while dirty, removed once saved - per
  // the "Closing the tab with unsaved edits prompts the user" / "No prompt when
  // there is nothing unsaved" scenarios.
  useEffect(() => {
    if (!isDirtyStatus(status)) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      flush().catch(() => {});
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [status, flush]);

  return {
    status,
    scheduleSave,
    saveNow,
    flushPending: flush,
    retry,
    revertPendingTagIds,
    cancelPendingSave,
  };
}
