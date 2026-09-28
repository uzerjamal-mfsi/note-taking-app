import { isDeepStrictEqual } from "node:util";
import type { Prisma, PrismaClient } from "@note-taking-app/db";
import type { ListNotesQuery } from "@note-taking-app/shared";
import { AppError } from "../errors/app-error.js";
import { isForeignKeyConstraintError } from "../errors/prisma-errors.js";
import { NotesHistoryRepository } from "../notes-history/notes-history-repository.js";
import { NotesRepository } from "./notes-repository.js";
import type { NoteRecord } from "./notes-repository.js";

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
    private readonly historyRepository: NotesHistoryRepository,
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
    const title = deriveTitle(content);
    const searchText = extractSearchText(content);

    let updated: NoteRecord | null;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const current = await this.repository.findOwned(id, userId, tx);
        if (!current) {
          return null;
        }

        const result = await this.repository.updateOwned(
          id,
          userId,
          { title, content, searchText, tagIds },
          tx,
        );
        // The update can still no-op here (e.g. the note was concurrently
        // soft-deleted after the read above): only snapshot/purge once the
        // update has actually applied, so a request that ultimately fails
        // never leaves behind history side effects for content that was
        // never overwritten.
        if (!result) {
          return null;
        }

        // No-op update (identical content): skip the snapshot, and therefore
        // the purge that would otherwise run alongside it - see
        // Automatic version snapshot on update / Auto-purge in the
        // notes-history spec. `isDeepStrictEqual` compares own enumerable
        // properties regardless of order, which matters here since Postgres
        // JSONB storage doesn't preserve the original key order of a stored
        // document.
        if (!isDeepStrictEqual(current.content, content)) {
          await this.historyRepository.snapshot(
            tx,
            id,
            current.content as Prisma.InputJsonValue,
            current.title,
          );
          await this.historyRepository.purgeOlderThan30Days(tx, id);
        }

        return result;
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

/**
 * Shared wiring for `NotesService`, used by both notes-router.ts and
 * notes-history-router.ts so the two routers don't each build their own
 * separate instance. notes-history-router.ts also needs its own
 * `NotesHistoryRepository` (for `NotesHistoryService`'s list/view/restore
 * lookups) - passing it in here lets both routers share that one instance
 * instead of each constructing their own equivalent, stateless wrapper
 * around the same `prisma` client.
 */
export function createNotesService(
  prisma: PrismaClient,
  historyRepository: NotesHistoryRepository = new NotesHistoryRepository(prisma),
): NotesService {
  return new NotesService(new NotesRepository(prisma), prisma, historyRepository);
}
