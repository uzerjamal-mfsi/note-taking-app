import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { NoteDto } from "@note-taking-app/shared";
import { Spinner } from "@/components/Spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { NormalizedApiError } from "../../../lib/api-client.js";
import { useRestoreNoteVersionMutation } from "../hooks/use-restore-note-version.js";
import {
  noteVersionsQueryKey,
  useNoteVersionQuery,
  useNoteVersionsQuery,
} from "../hooks/use-note-versions.js";
import { VersionList } from "./VersionList.js";
import { VersionPreview } from "./VersionPreview.js";

export interface HistoryDrawerProps {
  noteId: string;
  /** Flushes any unsaved editor edits; rejects if they could not be saved. */
  onBeforeRestore: () => Promise<void>;
  /** Receives the restored note so the editor can re-seed itself from it. */
  onRestored: (note: NoteDto) => void;
}

type RestoreFailure = "flush" | "restore";

function isNotFound(error: unknown): boolean {
  return (error as Partial<NormalizedApiError> | null)?.status === 404;
}

export function HistoryDrawer({ noteId, onBeforeRestore, onRestored }: HistoryDrawerProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [restoreFailure, setRestoreFailure] = useState<RestoreFailure | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const restoringRef = useRef(false);
  const hintId = useId();

  const versionsQuery = useNoteVersionsQuery(noteId, { enabled: open });
  const versionQuery = useNoteVersionQuery(noteId, selectedVersionId);
  const restoreMutation = useRestoreNoteVersionMutation(noteId);

  function resetView() {
    setSelectedVersionId(null);
    setRestoreFailure(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetView();
    }
  }

  // A 404 from any history request means the note (or the version) is gone. Defer to the
  // editor: refetching the note flips it to its not-found state if the note is gone, and
  // refetching the list drops a purged version if the note still exists.
  const handleNotFound = useCallback(() => {
    setOpen(false);
    setSelectedVersionId(null);
    setRestoreFailure(null);
    void queryClient.invalidateQueries({ queryKey: ["note", noteId] });
    void queryClient.invalidateQueries({ queryKey: noteVersionsQueryKey(noteId) });
  }, [queryClient, noteId]);

  const listNotFound =
    open && versionsQuery.isError && !versionsQuery.isFetching && isNotFound(versionsQuery.error);
  const versionNotFound =
    open && versionQuery.isError && !versionQuery.isFetching && isNotFound(versionQuery.error);

  useEffect(() => {
    if (listNotFound || versionNotFound) {
      handleNotFound();
    }
  }, [listNotFound, versionNotFound, handleNotFound]);

  async function handleRestore(versionId: string) {
    if (restoringRef.current) {
      return;
    }
    restoringRef.current = true;
    setIsRestoring(true);
    setRestoreFailure(null);
    try {
      try {
        await onBeforeRestore();
      } catch {
        setRestoreFailure("flush");
        return;
      }
      let restored: NoteDto;
      try {
        restored = await restoreMutation.mutateAsync(versionId);
      } catch (error) {
        if (isNotFound(error)) {
          handleNotFound();
        } else {
          setRestoreFailure("restore");
        }
        return;
      }
      onRestored(restored);
      setOpen(false);
      resetView();
    } finally {
      restoringRef.current = false;
      setIsRestoring(false);
    }
  }

  function renderBody() {
    if (selectedVersionId !== null) {
      return renderPreview(selectedVersionId);
    }
    if (versionsQuery.isPending) {
      return <Spinner />;
    }
    if (versionsQuery.isError) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load version history</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>Please try again.</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => versionsQuery.refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      );
    }
    if (versionsQuery.data.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">This note has no earlier versions yet.</p>
      );
    }
    return <VersionList versions={versionsQuery.data} onSelect={setSelectedVersionId} />;
  }

  function renderPreview(versionId: string) {
    let content: React.ReactNode;
    if (versionQuery.isPending) {
      content = <Spinner />;
    } else if (versionQuery.isError) {
      content = (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load this version</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>Please try again.</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => versionQuery.refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      );
    } else {
      content = (
        <>
          <VersionPreview key={versionQuery.data.id} version={versionQuery.data} />
          {restoreFailure ? (
            <Alert variant="destructive">
              <AlertTitle>
                {restoreFailure === "flush"
                  ? "Couldn't save your latest edits"
                  : "Couldn't restore this version"}
              </AlertTitle>
              <AlertDescription>
                {restoreFailure === "flush"
                  ? "Your latest edits couldn't be saved, so nothing was restored. Please try again."
                  : "Please try again."}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              disabled={isRestoring}
              aria-describedby={hintId}
              onClick={() => void handleRestore(versionId)}
            >
              Restore
            </Button>
            <p id={hintId} className="text-sm text-muted-foreground">
              Your current version will be saved to history.
            </p>
          </div>
        </>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={isRestoring}
          onClick={resetView}
        >
          Back
        </Button>
        {content}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" className="self-start">
          History
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
          <SheetDescription>Browse earlier versions of this note and restore one.</SheetDescription>
        </SheetHeader>
        {renderBody()}
        {selectedVersionId === null ? (
          <p className="mt-auto text-xs text-muted-foreground">Versions are kept for 30 days.</p>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
