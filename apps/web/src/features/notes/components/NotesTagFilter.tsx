import type { TagDto } from "@note-taking-app/shared";
import { Badge } from "@/components/ui/badge";

export interface NotesTagFilterProps {
  tags: TagDto[];
  selectedTags: string[];
  onToggleTag: (tagName: string) => void;
}

export function NotesTagFilter({ tags, selectedTags, onToggleTag }: NotesTagFilterProps) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Filter by tag">
      {tags.map((tag) => {
        const isSelected = selectedTags.includes(tag.name);
        return (
          <li key={tag.id}>
            <Badge asChild variant={isSelected ? "default" : "outline"}>
              <button type="button" aria-pressed={isSelected} onClick={() => onToggleTag(tag.name)}>
                {tag.name}
              </button>
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
