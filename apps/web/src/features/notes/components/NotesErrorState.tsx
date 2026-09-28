import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function NotesErrorState() {
  return (
    <Alert variant="destructive">
      <AlertTitle>Couldn't load your notes</AlertTitle>
      <AlertDescription>Your notes could not be loaded. Please try again.</AlertDescription>
    </Alert>
  );
}
