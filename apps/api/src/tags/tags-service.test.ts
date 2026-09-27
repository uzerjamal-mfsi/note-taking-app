import { Prisma, type PrismaClient } from "@note-taking-app/db";
import { describe, expect, it, vi } from "vitest";
import type { TagRecord, TagsRepository } from "./tags-repository.js";
import { TagsService } from "./tags-service.js";

function makeRepository(): TagsRepository {
  return {
    create: vi.fn(),
    findOwnedById: vi.fn(),
    findByName: vi.fn(),
    listByUser: vi.fn(),
    update: vi.fn(),
    countActiveNotesForTag: vi.fn(),
    deleteOwned: vi.fn(),
  } as unknown as TagsRepository;
}

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
  });
}

function makeTx() {
  return {
    tag: { findFirst: vi.fn(), deleteMany: vi.fn() },
    noteTag: { count: vi.fn() },
  };
}

function makePrisma(tx: ReturnType<typeof makeTx>): PrismaClient {
  return {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaClient;
}

const RECORD: TagRecord = {
  id: "tag-1",
  name: "Work",
  color: "#FF8800",
  createdAt: new Date(),
};

describe("TagsService", () => {
  describe("createTag", () => {
    it("creates the tag and returns it with noteCount 0", async () => {
      const repository = makeRepository();
      vi.mocked(repository.findByName).mockResolvedValue(null);
      vi.mocked(repository.create).mockResolvedValue(RECORD);
      const service = new TagsService(repository, makePrisma(makeTx()));

      const result = await service.createTag("user-1", { name: "Work", color: "#FF8800" });

      expect(repository.create).toHaveBeenCalledWith({
        userId: "user-1",
        name: "Work",
        color: "#FF8800",
      });
      expect(result).toEqual({ ...RECORD, noteCount: 0 });
    });

    it("throws TAG_NAME_TAKEN (409) when the pre-check finds an existing tag", async () => {
      const repository = makeRepository();
      vi.mocked(repository.findByName).mockResolvedValue({ id: "existing" });
      const service = new TagsService(repository, makePrisma(makeTx()));

      await expect(
        service.createTag("user-1", { name: "Work", color: "#FF8800" }),
      ).rejects.toMatchObject({ code: "TAG_NAME_TAKEN", status: 409 });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("throws TAG_NAME_TAKEN (409) when the DB unique constraint rejects the write", async () => {
      const repository = makeRepository();
      vi.mocked(repository.findByName).mockResolvedValue(null);
      vi.mocked(repository.create).mockRejectedValue(uniqueConstraintError());
      const service = new TagsService(repository, makePrisma(makeTx()));

      await expect(
        service.createTag("user-1", { name: "Work", color: "#FF8800" }),
      ).rejects.toMatchObject({ code: "TAG_NAME_TAKEN", status: 409 });
    });
  });

  describe("listTags", () => {
    it("returns the repository's tags with counts unchanged", async () => {
      const repository = makeRepository();
      vi.mocked(repository.listByUser).mockResolvedValue([{ ...RECORD, noteCount: 3 }]);
      const service = new TagsService(repository, makePrisma(makeTx()));

      const result = await service.listTags("user-1");

      expect(repository.listByUser).toHaveBeenCalledWith("user-1");
      expect(result).toEqual([{ ...RECORD, noteCount: 3 }]);
    });
  });

  describe("updateTag", () => {
    it("updates the tag and returns it with its current noteCount", async () => {
      const repository = makeRepository();
      vi.mocked(repository.findByName).mockResolvedValue(null);
      vi.mocked(repository.update).mockResolvedValue({ ...RECORD, name: "Job" });
      vi.mocked(repository.countActiveNotesForTag).mockResolvedValue(2);
      const service = new TagsService(repository, makePrisma(makeTx()));

      const result = await service.updateTag("tag-1", "user-1", { name: "Job" });

      expect(repository.findByName).toHaveBeenCalledWith("user-1", "Job", "tag-1");
      expect(result).toEqual({ ...RECORD, name: "Job", noteCount: 2 });
    });

    it("skips the duplicate-name check when name is not being changed", async () => {
      const repository = makeRepository();
      vi.mocked(repository.update).mockResolvedValue(RECORD);
      vi.mocked(repository.countActiveNotesForTag).mockResolvedValue(0);
      const service = new TagsService(repository, makePrisma(makeTx()));

      await service.updateTag("tag-1", "user-1", { color: "#00FF00" });

      expect(repository.findByName).not.toHaveBeenCalled();
    });

    it("throws TAG_NAME_TAKEN (409) when the pre-check finds a colliding tag", async () => {
      const repository = makeRepository();
      vi.mocked(repository.findByName).mockResolvedValue({ id: "other-tag" });
      const service = new TagsService(repository, makePrisma(makeTx()));

      await expect(service.updateTag("tag-1", "user-1", { name: "Job" })).rejects.toMatchObject({
        code: "TAG_NAME_TAKEN",
        status: 409,
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("throws TAG_NAME_TAKEN (409) when the DB unique constraint rejects the write", async () => {
      const repository = makeRepository();
      vi.mocked(repository.findByName).mockResolvedValue(null);
      vi.mocked(repository.update).mockRejectedValue(uniqueConstraintError());
      const service = new TagsService(repository, makePrisma(makeTx()));

      await expect(service.updateTag("tag-1", "user-1", { name: "Job" })).rejects.toMatchObject({
        code: "TAG_NAME_TAKEN",
        status: 409,
      });
    });

    it("throws TAG_NOT_FOUND (404) when the repository reports no match", async () => {
      const repository = makeRepository();
      vi.mocked(repository.findByName).mockResolvedValue(null);
      vi.mocked(repository.update).mockResolvedValue(null);
      const service = new TagsService(repository, makePrisma(makeTx()));

      await expect(service.updateTag("tag-1", "user-1", { name: "Job" })).rejects.toMatchObject({
        code: "TAG_NOT_FOUND",
        status: 404,
      });
    });
  });

  describe("deleteTag", () => {
    it("throws TAG_NOT_FOUND (404) when the tag isn't owned by the caller", async () => {
      const tx = makeTx();
      tx.tag.findFirst.mockResolvedValue(null);
      const service = new TagsService(makeRepository(), makePrisma(tx));

      await expect(service.deleteTag("tag-1", "user-1")).rejects.toMatchObject({
        code: "TAG_NOT_FOUND",
        status: 404,
      });
      expect(tx.tag.deleteMany).not.toHaveBeenCalled();
    });

    it("throws TAG_IN_USE (409) when the active note count is non-zero, without deleting", async () => {
      const tx = makeTx();
      tx.tag.findFirst.mockResolvedValue({ id: "tag-1", _count: { notes: 2 } });
      const service = new TagsService(makeRepository(), makePrisma(tx));

      await expect(service.deleteTag("tag-1", "user-1")).rejects.toMatchObject({
        code: "TAG_IN_USE",
        status: 409,
      });
      expect(tx.tag.deleteMany).not.toHaveBeenCalled();
    });

    it("deletes the tag when the active note count is zero", async () => {
      const tx = makeTx();
      tx.tag.findFirst.mockResolvedValue({ id: "tag-1", _count: { notes: 0 } });
      tx.tag.deleteMany.mockResolvedValue({ count: 1 });
      const service = new TagsService(makeRepository(), makePrisma(tx));

      await expect(service.deleteTag("tag-1", "user-1")).resolves.toBeUndefined();
      expect(tx.tag.deleteMany).toHaveBeenCalledWith({ where: { id: "tag-1", userId: "user-1" } });
    });
  });
});
