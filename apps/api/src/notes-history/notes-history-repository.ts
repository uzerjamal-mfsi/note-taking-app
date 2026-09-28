import type { Prisma, PrismaClient } from "@note-taking-app/db";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const NOTE_VERSION_SUMMARY_SELECT = {
  id: true,
  noteId: true,
  title: true,
  createdAt: true,
} satisfies Prisma.NoteVersionSelect;

const NOTE_VERSION_SELECT = {
  ...NOTE_VERSION_SUMMARY_SELECT,
  content: true,
} satisfies Prisma.NoteVersionSelect;

export type NoteVersionSummaryRecord = Prisma.NoteVersionGetPayload<{
  select: typeof NOTE_VERSION_SUMMARY_SELECT;
}>;

export type NoteVersionRecord = Prisma.NoteVersionGetPayload<{
  select: typeof NOTE_VERSION_SELECT;
}>;

export class NotesHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Participates in the caller's transaction (`tx`) rather than opening its
   * own - snapshot/purge must commit atomically with the content update that
   * triggers them (see NotesService.updateNote).
   */
  async snapshot(
    tx: Prisma.TransactionClient,
    noteId: string,
    content: Prisma.InputJsonValue,
    title: string,
  ): Promise<void> {
    await tx.noteVersion.create({ data: { noteId, content, title } });
  }

  async purgeOlderThan30Days(tx: Prisma.TransactionClient, noteId: string): Promise<void> {
    await tx.noteVersion.deleteMany({
      where: { noteId, createdAt: { lt: new Date(Date.now() - THIRTY_DAYS_MS) } },
    });
  }

  listForNote(noteId: string): Promise<NoteVersionSummaryRecord[]> {
    return this.prisma.noteVersion.findMany({
      where: { noteId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: NOTE_VERSION_SUMMARY_SELECT,
    });
  }

  getOneForNote(noteId: string, versionId: string): Promise<NoteVersionRecord | null> {
    return this.prisma.noteVersion.findFirst({
      where: { id: versionId, noteId },
      select: NOTE_VERSION_SELECT,
    });
  }
}
