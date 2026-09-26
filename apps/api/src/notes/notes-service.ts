import type { Prisma } from "@note-taking-app/db";
import type { ListNotesQuery } from "@note-taking-app/shared";
import { AppError } from "../errors/app-error.js";
import type { NoteRecord, NotesRepository } from "./notes-repository.js";

const MAX_TITLE_LENGTH = 120;
const FALLBACK_TITLE = "Untitled";

type ProseMirrorNode = Record<string, unknown>;

function collectText(node: unknown): string {
  if (typeof node !== "object" || node === null) {
    return "";
  }

  const record = node as ProseMirrorNode;
  const ownText = typeof record.text === "string" ? record.text : "";

  const children = Array.isArray(record.content) ? record.content : [];
  const childText = children.map(collectText).join("");

  return ownText + childText;
}

export function deriveTitle(content: unknown): string {
  const doc = content as { content?: unknown[] } | null;
  const firstNode = Array.isArray(doc?.content) ? doc.content[0] : undefined;

  const text = collectText(firstNode).trim();
  if (text.length === 0) {
    return FALLBACK_TITLE;
  }

  return text.slice(0, MAX_TITLE_LENGTH);
}

export class NotesService {
  constructor(private readonly repository: NotesRepository) {}

  createNote(userId: string, content: Prisma.InputJsonValue): Promise<NoteRecord> {
    return this.repository.create({ userId, title: deriveTitle(content), content });
  }

  async getNote(id: string, userId: string): Promise<NoteRecord> {
    const note = await this.repository.findOwned(id, userId);
    if (!note) {
      throw new AppError("NOTE_NOT_FOUND", 404, "Note not found");
    }
    return note;
  }

  async listNotes(
    userId: string,
    query: ListNotesQuery,
  ): Promise<{
    notes: NoteRecord[];
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  }> {
    const { notes, total } = await this.repository.list(userId, query);
    const totalPages = total === 0 ? 0 : Math.ceil(total / query.pageSize);

    return {
      notes,
      total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1,
    };
  }

  async updateNote(
    id: string,
    userId: string,
    content: Prisma.InputJsonValue,
  ): Promise<NoteRecord> {
    const updated = await this.repository.updateOwned(id, userId, {
      title: deriveTitle(content),
      content,
    });
    if (!updated) {
      throw new AppError("NOTE_NOT_FOUND", 404, "Note not found");
    }
    return updated;
  }

  async deleteNote(id: string, userId: string): Promise<void> {
    const deleted = await this.repository.softDeleteOwned(id, userId);
    if (!deleted) {
      throw new AppError("NOTE_NOT_FOUND", 404, "Note not found");
    }
  }
}
