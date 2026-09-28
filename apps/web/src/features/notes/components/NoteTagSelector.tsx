import type { TagDto } from "@note-taking-app/shared";
import { Badge } from "@/components/ui/badge";

export interface NoteTagSelectorProps {
  tags: TagDto[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
}

export function NoteTagSelector({ tags, selectedTagIds, onToggleTag }: NoteTagSelectorProps) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
      {tags.map((tag) => {
        const isSelected = selectedTagIds.includes(tag.id);
        return (
          <li key={tag.id}>
            <Badge asChild variant={isSelected ? "default" : "outline"}>
              <button type="button" aria-pressed={isSelected} onClick={() => onToggleTag(tag.id)}>
                {tag.name}
              </button>
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
