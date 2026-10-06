import { useEffect, useRef, useState, type FormEvent } from "react";
import { generateShareLinkRequestSchema } from "@note-taking-app/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/Spinner";
import {
  useCreateShareLinkMutation,
  useRevokeShareLinkMutation,
  useShareLinkQuery,
} from "../hooks/use-share-link.js";
import {
  buildShareUrl,
  formatShareExpiry,
  toDatetimeLocalValue,
} from "../lib/share-link-format.js";

const COPIED_RESET_MS = 2000;

export interface ShareDialogProps {
  noteId: string;
}

export function ShareDialog({ noteId }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [minExpiry, setMinExpiry] = useState(() => toDatetimeLocalValue(new Date()));

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setMinExpiry(toDatetimeLocalValue(new Date()));
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="self-start">
          Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this note</DialogTitle>
          <DialogDescription>
            Anyone with the link can read this note without signing in.
          </DialogDescription>
        </DialogHeader>
        <ShareDialogBody noteId={noteId} open={open} minExpiry={minExpiry} />
      </DialogContent>
    </Dialog>
  );
}

interface ShareDialogBodyProps {
  noteId: string;
  open: boolean;
  minExpiry: string;
}

function ShareDialogBody({ noteId, open, minExpiry }: ShareDialogBodyProps) {
  const query = useShareLinkQuery(noteId, { enabled: open });
  const link = query.data;

  if (query.isPending) {
    return <Spinner />;
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn't load the share link</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>Please try again.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (link) {
    return (
      <ActiveLinkView
        noteId={noteId}
        token={link.token}
        viewCount={link.viewCount}
        expiresAt={link.expiresAt}
      />
    );
  }

  return <CreateLinkForm noteId={noteId} minExpiry={minExpiry} />;
}

interface CreateLinkFormProps {
  noteId: string;
  minExpiry: string;
}

function CreateLinkForm({ noteId, minExpiry }: CreateLinkFormProps) {
  const createMutation = useCreateShareLinkMutation(noteId);
  const [expiry, setExpiry] = useState("");
  const [expiryError, setExpiryError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExpiryError(null);
    setRequestError(null);

    let expiresAt: string | undefined;
    if (expiry !== "") {
      const parsed = new Date(expiry);
      if (Number.isNaN(parsed.getTime())) {
        setExpiryError("Enter a valid date and time.");
        return;
      }
      expiresAt = parsed.toISOString();
      if (!generateShareLinkRequestSchema.safeParse({ expiresAt }).success) {
        setExpiryError("Choose a date and time in the future.");
        return;
      }
    }

    createMutation.mutate(expiresAt, {
      onError: (error) => {
        if (error.status === 422) {
          setExpiryError("That expiry isn't allowed. Choose a later date and time.");
        } else {
          setRequestError("Couldn't create a link for this note. Please try again.");
        }
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm">This note isn&apos;t shared yet.</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="share-expiry">Expires (optional)</Label>
        <Input
          id="share-expiry"
          type="datetime-local"
          min={minExpiry}
          value={expiry}
          onChange={(event) => setExpiry(event.target.value)}
          aria-invalid={expiryError ? true : undefined}
          aria-describedby={expiryError ? "share-expiry-error" : undefined}
        />
        {expiryError ? (
          <p id="share-expiry-error" role="alert" className="text-sm text-destructive">
            {expiryError}
          </p>
        ) : null}
      </div>
      {requestError ? (
        <Alert variant="destructive">
          <AlertDescription>{requestError}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={createMutation.isPending} className="self-start">
        Create link
      </Button>
    </form>
  );
}

interface ActiveLinkViewProps {
  noteId: string;
  token: string;
  viewCount: number;
  expiresAt: string | null;
}

function ActiveLinkView({ noteId, token, viewCount, expiresAt }: ActiveLinkViewProps) {
  const revokeMutation = useRevokeShareLinkMutation(noteId);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = buildShareUrl(window.location.origin, token);

  useEffect(
    () => () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  async function handleCopy() {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
      resetTimerRef.current = setTimeout(() => setCopyState("idle"), COPIED_RESET_MS);
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="share-url">Public link</Label>
        <div className="flex gap-2">
          <Input
            id="share-url"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button type="button" variant="outline" onClick={() => void handleCopy()}>
            Copy link
          </Button>
        </div>
        {copyState === "copied" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Copied
          </p>
        ) : null}
        {copyState === "failed" ? (
          <p role="status" className="text-sm text-destructive">
            Couldn&apos;t copy automatically. Select the link above and copy it manually.
          </p>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Views</dt>
        <dd>{viewCount}</dd>
        <dt className="text-muted-foreground">Expires</dt>
        <dd>{formatShareExpiry(expiresAt)}</dd>
      </dl>
      {revokeMutation.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't revoke the link</AlertTitle>
          <AlertDescription>Please try again.</AlertDescription>
        </Alert>
      ) : null}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" className="self-start">
            Revoke link
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this link?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone using the current link will immediately lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => revokeMutation.mutate()}>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
