import { Button } from "@/components/ui/button";

export interface ClearFiltersButtonProps {
  onClearFilters: () => void;
}

export function ClearFiltersButton({ onClearFilters }: ClearFiltersButtonProps) {
  return (
    <Button variant="outline" onClick={onClearFilters}>
      Clear filters
    </Button>
  );
}
