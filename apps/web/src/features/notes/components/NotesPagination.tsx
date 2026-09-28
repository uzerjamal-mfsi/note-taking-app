import { Button } from "@/components/ui/button";

export interface NotesPaginationProps {
  page: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onPageChange: (page: number) => void;
}

export function NotesPagination({
  page,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
}: NotesPaginationProps) {
  return (
    <nav aria-label="Notes pagination" className="flex items-center gap-2">
      <Button variant="outline" disabled={!hasPreviousPage} onClick={() => onPageChange(page - 1)}>
        Previous
      </Button>
      <Button variant="outline" disabled={!hasNextPage} onClick={() => onPageChange(page + 1)}>
        Next
      </Button>
    </nav>
  );
}
