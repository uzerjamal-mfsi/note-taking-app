import type { Prisma, PrismaClient } from "@note-taking-app/db";

/** Structural subset satisfied by both `PrismaClient` and `Prisma.TransactionClient`. */
export type TagsPrismaClient = Pick<PrismaClient, "tag" | "noteTag">;

const TAG_SELECT = {
  id: true,
  name: true,
  color: true,
  createdAt: true,
} satisfies Prisma.TagSelect;

export type TagRecord = Prisma.TagGetPayload<{ select: typeof TAG_SELECT }>;
export type TagRecordWithCount = TagRecord & { noteCount: number };

export interface CreateTagInput {
  userId: string;
  name: string;
  color: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
}

export class TagsRepository {
  constructor(private readonly prisma: TagsPrismaClient) {}

  create(input: CreateTagInput): Promise<TagRecord> {
    return this.prisma.tag.create({
      data: { userId: input.userId, name: input.name, color: input.color },
      select: TAG_SELECT,
    });
  }

  /** General-purpose ownership lookup; no current call site needs it standalone (`deleteTag` uses `findOwnedByIdWithActiveCount` instead), kept for parity with `NotesRepository.findOwned`. */
  findOwnedById(id: string, userId: string): Promise<TagRecord | null> {
    return this.prisma.tag.findFirst({
      where: { id, userId },
      select: TAG_SELECT,
    });
  }

  async findOwnedByIdWithActiveCount(
    id: string,
    userId: string,
  ): Promise<{ id: string; activeCount: number } | null> {
    const tag = await this.prisma.tag.findFirst({
      where: { id, userId },
      select: {
        id: true,
        _count: { select: { notes: { where: { note: { deletedAt: null } } } } },
      },
    });
    if (!tag) {
      return null;
    }
    return { id: tag.id, activeCount: tag._count.notes };
  }

  findByName(userId: string, name: string, excludeId?: string): Promise<{ id: string } | null> {
    return this.prisma.tag.findFirst({
      where: {
        userId,
        name: { equals: name, mode: "insensitive" },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
  }

  async listByUser(userId: string): Promise<TagRecordWithCount[]> {
    const tags = await this.prisma.tag.findMany({
      where: { userId },
      select: {
        ...TAG_SELECT,
        _count: { select: { notes: { where: { note: { deletedAt: null } } } } },
      },
    });

    return tags.map(({ _count, ...tag }) => ({ ...tag, noteCount: _count.notes }));
  }

  async update(id: string, userId: string, data: UpdateTagInput): Promise<TagRecord | null> {
    const { count } = await this.prisma.tag.updateMany({
      where: { id, userId },
      data,
    });

    if (count === 0) {
      return null;
    }

    return this.prisma.tag.findUnique({ where: { id }, select: TAG_SELECT });
  }

  countActiveNotesForTag(tagId: string): Promise<number> {
    return this.prisma.noteTag.count({
      where: { tagId, note: { deletedAt: null } },
    });
  }

  async deleteOwned(id: string, userId: string): Promise<boolean> {
    const { count } = await this.prisma.tag.deleteMany({ where: { id, userId } });
    return count > 0;
  }
}
