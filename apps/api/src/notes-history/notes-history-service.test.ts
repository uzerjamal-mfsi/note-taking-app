import { describe, expect, it, vi } from "vitest";
import type { NoteRecord, NotesRepository } from "../notes/notes-repository.js";
import type { NotesService } from "../notes/notes-service.js";
import type {
  NoteVersionRecord,
  NoteVersionSummaryRecord,
  NotesHistoryRepository,
} from "./notes-history-repository.js";
import { NotesHistoryService } from "./notes-history-service.js";

function makeHistoryRepository(): NotesHistoryRepository {
  return {
    snapshot: vi.fn(),
    purgeOlderThan30Days: vi.fn(),
    listForNote: vi.fn(),
    getOneForNote: vi.fn(),
  } as unknown as NotesHistoryRepository;
}

function makeNotesRepository(): NotesRepository {
  return {
    existsOwned: vi.fn(),
  } as unknown as NotesRepository;
}

function makeNotesService(): NotesService {
  return {
    updateNote: vi.fn(),
  } as unknown as NotesService;
}

const CONTENT = { type: "doc", content: [{ type: "text", text: "Hello" }] };

const SUMMARY: NoteVersionSummaryRecord = {
  id: "version-1",
  noteId: "note-1",
  title: "Hello",
  createdAt: new Date(),
};

const VERSION: NoteVersionRecord = { ...SUMMARY, content: CONTENT };

describe("NotesHistoryService", () => {
  describe("listVersions", () => {
    it("throws NOTE_NOT_FOUND (404) when the caller doesn't own the note", async () => {
      const repository = makeHistoryRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(false);
      const service = new NotesHistoryService(repository, notesRepository, makeNotesService());

      await expect(service.listVersions("note-1", "user-1")).rejects.toMatchObject({
        code: "NOTE_NOT_FOUND",
        status: 404,
      });
      expect(repository.listForNote).not.toHaveBeenCalled();
    });

    it("returns the note's versions when owned", async () => {
      const repository = makeHistoryRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(true);
      vi.mocked(repository.listForNote).mockResolvedValue([SUMMARY]);
      const service = new NotesHistoryService(repository, notesRepository, makeNotesService());

      const result = await service.listVersions("note-1", "user-1");

      expect(result).toEqual([SUMMARY]);
      expect(repository.listForNote).toHaveBeenCalledWith("note-1");
    });
  });

  describe("getVersion", () => {
    it("throws NOTE_NOT_FOUND (404) when the caller doesn't own the note", async () => {
      const repository = makeHistoryRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(false);
      const service = new NotesHistoryService(repository, notesRepository, makeNotesService());

      await expect(service.getVersion("note-1", "version-1", "user-1")).rejects.toMatchObject({
        code: "NOTE_NOT_FOUND",
        status: 404,
      });
      expect(repository.getOneForNote).not.toHaveBeenCalled();
    });

    it("throws VERSION_NOT_FOUND (404) when versionId doesn't exist or belongs to a different note", async () => {
      const repository = makeHistoryRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(true);
      vi.mocked(repository.getOneForNote).mockResolvedValue(null);
      const service = new NotesHistoryService(repository, notesRepository, makeNotesService());

      await expect(service.getVersion("note-1", "version-1", "user-1")).rejects.toMatchObject({
        code: "VERSION_NOT_FOUND",
        status: 404,
      });
    });

    it("returns the version, including content, when owned and matching", async () => {
      const repository = makeHistoryRepository();
      const notesRepository = makeNotesRepository();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(true);
      vi.mocked(repository.getOneForNote).mockResolvedValue(VERSION);
      const service = new NotesHistoryService(repository, notesRepository, makeNotesService());

      const result = await service.getVersion("note-1", "version-1", "user-1");

      expect(result).toEqual(VERSION);
      expect(repository.getOneForNote).toHaveBeenCalledWith("note-1", "version-1");
    });
  });

  describe("restoreVersion", () => {
    it("throws NOTE_NOT_FOUND (404) when the caller doesn't own the note", async () => {
      const repository = makeHistoryRepository();
      const notesRepository = makeNotesRepository();
      const notesService = makeNotesService();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(false);
      const service = new NotesHistoryService(repository, notesRepository, notesService);

      await expect(service.restoreVersion("note-1", "version-1", "user-1")).rejects.toMatchObject({
        code: "NOTE_NOT_FOUND",
        status: 404,
      });
      expect(notesService.updateNote).not.toHaveBeenCalled();
    });

    it("throws VERSION_NOT_FOUND (404) when versionId doesn't exist or belongs to a different note", async () => {
      const repository = makeHistoryRepository();
      const notesRepository = makeNotesRepository();
      const notesService = makeNotesService();
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(true);
      vi.mocked(repository.getOneForNote).mockResolvedValue(null);
      const service = new NotesHistoryService(repository, notesRepository, notesService);

      await expect(service.restoreVersion("note-1", "version-1", "user-1")).rejects.toMatchObject({
        code: "VERSION_NOT_FOUND",
        status: 404,
      });
      expect(notesService.updateNote).not.toHaveBeenCalled();
    });

    it("calls through to notesService.updateNote with the target version's content", async () => {
      const repository = makeHistoryRepository();
      const notesRepository = makeNotesRepository();
      const notesService = makeNotesService();
      const updatedNote: NoteRecord = {
        id: "note-1",
        title: "Hello",
        content: CONTENT,
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      };
      vi.mocked(notesRepository.existsOwned).mockResolvedValue(true);
      vi.mocked(repository.getOneForNote).mockResolvedValue(VERSION);
      vi.mocked(notesService.updateNote).mockResolvedValue(updatedNote);
      const service = new NotesHistoryService(repository, notesRepository, notesService);

      const result = await service.restoreVersion("note-1", "version-1", "user-1");

      expect(notesService.updateNote).toHaveBeenCalledWith("note-1", "user-1", VERSION.content);
      expect(result).toBe(updatedNote);
    });
  });
});
