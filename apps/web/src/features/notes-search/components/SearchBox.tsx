import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface SearchBoxProps {
  /** The committed (URL-synced) query - used to resync local state on external navigation. */
  value: string;
  onCommit: (q: string) => void;
  /** Idle period (ms) after the last keystroke before the query is committed. Defaults to 300ms. */
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 300;

export function SearchBox({ value, onCommit, debounceMs = DEFAULT_DEBOUNCE_MS }: SearchBoxProps) {
  const [inputValue, setInputValue] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resync local state when the committed value changes externally (URL
  // navigation via reload/back/forward), not on every render.
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Clears a pending debounce timer on unmount so a commit never fires after
  // the user has navigated away (e.g. clicking a search result mid-debounce).
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  function scheduleCommit(nextValue: string) {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      onCommit(nextValue);
    }, debounceMs);
  }

  function handleChange(nextValue: string) {
    setInputValue(nextValue);
    scheduleCommit(nextValue);
  }

  function handleClear() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setInputValue("");
    onCommit("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      handleClear();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <form role="search" onSubmit={handleSubmit} className="flex items-center gap-2">
      <label htmlFor="notes-search-input" className="sr-only">
        Search notes
      </label>
      <Input
        id="notes-search-input"
        type="search"
        placeholder="Search notes…"
        value={inputValue}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {inputValue.length > 0 ? (
        <Button type="button" variant="outline" aria-label="Clear search" onClick={handleClear}>
          ×
        </Button>
      ) : null}
    </form>
  );
}
