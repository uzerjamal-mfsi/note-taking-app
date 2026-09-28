import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NotesSortBy, NotesSortDir } from "../hooks/use-notes-list-params.js";

const SORT_OPTIONS: Array<{
  value: string;
  sortBy: NotesSortBy;
  sortDir: NotesSortDir;
  label: string;
}> = [
  { value: "updatedAt:desc", sortBy: "updatedAt", sortDir: "desc", label: "Updated, newest first" },
  { value: "updatedAt:asc", sortBy: "updatedAt", sortDir: "asc", label: "Updated, oldest first" },
  { value: "createdAt:desc", sortBy: "createdAt", sortDir: "desc", label: "Created, newest first" },
  { value: "createdAt:asc", sortBy: "createdAt", sortDir: "asc", label: "Created, oldest first" },
];

export interface NotesSortControlProps {
  sortBy: NotesSortBy;
  sortDir: NotesSortDir;
  onSortChange: (sortBy: NotesSortBy, sortDir: NotesSortDir) => void;
}

export function NotesSortControl({ sortBy, sortDir, onSortChange }: NotesSortControlProps) {
  const value = `${sortBy}:${sortDir}`;

  function handleValueChange(nextValue: string) {
    const option = SORT_OPTIONS.find((candidate) => candidate.value === nextValue);
    if (option) {
      onSortChange(option.sortBy, option.sortDir);
    }
  }

  return (
    <Select value={value} onValueChange={handleValueChange}>
      <SelectTrigger aria-label="Sort notes by">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
