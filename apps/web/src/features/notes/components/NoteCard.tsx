import type { NoteDto } from "@note-taking-app/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const relativeTimeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "seconds" },
  { amount: 60, unit: "minutes" },
  { amount: 24, unit: "hours" },
  { amount: 7, unit: "days" },
  { amount: 4.34524, unit: "weeks" },
  { amount: 12, unit: "months" },
  { amount: Number.POSITIVE_INFINITY, unit: "years" },
];

function formatRelativeDate(isoDate: string, now: Date): string {
  let duration = (new Date(isoDate).getTime() - now.getTime()) / 1000;

  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return relativeTimeFormat.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }

  return relativeTimeFormat.format(Math.round(duration), "years");
}

function readableTextColor(hexColor: string): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000000" : "#FFFFFF";
}

export interface NoteCardProps {
  note: NoteDto;
  /** Overrides "now" for relative-date formatting; defaults to the current time. */
  referenceNow?: Date;
}

export function NoteCard({ note, referenceNow }: NoteCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{note.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {note.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
            {note.tags.map((tag) => (
              <li key={tag.id}>
                <Badge style={{ backgroundColor: tag.color, color: readableTextColor(tag.color) }}>
                  {tag.name}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Updated {formatRelativeDate(note.updatedAt, referenceNow ?? new Date())}
        </p>
      </CardContent>
    </Card>
  );
}
