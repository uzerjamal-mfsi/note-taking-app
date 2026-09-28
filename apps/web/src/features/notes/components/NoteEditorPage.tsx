import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { NormalizedApiError } from "@/lib/api-client";
import type { NoteDto } from "@note-taking-app/shared";
import { Spinner } from "@/components/Spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteNote, getNote } from "../api/notes-api.js";
import { useAutosave } from "../hooks/use-autosave.js";
import {
  combineNoteContent,
  splitNoteContent,
  type ProseMirrorDoc,
} from "../hooks/note-content-split.js";
import { useTagsQuery } from "../../tags/hooks/use-tags-query.js";
import { NoteTagSelector } from "./NoteTagSelector.js";

function SaveStatusIndicator({
  status,
  onRetry,
}: {
  status: ReturnType<typeof useAutosave>["status"];
  onRetry: () => void;
}) {
  if (status === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn't save your changes</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>Your latest edits haven&apos;t been saved.</span>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const label =
    status === "saving"
      ? "Saving…"
      : status === "pending"
        ? "Unsaved changes"
        : status === "saved"
          ? "Saved"
          : "";

  if (!label) {
    return null;
  }

  return (
    <p role="status" className="text-sm text-muted-foreground">
      {label}
    </p>
  );
}

export function NoteEditorPage() {
  const { noteId } = useParams<{ noteId: string }>();
  if (!noteId) {
    throw new Error("NoteEditorPage requires a noteId route param");
  }

  const noteQuery = useQuery<NoteDto, NormalizedApiError>({
    queryKey: ["note", noteId],
    queryFn: () => getNote(noteId),
  });
  const autosave = useAutosave({ noteId });
  const tagsQuery = useTagsQuery();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [titleText, setTitleText] = useState("");
  const titleRef = useRef("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const seededNoteIdRef = useRef<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: () => deleteNote(noteId),
    onSuccess: () => {
      autosave.cancelPendingSave();
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      navigate("/");
    },
  });

  const editor = useEditor({
    extensions: [StarterKit],
    content: { type: "doc", content: [{ type: "paragraph" }] } satisfies JSONContent,
    onUpdate: ({ editor: currentEditor }) => {
      autosave.scheduleSave(
        combineNoteContent(titleRef.current, currentEditor.getJSON() as unknown as ProseMirrorDoc),
      );
    },
  });

  // Seed once per note: initial load, or navigating to a different note. A
  // background refetch of the same note (e.g. on window refocus) must NOT
  // re-seed and clobber in-progress edits - see web-notes-editor spec's
  // "Background refetches do not overwrite in-progress edits".
  useEffect(() => {
    if (!editor || !noteQuery.data || seededNoteIdRef.current === noteId) {
      return;
    }
    const { titleText: seededTitle, bodyContent } = splitNoteContent(noteQuery.data.content);
    seededNoteIdRef.current = noteId;
    titleRef.current = seededTitle;
    setTitleText(seededTitle);
    setTagIds(noteQuery.data.tags.map((tag) => tag.id));
    editor.commands.setContent(bodyContent as unknown as JSONContent, false);
  }, [editor, noteQuery.data, noteId]);

  function getCurrentContent(): ProseMirrorDoc {
    const bodyContent = (editor?.getJSON() ?? {
      type: "doc",
      content: [],
    }) as unknown as ProseMirrorDoc;
    return combineNoteContent(titleRef.current, bodyContent);
  }

  function handleToggleTag(tagId: string) {
    const previousTagIds = tagIds;
    const nextTagIds = previousTagIds.includes(tagId)
      ? previousTagIds.filter((id) => id !== tagId)
      : [...previousTagIds, tagId];
    setTagIds(nextTagIds);
    autosave.saveNow({ content: getCurrentContent(), tagIds: nextTagIds }).catch(() => {
      setTagIds(previousTagIds);
      autosave.revertPendingTagIds(previousTagIds);
    });
  }

  function handleTitleChange(value: string) {
    titleRef.current = value;
    setTitleText(value);
    autosave.scheduleSave(getCurrentContent());
  }

  if (noteQuery.isLoading) {
    return <Spinner />;
  }

  if (noteQuery.isError) {
    if (noteQuery.error.status === 404) {
      return (
        <Alert>
          <AlertTitle>Note not found</AlertTitle>
          <AlertDescription>
            This note doesn&apos;t exist, isn&apos;t yours, or has been deleted.
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn't load this note</AlertTitle>
        <AlertDescription>Please try again.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        aria-label="Title"
        placeholder="Untitled"
        value={titleText}
        onChange={(event) => handleTitleChange(event.target.value)}
        className="text-lg font-semibold"
      />
      <EditorContent editor={editor} />
      <NoteTagSelector
        tags={tagsQuery.data ?? []}
        selectedTagIds={tagIds}
        onToggleTag={handleToggleTag}
      />
      <SaveStatusIndicator status={autosave.status} onRetry={autosave.retry} />
      {deleteMutation.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't delete this note</AlertTitle>
          <AlertDescription>Please try again.</AlertDescription>
        </Alert>
      ) : null}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" className="self-start">
            Delete note
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone from here.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
