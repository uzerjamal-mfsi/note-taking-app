import type { Request, Response } from "express";
import type {
  GenerateShareLinkRequest,
  SharedNotePublicDto,
  ShareLinkDto,
} from "@note-taking-app/shared";
import type { ShareLinkRecord } from "./sharing-repository.js";
import type { SharingService } from "./sharing-service.js";

function noteId(req: Request): string {
  return req.params.id as string;
}

function toDto(link: ShareLinkRecord): ShareLinkDto {
  return {
    token: link.token,
    viewCount: link.viewCount,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    createdAt: link.createdAt.toISOString(),
  };
}

export class SharingController {
  constructor(private readonly service: SharingService) {}

  generate = async (req: Request, res: Response): Promise<void> => {
    const { expiresAt } = req.body as GenerateShareLinkRequest;
    const { link, created } = await this.service.generateShareLink(
      noteId(req),
      req.user!.id,
      expiresAt ? new Date(expiresAt) : undefined,
    );
    res.status(created ? 201 : 200).json(toDto(link));
  };

  get = async (req: Request, res: Response): Promise<void> => {
    const link = await this.service.getShareLink(noteId(req), req.user!.id);
    res.status(200).json(toDto(link));
  };

  revoke = async (req: Request, res: Response): Promise<void> => {
    await this.service.revokeShareLink(noteId(req), req.user!.id);
    res.status(204).send();
  };

  readPublic = async (req: Request, res: Response): Promise<void> => {
    const record = await this.service.readPublicByToken(req.params.token as string);
    const dto: SharedNotePublicDto = {
      title: record.title,
      content: record.content as SharedNotePublicDto["content"],
    };
    res.status(200).json(dto);
  };
}
