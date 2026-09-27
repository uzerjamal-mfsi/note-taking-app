import type { Request, Response } from "express";
import type { CreateTagRequest, TagDto, UpdateTagRequest } from "@note-taking-app/shared";
import type { TagRecordWithCount } from "./tags-repository.js";
import type { TagsService } from "./tags-service.js";

function tagId(req: Request): string {
  return req.params.id as string;
}

function toDto(tag: TagRecordWithCount): TagDto {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt.toISOString(),
    noteCount: tag.noteCount,
  };
}

export class TagsController {
  constructor(private readonly service: TagsService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const input = req.body as CreateTagRequest;
    const tag = await this.service.createTag(req.user!.id, input);
    res.status(201).json(toDto(tag));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const tags = await this.service.listTags(req.user!.id);
    res.status(200).json(tags.map(toDto));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const input = req.body as UpdateTagRequest;
    const tag = await this.service.updateTag(tagId(req), req.user!.id, input);
    res.status(200).json(toDto(tag));
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    await this.service.deleteTag(tagId(req), req.user!.id);
    res.status(204).send();
  };
}
