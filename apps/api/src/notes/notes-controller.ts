import type { Request, Response } from "express";
import type { Prisma } from "@note-taking-app/db";
import type { CreateNoteRequest, NoteDto, UpdateNoteRequest } from "@note-taking-app/shared";
import type { NoteRecord } from "./notes-repository.js";
import type { NotesService } from "./notes-service.js";

function noteId(req: Request): string {
  return req.params.id as string;
}

function toDto(note: NoteRecord): NoteDto {
  return {
    id: note.id,
    title: note.title,
    content: note.content as NoteDto["content"],
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export class NotesController {
  constructor(private readonly service: NotesService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const { content } = req.body as CreateNoteRequest;
    const note = await this.service.createNote(req.user!.id, content as Prisma.InputJsonValue);
    res.status(201).json(toDto(note));
  };

  get = async (req: Request, res: Response): Promise<void> => {
    const note = await this.service.getNote(noteId(req), req.user!.id);
    res.status(200).json(toDto(note));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const notes = await this.service.listNotes(req.user!.id);
    res.status(200).json(notes.map(toDto));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { content } = req.body as UpdateNoteRequest;
    const note = await this.service.updateNote(
      noteId(req),
      req.user!.id,
      content as Prisma.InputJsonValue,
    );
    res.status(200).json(toDto(note));
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    await this.service.deleteNote(noteId(req), req.user!.id);
    res.status(204).send();
  };
}
