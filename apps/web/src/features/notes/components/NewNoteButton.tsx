import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createNote } from "../api/notes-api.js";

const EMPTY_STARTER_DOCUMENT = { type: "doc", content: [{ type: "paragraph" }] };

export function NewNoteButton() {
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: () => createNote(EMPTY_STARTER_DOCUMENT),
    onSuccess: (note) => navigate(`/notes/${note.id}`),
  });

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        New note
      </Button>
      {mutation.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't create a new note</AlertTitle>
          <AlertDescription>Please try again.</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
