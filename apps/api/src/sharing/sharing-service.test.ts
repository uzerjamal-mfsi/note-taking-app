import { Prisma } from "@note-taking-app/db";
import { describe, expect, it, vi } from "vitest";
import type { NotesRepository } from "../notes/notes-repository.js";
import type { ShareLinkRecord, SharingRepository } from "./sharing-repository.js";
import { SharingService } from "./sharing-service.js";

function makeRepository(): SharingRepository {
  return {
    findActiveByNoteId: vi.fn(),
    createForNote: vi.fn(),
    deleteActiveByNoteId: vi.fn(),
    incrementIfActiveAndReadNote: vi.fn(),
  } as unknown as SharingRepository;
}

function makeNotesRepository(): NotesRepository {
  return {
    existsOwned: vi.fn(),
  } as unknown as NotesRepository;
}

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
  });
}

const LINK: ShareLinkRecord = {
  token: "tok-1",
  viewCount: 0,
  expiresAt: null,
  createdAt: new Date(),
};

describe("SharingService", () => {
  describe("generateShareLink", () => {
    it("throws NOTE_NOT_FOUND (404) when the caller doesn't own the note", async () => {
      const repository = makeRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(false);
      const service = new SharingService(repository, notesRepository);

      await expect(service.generateShareLink("note-1", "user-1")).rejects.toMatchObject({
        code: "NOTE_NOT_FOUND",
        status: 404,
      });
      expect(repository.createForNote).not.toHaveBeenCalled();
    });

    it("creates a new link when none exists", async () => {
      const repository = makeRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(true);
      vi.mocked(repository.findActiveByNoteId).mockResolvedValue(null);
      vi.mocked(repository.createForNote).mockResolvedValue(LINK);
      const service = new SharingService(repository, notesRepository);

      const result = await service.generateShareLink("note-1", "user-1");

      expect(result).toEqual({ link: LINK, created: true });
      expect(repository.createForNote).toHaveBeenCalledWith("note-1", expect.any(String), null);
    });

    it("passes the given expiresAt through to the repository", async () => {
      const repository = makeRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(true);
      vi.mocked(repository.findActiveByNoteId).mockResolvedValue(null);
      vi.mocked(repository.createForNote).mockResolvedValue(LINK);
      const service = new SharingService(repository, notesRepository);
      const expiresAt = new Date(Date.now() + 60_000);

      await service.generateShareLink("note-1", "user-1", expiresAt);

      expect(repository.createForNote).toHaveBeenCalledWith(
        "note-1",
        expect.any(String),
        expiresAt,
      );
    });

    it("returns the existing active link unchanged without creating (idempotent)", async () => {
      const repository = makeRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(true);
      vi.mocked(repository.findActiveByNoteId).mockResolvedValue(LINK);
      const service = new SharingService(repository, notesRepository);

      const result = await service.generateShareLink("note-1", "user-1", new Date());

      expect(result).toEqual({ link: LINK, created: false });
      expect(repository.createForNote).not.toHaveBeenCalled();
    });

    it("returns the concurrently-created link when create loses a unique-constraint race", async () => {
      const repository = makeRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(true);
      vi.mocked(repository.findActiveByNoteId)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(LINK);
      vi.mocked(repository.createForNote).mockRejectedValue(uniqueConstraintError());
      const service = new SharingService(repository, notesRepository);

      const result = await service.generateShareLink("note-1", "user-1");

      expect(result).toEqual({ link: LINK, created: false });
    });
  });

  describe("getShareLink", () => {
    it("throws NOTE_NOT_FOUND (404) when the caller doesn't own the note", async () => {
      const repository = makeRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(false);
      const service = new SharingService(repository, notesRepository);

      await expect(service.getShareLink("note-1", "user-1")).rejects.toMatchObject({
        code: "NOTE_NOT_FOUND",
        status: 404,
      });
    });

    it("throws SHARE_NOT_FOUND (404) when the note has no active link", async () => {
      const repository = makeRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(true);
      vi.mocked(repository.findActiveByNoteId).mockResolvedValue(null);
      const service = new SharingService(repository, notesRepository);

      await expect(service.getShareLink("note-1", "user-1")).rejects.toMatchObject({
        code: "SHARE_NOT_FOUND",
        status: 404,
      });
    });

    it("returns the active link", async () => {
      const repository = makeRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(true);
      vi.mocked(repository.findActiveByNoteId).mockResolvedValue(LINK);
      const service = new SharingService(repository, notesRepository);

      expect(await service.getShareLink("note-1", "user-1")).toEqual(LINK);
    });
  });

  describe("revokeShareLink", () => {
    it("throws NOTE_NOT_FOUND (404) when the caller doesn't own the note", async () => {
      const repository = makeRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(false);
      const service = new SharingService(repository, notesRepository);

      await expect(service.revokeShareLink("note-1", "user-1")).rejects.toMatchObject({
        code: "NOTE_NOT_FOUND",
        status: 404,
      });
      expect(repository.deleteActiveByNoteId).not.toHaveBeenCalled();
    });

    it("throws SHARE_NOT_FOUND (404) when there is no active link to revoke", async () => {
      const repository = makeRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(true);
      vi.mocked(repository.deleteActiveByNoteId).mockResolvedValue(false);
      const service = new SharingService(repository, notesRepository);

      await expect(service.revokeShareLink("note-1", "user-1")).rejects.toMatchObject({
        code: "SHARE_NOT_FOUND",
        status: 404,
      });
    });

    it("deletes the active link", async () => {
      const repository = makeRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(true);
      vi.mocked(repository.deleteActiveByNoteId).mockResolvedValue(true);
      const service = new SharingService(repository, notesRepository);

      await service.revokeShareLink("note-1", "user-1");

      expect(repository.deleteActiveByNoteId).toHaveBeenCalledWith("note-1");
    });
  });
});
