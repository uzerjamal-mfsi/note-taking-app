import type { Request, Response } from "express";
import type { NoteVersionDto, NoteVersionSummaryDto } from "@note-taking-app/shared";
import { toNoteDto } from "../notes/notes-controller.js";
import type { NoteVersionRecord, NoteVersionSummaryRecord } from "./notes-history-repository.js";
import type { NotesHistoryService } from "./notes-history-service.js";

function noteId(req: Request): string {
  return req.params.id as string;
}

function versionId(req: Request): string {
  return req.params.versionId as string;
}

function toSummaryDto(version: NoteVersionSummaryRecord): NoteVersionSummaryDto {
  return {
    id: version.id,
    noteId: version.noteId,
    title: version.title,
    createdAt: version.createdAt.toISOString(),
  };
}

function toVersionDto(version: NoteVersionRecord): NoteVersionDto {
  return {
    ...toSummaryDto(version),
    content: version.content as NoteVersionDto["content"],
  };
}

export class NotesHistoryController {
  constructor(private readonly service: NotesHistoryService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const versions = await this.service.listVersions(noteId(req), req.user!.id);
    res.status(200).json(versions.map(toSummaryDto));
  };

  get = async (req: Request, res: Response): Promise<void> => {
    const version = await this.service.getVersion(noteId(req), versionId(req), req.user!.id);
    res.status(200).json(toVersionDto(version));
  };

  restore = async (req: Request, res: Response): Promise<void> => {
    const note = await this.service.restoreVersion(noteId(req), versionId(req), req.user!.id);
    res.status(200).json(toNoteDto(note));
  };
}
