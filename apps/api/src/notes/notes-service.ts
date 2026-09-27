import type { Prisma, PrismaClient } from "@note-taking-app/db";
import type { ListNotesQuery } from "@note-taking-app/shared";
import { AppError } from "../errors/app-error.js";
import { isForeignKeyConstraintError } from "../errors/prisma-errors.js";
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

/**
 * Full-document plain-text extraction, backing `Note.searchText` (see
 * schema.prisma). Unlike `deriveTitle`, walks every top-level node rather
 * than just the first, joining each node's collected text with a single
 * space so top-level blocks (paragraphs, list, headings, ...) don't run
 * together; text within a node is concatenated exactly as `collectText`
 * already does for `deriveTitle` (no smart handling of hard breaks, etc.).
 */
export function extractSearchText(content: unknown): string {
  const doc = content as { content?: unknown[] } | null;
  const topLevelNodes = Array.isArray(doc?.content) ? doc.content : [];

  return topLevelNodes
    .map((node) => collectText(node).trim())
    .filter((text) => text.length > 0)
    .join(" ");
}

export class NotesService {
  constructor(
    private readonly repository: NotesRepository,
    private readonly prisma: PrismaClient,
  ) {}

  private async assertOwnsTags(userId: string, tagIds: string[] | undefined): Promise<void> {
    if (!tagIds || tagIds.length === 0) {
      return;
    }
    const uniqueTagIds = new Set(tagIds);
    const owned = await this.prisma.tag.findMany({
      where: { id: { in: tagIds }, userId },
      select: { id: true },
    });
    if (owned.length !== uniqueTagIds.size) {
      throw new AppError("TAG_NOT_FOUND", 422, "One or more tags were not found");
    }
  }

  async createNote(
    userId: string,
    content: Prisma.InputJsonValue,
    tagIds?: string[],
  ): Promise<NoteRecord> {
    await this.assertOwnsTags(userId, tagIds);
    try {
      return await this.repository.create({
        userId,
        title: deriveTitle(content),
        content,
        searchText: extractSearchText(content),
        tagIds,
      });
    } catch (error) {
      if (isForeignKeyConstraintError(error)) {
        throw new AppError("TAG_NOT_FOUND", 422, "One or more tags were not found");
      }
      throw error;
    }
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
    tagIds?: string[],
  ): Promise<NoteRecord> {
    await this.assertOwnsTags(userId, tagIds);
    let updated: NoteRecord | null;
    try {
      updated = await this.repository.updateOwned(id, userId, {
        title: deriveTitle(content),
        content,
        searchText: extractSearchText(content),
        tagIds,
      });
    } catch (error) {
      if (isForeignKeyConstraintError(error)) {
        throw new AppError("TAG_NOT_FOUND", 422, "One or more tags were not found");
      }
      throw error;
    }
    if (!updated) {
      throw new AppError("NOTE_NOT_FOUND", 404, "Note not found");
    }
    return updated;
  }

  async deleteNote(id: string, userId: string): Promise<void> {
    // Soft-delete and, only if that actually applied to an owned note, drop
    // its share link (if any) in the same transaction - a plain array-style
    // $transaction can't skip the second write when the first matches nothing,
    // and skipping matters: `id` is caller-supplied, so unconditionally
    // deleting by noteId alone could remove another user's share link.
    const deleted = await this.prisma.$transaction(async (tx) => {
      const softDeleted = await this.repository.softDeleteOwned(id, userId, tx);
      if (!softDeleted) {
        return false;
      }
      await tx.sharedNote.deleteMany({ where: { noteId: id } });
      return true;
    });

    if (!deleted) {
      throw new AppError("NOTE_NOT_FOUND", 404, "Note not found");
    }
  }
}
