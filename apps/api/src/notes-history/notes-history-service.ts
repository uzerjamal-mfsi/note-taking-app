import type { Prisma } from "@note-taking-app/db";
import { AppError } from "../errors/app-error.js";
import type { NoteRecord, NotesRepository } from "../notes/notes-repository.js";
import type { NotesService } from "../notes/notes-service.js";
import type {
  NoteVersionRecord,
  NoteVersionSummaryRecord,
  NotesHistoryRepository,
} from "./notes-history-repository.js";

function noteNotFound(): AppError {
  return new AppError("NOTE_NOT_FOUND", 404, "Note not found");
}

function versionNotFound(): AppError {
  return new AppError("VERSION_NOT_FOUND", 404, "Version not found");
}

export class NotesHistoryService {
  constructor(
    private readonly repository: NotesHistoryRepository,
    private readonly notesRepository: NotesRepository,
    private readonly notesService: NotesService,
  ) {}

  private async assertOwnsNote(noteId: string, userId: string): Promise<void> {
    const owned = await this.notesRepository.existsOwned(noteId, userId);
    if (!owned) {
      throw noteNotFound();
    }
  }

  async listVersions(noteId: string, userId: string): Promise<NoteVersionSummaryRecord[]> {
    await this.assertOwnsNote(noteId, userId);
    return this.repository.listForNote(noteId);
  }

  async getVersion(noteId: string, versionId: string, userId: string): Promise<NoteVersionRecord> {
    await this.assertOwnsNote(noteId, userId);
    const version = await this.repository.getOneForNote(noteId, versionId);
    if (!version) {
      throw versionNotFound();
    }
    return version;
  }

  /**
   * Restore has no snapshot/purge logic of its own - it looks up the target
   * version, then calls through to the same `updateNote` a `PATCH` uses,
   * which snapshots the note's current content before overwriting it (see
   * NotesService.updateNote) and returns the same Note DTO shape.
   */
  async restoreVersion(noteId: string, versionId: string, userId: string): Promise<NoteRecord> {
    await this.assertOwnsNote(noteId, userId);
    const version = await this.repository.getOneForNote(noteId, versionId);
    if (!version) {
      throw versionNotFound();
    }
    return this.notesService.updateNote(noteId, userId, version.content as Prisma.InputJsonValue);
  }
}
