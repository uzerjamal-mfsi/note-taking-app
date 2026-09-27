import { generateSecureToken } from "../crypto/secure-token.js";
import { AppError } from "../errors/app-error.js";
import { isUniqueConstraintError } from "../errors/prisma-errors.js";
import type { NotesRepository } from "../notes/notes-repository.js";
import type {
  SharedNotePublicRecord,
  ShareLinkRecord,
  SharingRepository,
} from "./sharing-repository.js";

export interface GenerateShareLinkResult {
  link: ShareLinkRecord;
  created: boolean;
}

function noteNotFound(): AppError {
  return new AppError("NOTE_NOT_FOUND", 404, "Note not found");
}

function shareNotFound(): AppError {
  return new AppError("SHARE_NOT_FOUND", 404, "Share link not found");
}

// Unlike refresh tokens, share tokens are deliberately stored and looked up
// as plaintext: a share token is a capability meant to be handed out (it's
// the URL itself), not a bearer credential the holder authenticates with
// like a refresh token, so hashing it at rest wouldn't change who can use
// a leaked link - only who can read it out of a DB dump. Revisit if that
// threat model changes.

export class SharingService {
  constructor(
    private readonly repository: SharingRepository,
    private readonly notesRepository: NotesRepository,
  ) {}

  private async assertOwnsNote(noteId: string, userId: string): Promise<void> {
    const owned = await this.notesRepository.existsOwned(noteId, userId);
    if (!owned) {
      throw noteNotFound();
    }
  }

  async generateShareLink(
    noteId: string,
    userId: string,
    expiresAt?: Date,
  ): Promise<GenerateShareLinkResult> {
    await this.assertOwnsNote(noteId, userId);

    const existing = await this.repository.findActiveByNoteId(noteId);
    if (existing) {
      return { link: existing, created: false };
    }

    try {
      const created = await this.repository.createForNote(
        noteId,
        generateSecureToken(),
        expiresAt ?? null,
      );
      return { link: created, created: true };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // Lost a race with a concurrent generate for the same note: return
        // whatever the winner created rather than erroring.
        const concurrent = await this.repository.findActiveByNoteId(noteId);
        if (concurrent) {
          return { link: concurrent, created: false };
        }
      }
      throw error;
    }
  }

  async getShareLink(noteId: string, userId: string): Promise<ShareLinkRecord> {
    await this.assertOwnsNote(noteId, userId);

    const link = await this.repository.findActiveByNoteId(noteId);
    if (!link) {
      throw shareNotFound();
    }
    return link;
  }

  async revokeShareLink(noteId: string, userId: string): Promise<void> {
    await this.assertOwnsNote(noteId, userId);

    const deleted = await this.repository.deleteActiveByNoteId(noteId);
    if (!deleted) {
      throw shareNotFound();
    }
  }

  async readPublicByToken(token: string): Promise<SharedNotePublicRecord> {
    const result = await this.repository.incrementIfActiveAndReadNote(token);
    if (!result) {
      throw shareNotFound();
    }
    return result;
  }
}
