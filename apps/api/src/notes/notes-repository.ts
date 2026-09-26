import type { Prisma, PrismaClient } from "@note-taking-app/db";

const NOTE_SELECT = {
  id: true,
  title: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NoteSelect;

export type NoteRecord = Prisma.NoteGetPayload<{ select: typeof NOTE_SELECT }>;

export interface CreateNoteInput {
  userId: string;
  title: string;
  content: Prisma.InputJsonValue;
}

export interface UpdateNoteInput {
  title: string;
  content: Prisma.InputJsonValue;
}

export class NotesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateNoteInput): Promise<NoteRecord> {
    return this.prisma.note.create({
      data: { userId: input.userId, title: input.title, content: input.content },
      select: NOTE_SELECT,
    });
  }

  findOwned(id: string, userId: string): Promise<NoteRecord | null> {
    return this.prisma.note.findFirst({
      where: { id, userId, deletedAt: null },
      select: NOTE_SELECT,
    });
  }

  listOwned(userId: string): Promise<NoteRecord[]> {
    return this.prisma.note.findMany({
      where: { userId, deletedAt: null },
      select: NOTE_SELECT,
    });
  }

  async updateOwned(id: string, userId: string, data: UpdateNoteInput): Promise<NoteRecord | null> {
    const { count } = await this.prisma.note.updateMany({
      where: { id, userId, deletedAt: null },
      data: { title: data.title, content: data.content },
    });

    if (count === 0) {
      return null;
    }

    return this.prisma.note.findUnique({ where: { id }, select: NOTE_SELECT });
  }

  async softDeleteOwned(id: string, userId: string): Promise<boolean> {
    const { count } = await this.prisma.note.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return count > 0;
  }
}
