import { Prisma, type PrismaClient } from "@note-taking-app/db";
import type { CreateTagRequest, UpdateTagRequest } from "@note-taking-app/shared";
import { AppError } from "../errors/app-error.js";
import { isUniqueConstraintError } from "../errors/prisma-errors.js";
import { TagsRepository, type TagRecord, type TagRecordWithCount } from "./tags-repository.js";

function tagNameTaken(): AppError {
  return new AppError("TAG_NAME_TAKEN", 409, "Tag name already exists");
}

function tagNotFound(): AppError {
  return new AppError("TAG_NOT_FOUND", 404, "Tag not found");
}

export class TagsService {
  constructor(
    private readonly repository: TagsRepository,
    private readonly prisma: PrismaClient,
  ) {}

  async createTag(userId: string, input: CreateTagRequest): Promise<TagRecordWithCount> {
    const existing = await this.repository.findByName(userId, input.name);
    if (existing) {
      throw tagNameTaken();
    }

    try {
      const created = await this.repository.create({
        userId,
        name: input.name,
        color: input.color,
      });
      return { ...created, noteCount: 0 };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw tagNameTaken();
      }
      throw error;
    }
  }

  listTags(userId: string): Promise<TagRecordWithCount[]> {
    return this.repository.listByUser(userId);
  }

  async updateTag(
    id: string,
    userId: string,
    input: UpdateTagRequest,
  ): Promise<TagRecordWithCount> {
    if (input.name !== undefined) {
      const existing = await this.repository.findByName(userId, input.name, id);
      if (existing) {
        throw tagNameTaken();
      }
    }

    let updated: TagRecord | null;
    try {
      updated = await this.repository.update(id, userId, input);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw tagNameTaken();
      }
      throw error;
    }

    if (!updated) {
      throw tagNotFound();
    }

    const noteCount = await this.repository.countActiveNotesForTag(id);
    return { ...updated, noteCount };
  }

  async deleteTag(id: string, userId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const txRepository = new TagsRepository(tx);

        const tag = await txRepository.findOwnedByIdWithActiveCount(id, userId);
        if (!tag) {
          throw tagNotFound();
        }

        if (tag.activeCount > 0) {
          throw new AppError("TAG_IN_USE", 409, "Tag is still in use");
        }

        const deleted = await txRepository.deleteOwned(id, userId);
        if (!deleted) {
          throw tagNotFound();
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
