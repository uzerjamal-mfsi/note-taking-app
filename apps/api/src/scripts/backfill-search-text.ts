import { prisma as defaultPrisma, type PrismaClient } from "@note-taking-app/db";
import { createLogger } from "../logger.js";
import { extractSearchText } from "../notes/notes-service.js";

const DEFAULT_BATCH_SIZE = 500;

export interface BackfillOptions {
  batchSize?: number;
}

/**
 * One-off, idempotent backfill for notes written before searchText/searchVector
 * existed (see design.md, Decision 1 / Migration Plan). Reuses the exact same
 * extractSearchText the application's write path uses, so backfilled rows are
 * indistinguishable from ones written after this shipped. Safe to re-run: a
 * note whose searchText already matches its current content is left untouched.
 */
export async function backfillSearchText(
  prisma: PrismaClient = defaultPrisma,
  options: BackfillOptions = {},
): Promise<number> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  let cursor: string | undefined;
  let updated = 0;

  for (;;) {
    const notes = await prisma.note.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, content: true, searchText: true },
    });

    if (notes.length === 0) {
      break;
    }

    for (const note of notes) {
      const searchText = extractSearchText(note.content);
      if (searchText !== note.searchText) {
        await prisma.note.update({ where: { id: note.id }, data: { searchText } });
        updated += 1;
      }
    }

    cursor = notes[notes.length - 1]!.id;
    if (notes.length < batchSize) {
      break;
    }
  }

  return updated;
}

/* v8 ignore start -- CLI entrypoint guard; only true when run directly (`tsx .../backfill-search-text.ts`), never when imported by tests */
const isMainModule = process.argv[1]?.endsWith("backfill-search-text.ts") ?? false;

if (isMainModule) {
  const count = await backfillSearchText();
  createLogger().info({ count }, "Backfilled searchText for note(s)");
  await defaultPrisma.$disconnect();
}
/* v8 ignore stop */
