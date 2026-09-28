import { Spinner } from "@/components/Spinner";
import { useNotesListParams } from "../hooks/use-notes-list-params.js";
import { useNotesQuery } from "../hooks/use-notes-query.js";
import { useTagsQuery } from "../../tags/hooks/use-tags-query.js";
import { ClearFiltersButton } from "./ClearFiltersButton.js";
import { NewNoteButton } from "./NewNoteButton.js";
import { NoteCard } from "./NoteCard.js";
import { NotesEmptyState } from "./NotesEmptyState.js";
import { NotesErrorState } from "./NotesErrorState.js";
import { NotesNoMatchesState } from "./NotesNoMatchesState.js";
import { NotesPagination } from "./NotesPagination.js";
import { NotesSortControl } from "./NotesSortControl.js";
import { NotesTagFilter } from "./NotesTagFilter.js";

export function NotesListPage() {
  const { page, sortBy, sortDir, tags, setPage, setSort, toggleTag, clearFilters } =
    useNotesListParams();
  const notesQuery = useNotesQuery({ page, sortBy, sortDir, tags });
  const tagsQuery = useTagsQuery();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NotesSortControl sortBy={sortBy} sortDir={sortDir} onSortChange={setSort} />
        <NotesTagFilter tags={tagsQuery.data ?? []} selectedTags={tags} onToggleTag={toggleTag} />
        <NewNoteButton />
      </div>

      {notesQuery.isLoading ? <Spinner /> : null}

      {notesQuery.isError ? <NotesErrorState /> : null}

      {notesQuery.isSuccess ? (
        <>
          {notesQuery.data.data.length === 0 ? (
            tags.length > 0 ? (
              <NotesNoMatchesState onClearFilters={clearFilters} />
            ) : (
              <NotesEmptyState />
            )
          ) : (
            <>
              {tags.length > 0 ? <ClearFiltersButton onClearFilters={clearFilters} /> : null}
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {notesQuery.data.data.map((note) => (
                  <li key={note.id}>
                    <NoteCard note={note} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {notesQuery.data.data.length > 0 ||
          notesQuery.data.meta.hasPreviousPage ||
          notesQuery.data.meta.hasNextPage ? (
            <NotesPagination
              page={page}
              hasNextPage={notesQuery.data.meta.hasNextPage}
              hasPreviousPage={notesQuery.data.meta.hasPreviousPage}
              onPageChange={setPage}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
