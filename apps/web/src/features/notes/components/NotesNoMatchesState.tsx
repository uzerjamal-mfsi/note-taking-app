import { ClearFiltersButton } from "./ClearFiltersButton.js";

export interface NotesNoMatchesStateProps {
  onClearFilters: () => void;
}

export function NotesNoMatchesState({ onClearFilters }: NotesNoMatchesStateProps) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-muted-foreground">No notes match your filters.</p>
      <ClearFiltersButton onClearFilters={onClearFilters} />
    </div>
  );
}
