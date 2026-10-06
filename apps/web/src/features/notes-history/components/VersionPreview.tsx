import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { NoteVersionDto } from "@note-taking-app/shared";
import { RICH_TEXT_CLASSES } from "@/lib/rich-text-classes";
import { splitNoteContent, type ProseMirrorDoc } from "../../notes/hooks/note-content-split.js";
import { formatVersionTime } from "../lib/format-version-time.js";

export interface VersionPreviewProps {
  version: NoteVersionDto;
}

/** Read-only render of a version. Mount it keyed by version id so it is created with the right content. */
export function VersionPreview({ version }: VersionPreviewProps) {
  // The first block of `content` is the title, which is rendered as the heading instead.
  const { bodyContent } = splitNoteContent(version.content as ProseMirrorDoc);
  const editor = useEditor({
    editable: false,
    extensions: [StarterKit],
    // A read-only document, not a form control: avoid TipTap's default role="textbox".
    editorProps: { attributes: { role: "document" } },
    content: bodyContent as unknown as JSONContent,
  });

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <header className="flex flex-col gap-0.5">
        <h3 className="text-lg font-semibold">{version.title || "Untitled"}</h3>
        <time dateTime={version.createdAt} className="text-sm text-muted-foreground">
          {formatVersionTime(version.createdAt)}
        </time>
      </header>
      <EditorContent editor={editor} className={RICH_TEXT_CLASSES} />
    </article>
  );
}
