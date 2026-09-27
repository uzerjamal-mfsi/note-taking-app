import type { Prisma, PrismaClient } from "@note-taking-app/db";

const SHARE_LINK_SELECT = {
  token: true,
  viewCount: true,
  expiresAt: true,
  createdAt: true,
} satisfies Prisma.SharedNoteSelect;

export type ShareLinkRecord = Prisma.SharedNoteGetPayload<{ select: typeof SHARE_LINK_SELECT }>;

export interface SharedNotePublicRecord {
  title: string;
  content: Prisma.JsonValue;
}

/** A share link is active when it exists and is not expired. Evaluated fresh on every call - never hoist this to a module-level constant, or "now" would freeze at import time. */
function activeWhere(): Prisma.SharedNoteWhereInput {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}

export class SharingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findActiveByNoteId(noteId: string): Promise<ShareLinkRecord | null> {
    return this.prisma.sharedNote.findFirst({
      where: { noteId, ...activeWhere() },
      select: SHARE_LINK_SELECT,
    });
  }

  /**
   * Replaces an existing, expired row for this note with a fresh one. Only
   * ever deletes a non-active row - a concurrently-created active link is
   * left alone, so the `create` below hits the `noteId` unique constraint
   * instead of silently clobbering it (see `SharingService.generateShareLink`'s
   * unique-constraint recovery path).
   */
  createForNote(noteId: string, token: string, expiresAt: Date | null): Promise<ShareLinkRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.sharedNote.deleteMany({ where: { noteId, NOT: activeWhere() } });
      return tx.sharedNote.create({
        data: { noteId, token, expiresAt },
        select: SHARE_LINK_SELECT,
      });
    });
  }

  async deleteActiveByNoteId(noteId: string): Promise<boolean> {
    const { count } = await this.prisma.sharedNote.deleteMany({
      where: { noteId, ...activeWhere() },
    });
    return count > 0;
  }

  /**
   * Atomically increments the view count of an active share link whose note
   * is not soft-deleted, then reads back the note's public fields. Returns
   * `null` without any side effect when the token doesn't match an active,
   * servable link (unknown, expired, or its note was soft-deleted). Both
   * steps run in one transaction so a concurrent revoke/delete can't land
   * between the increment and the read - the update's row lock holds the
   * row in place until this transaction commits.
   */
  async incrementIfActiveAndReadNote(token: string): Promise<SharedNotePublicRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.sharedNote.updateMany({
        where: { token, ...activeWhere(), note: { deletedAt: null } },
        data: { viewCount: { increment: 1 } },
      });

      if (count === 0) {
        return null;
      }

      const row = await tx.sharedNote.findUnique({
        where: { token },
        select: { note: { select: { title: true, content: true } } },
      });

      return row?.note ?? null;
    });
  }
}
