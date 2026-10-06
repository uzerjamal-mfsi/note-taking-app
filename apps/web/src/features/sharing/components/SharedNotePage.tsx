import { useParams } from "react-router";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { SharedNotePublicDto } from "@note-taking-app/shared";
import { Spinner } from "@/components/Spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { splitNoteContent, type ProseMirrorDoc } from "../../notes/hooks/note-content-split.js";
import { RICH_TEXT_CLASSES } from "@/lib/rich-text-classes";
import { useSharedNoteQuery } from "../hooks/use-shared-note-query.js";

function SharedNoteContent({ note }: { note: SharedNotePublicDto }) {
  // The first block of `content` is the title, which is rendered as the heading instead.
  const { bodyContent } = splitNoteContent(note.content as ProseMirrorDoc);
  const editor = useEditor({
    editable: false,
    extensions: [StarterKit],
    // A read-only document, not a form control: avoid TipTap's default role="textbox".
    editorProps: { attributes: { role: "document" } },
    content: bodyContent as unknown as JSONContent,
  });

  return (
    <article className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{note.title || "Untitled"}</h1>
      <EditorContent editor={editor} className={RICH_TEXT_CLASSES} />
    </article>
  );
}

function LinkUnavailable() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">This link has expired or been revoked</h1>
      <p className="text-muted-foreground">
        The owner may have stopped sharing this note, or the link&apos;s expiry date has passed. Ask
        them for a new link if you still need access.
      </p>
    </section>
  );
}

export function SharedNotePage() {
  const { token } = useParams<{ token: string }>();
  if (!token) {
    throw new Error("SharedNotePage requires a token route param");
  }

  const query = useSharedNoteQuery(token);

  if (query.isPending) {
    return <Spinner />;
  }

  if (query.isError) {
    if (query.error.status === 404) {
      return <LinkUnavailable />;
    }
    if (query.error.status === 429) {
      return (
        <Alert>
          <AlertTitle>Too many requests</AlertTitle>
          <AlertDescription>
            This page has been opened too many times in a short period. Please try again shortly.
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load this note</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>Something went wrong.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return <SharedNoteContent note={query.data} />;
}
