import type { NoteVersionSummaryDto } from "@note-taking-app/shared";
import { formatVersionTime } from "../lib/format-version-time.js";

export interface VersionListProps {
  versions: NoteVersionSummaryDto[];
  onSelect: (versionId: string) => void;
}

export function VersionList({ versions, onSelect }: VersionListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {versions.map((version) => (
        <li key={version.id}>
          <button
            type="button"
            onClick={() => onSelect(version.id)}
            className="flex w-full flex-col gap-0.5 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="font-medium">{version.title || "Untitled"}</span>
            <time dateTime={version.createdAt} className="text-sm text-muted-foreground">
              {formatVersionTime(version.createdAt)}
            </time>
          </button>
        </li>
      ))}
    </ul>
  );
}
