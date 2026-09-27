import type { Prisma, PrismaClient } from "@note-taking-app/db";
import type { ListNotesQuery } from "@note-taking-app/shared";

export const NOTE_TAGS_SELECT = {
  select: { tag: { select: { id: true, name: true, color: true } } },
} satisfies Prisma.Note$tagsArgs;

const NOTE_SELECT = {
  id: true,
  title: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  tags: NOTE_TAGS_SELECT,
} satisfies Prisma.NoteSelect;

export type NoteRecord = Prisma.NoteGetPayload<{ select: typeof NOTE_SELECT }>;

export interface CreateNoteInput {
  userId: string;
  title: string;
  content: Prisma.InputJsonValue;
  searchText: string;
  tagIds?: string[];
}

export interface UpdateNoteInput {
  title: string;
  content: Prisma.InputJsonValue;
  searchText: string;
  tagIds?: string[];
}

export class NotesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateNoteInput): Promise<NoteRecord> {
    return this.prisma.note.create({
      data: {
        userId: input.userId,
        title: input.title,
        content: input.content,
        searchText: input.searchText,
        ...(input.tagIds && input.tagIds.length > 0
          ? { tags: { create: input.tagIds.map((tagId) => ({ tagId })) } }
          : {}),
      },
      select: NOTE_SELECT,
    });
  }

  findOwned(id: string, userId: string): Promise<NoteRecord | null> {
    return this.prisma.note.findFirst({
      where: { id, userId, deletedAt: null },
      select: NOTE_SELECT,
    });
  }

  async list(
    userId: string,
    query: ListNotesQuery,
  ): Promise<{ notes: NoteRecord[]; total: number }> {
    const where: Prisma.NoteWhereInput = {
      userId,
      deletedAt: null,
      ...(query.tags && query.tags.length > 0
        ? { tags: { some: { tag: { userId, name: { in: query.tags, mode: "insensitive" } } } } }
        : {}),
    };
    const orderBy: Prisma.NoteOrderByWithRelationInput[] = [
      { [query.sortBy]: query.sortDir },
      { id: query.sortDir },
    ];

    const [total, notes] = await this.prisma.$transaction([
      this.prisma.note.count({ where }),
      this.prisma.note.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: NOTE_SELECT,
      }),
    ]);

    return { notes, total };
  }

  async updateOwned(id: string, userId: string, data: UpdateNoteInput): Promise<NoteRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.note.updateMany({
        where: { id, userId, deletedAt: null },
        data: { title: data.title, content: data.content, searchText: data.searchText },
      });

      if (count === 0) {
        return null;
      }

      if (data.tagIds !== undefined) {
        await tx.noteTag.deleteMany({ where: { noteId: id } });
        if (data.tagIds.length > 0) {
          await tx.noteTag.createMany({
            data: data.tagIds.map((tagId) => ({ noteId: id, tagId })),
          });
        }
      }

      return tx.note.findUnique({ where: { id }, select: NOTE_SELECT });
    });
  }

  async softDeleteOwned(id: string, userId: string): Promise<boolean> {
    const { count } = await this.prisma.note.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return count > 0;
  }
}
