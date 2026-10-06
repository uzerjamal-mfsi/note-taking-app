import { Spinner } from "@/components/Spinner";
import { useNotesListParams } from "../hooks/use-notes-list-params.js";
import { useNotesQuery } from "../hooks/use-notes-query.js";
import { useTagsQuery } from "../../tags/hooks/use-tags-query.js";
import { useSearchQuery } from "../../notes-search/hooks/use-search-query.js";
import { SearchBox } from "../../notes-search/components/SearchBox.js";
import { SearchResultCard } from "../../notes-search/components/SearchResultCard.js";
import { SearchNoResultsState } from "../../notes-search/components/SearchNoResultsState.js";
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
  const { page, sortBy, sortDir, tags, q, setPage, setSort, toggleTag, clearFilters, setQuery } =
    useNotesListParams();
  const isSearching = q.trim().length > 0;
  const notesQuery = useNotesQuery({ page, sortBy, sortDir, tags }, { enabled: !isSearching });
  const searchQuery = useSearchQuery({ q, page, pageSize: 20 });
  const tagsQuery = useTagsQuery();
  const activeQuery = isSearching ? searchQuery : notesQuery;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox value={q} onCommit={setQuery} />
        {isSearching ? null : (
          <>
            <NotesSortControl sortBy={sortBy} sortDir={sortDir} onSortChange={setSort} />
            <NotesTagFilter
              tags={tagsQuery.data ?? []}
              selectedTags={tags}
              onToggleTag={toggleTag}
            />
          </>
        )}
        <NewNoteButton />
      </div>

      {activeQuery.isLoading ? <Spinner /> : null}

      {activeQuery.isError ? <NotesErrorState /> : null}

      {isSearching
        ? searchQuery.isSuccess && (
            <>
              {searchQuery.data.data.length === 0 ? (
                <SearchNoResultsState />
              ) : (
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {searchQuery.data.data.map((result) => (
                    <li key={result.id}>
                      <SearchResultCard result={result} />
                    </li>
                  ))}
                </ul>
              )}
              {searchQuery.data.data.length > 0 ||
              searchQuery.data.meta.hasPreviousPage ||
              searchQuery.data.meta.hasNextPage ? (
                <NotesPagination
                  page={page}
                  hasNextPage={searchQuery.data.meta.hasNextPage}
                  hasPreviousPage={searchQuery.data.meta.hasPreviousPage}
                  onPageChange={setPage}
                />
              ) : null}
            </>
          )
        : notesQuery.isSuccess && (
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
          )}
    </div>
  );
}
